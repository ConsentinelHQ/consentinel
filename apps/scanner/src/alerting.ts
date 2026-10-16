import {
  diffScans,
  findPreviousScans,
  getScan,
  listAlertRecipients,
  listExternalAlertRecipients,
  can,
  getBillingState,
  getSlackTargetForSite,
  type Database,
  type DiffItem,
} from "@consentinel/db";
import { sendRegressionAlert } from "@consentinel/notify";
import type { ScannerConfig } from "./config.js";
import { openJiraIssueForRegression } from "./jira-sync.js";

/**
 * Emails the org when a scheduled scan turns up a critical finding that was not
 * in the previous scan.
 *
 * Only criticals, and only on scheduled runs. A manual scan is someone already
 * looking at the screen, and a new warning is not worth waking anyone for.
 */
export async function alertOnRegression(
  db: Database,
  scanId: string,
  config: ScannerConfig,
): Promise<void> {
  const scan = await getScan(db, scanId);
  if (!scan?.siteId) return; // anonymous public scan, nobody to tell
  // Scheduled, deploy and Jira-triggered scans alert; manual ones are the user looking already.
  if (scan.trigger !== "scheduled" && scan.trigger !== "deploy" && scan.trigger !== "jira") return;

  const added = await newCriticalFindings(db, scan);
  if (!added || added.length === 0) return;

  // A Jira-triggered scan reports back on its own ticket instead of opening another.
  if (scan.trigger !== "jira") {
    await openJiraIssueForRegression(db, scan, added, config);
  }

  const recipients = await listAlertRecipients(db, scan.siteId);
  const to = [...new Set(recipients.map((r) => r.email))].filter((e) => e.length > 0);
  const memberSet = new Set(to);
  const external = (await listExternalAlertRecipients(db, scan.siteId))
    .filter((r) => !memberSet.has(r.email))
    .map((r) => ({
      email: r.email,
      unsubscribeUrl: `${config.APP_URL}/unsubscribe?t=${encodeURIComponent(r.unsubscribeToken)}`,
    }));
  // Slack is gated on the plan, not on who gets email, so it goes first.
  await postSlackAlert(
    db,
    scan.siteId,
    scan.url,
    added.length,
    `${config.APP_URL}/app/scans/${scanId}`,
  );
  if (to.length === 0 && external.length === 0) return;

  const result = await sendRegressionAlert({
    to,
    external,
    siteUrl: scan.url,
    added: added.map((f) => ({
      vendor: f.vendor,
      title: f.title,
      severity: f.severity,
      remediation: f.remediation,
    })),
    reportUrl: `${config.APP_URL}/app/scans/${scanId}`,
  });

  if (!result.sent) {
    console.error("regression alert not sent", { scanId, reason: result.reason });
  } else {
    console.log(`alert sent for ${scan.url}: ${String(added.length)} new critical`);
  }
}

/**
 * New critical findings versus the last few comparable scans. Null when there is
 * nothing comparable yet: the first scan of a detection version is a baseline.
 */
export async function newCriticalFindings(
  db: Database,
  scan: {
    id: string;
    siteId: string | null;
    url: string;
    engineVersion: string | null;
    signatureLibraryVersion: string | null;
  },
): Promise<DiffItem[] | null> {
  if (!scan.siteId) return null;
  // Compare against the last 3 scans, not just the last one. Ad-tech syncs flicker:
  // a vendor missing from one scan and back in the next is not a regression, and
  // two false alarms teach a customer to ignore the real one.
  const previous = await findPreviousScans(db, scan.siteId, scan.id, 3);
  // Only compare scans made by the same detection version. When we add signatures
  // or change fingerprints, older scans describe the same site differently, and
  // diffing across that line would alert every customer for a change on OUR side.
  const comparable = previous.filter(
    (p) =>
      p.engineVersion === scan.engineVersion &&
      p.signatureLibraryVersion === scan.signatureLibraryVersion,
  );
  if (comparable.length === 0) {
    if (previous.length > 0)
      console.log(`baseline reset for ${scan.url}: detection version changed`);
    return null;
  }
  const diff = await diffScans(
    db,
    comparable.map((p) => p.id),
    scan.id,
  );
  return diff.added.filter((f) => f.severity === "critical");
}

/** Never throws: a Slack outage must not fail the scan or block the email. */
async function postSlackAlert(
  db: Parameters<typeof getSlackTargetForSite>[0],
  siteId: string,
  siteUrl: string,
  count: number,
  reportUrl: string,
): Promise<void> {
  try {
    const target = await getSlackTargetForSite(db, siteId);
    if (!target?.url) return;
    if (!can(await getBillingState(db, target.orgId), "slack")) return;
    const host = new URL(siteUrl).hostname.replace(/^www\./, "");
    const noun = count === 1 ? "finding" : "findings";
    const res = await fetch(target.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: `${String(count)} new critical ${noun} on ${host}: trackers firing before consent. <${reportUrl}|See the evidence>`,
      }),
    });
    if (!res.ok) console.error("slack alert not sent", { siteId, status: res.status });
  } catch (error) {
    console.error("slack alert failed", error);
  }
}
