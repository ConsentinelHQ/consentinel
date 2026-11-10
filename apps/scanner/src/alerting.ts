import {
  findPreviousScans,
  newCriticalFindings,
  getScan,
  listAlertRecipients,
  listExternalAlertRecipients,
  can,
  getBillingState,
  getSlackTargetForSite,
  getTeamsTargetForSite,
  countPolicyVersionsSince,
  type Database,
  type NewVersion,
} from "@consentinel/db";
import {
  slackPayload,
  teamsPayload,
  type ChatMessage,
  sendAccessibilityAlert,
  sendDisclosureAlert,
  sendPolicyChangeAlert,
  sendRegressionAlert,
} from "@consentinel/notify";
import {
  diffPolicy,
  disclosureChanges,
  isMeaningfulChange,
  newSeriousIssues,
  type DisclosureChange,
  type ScanResult,
} from "@consentinel/shared";
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

  const { to, external } = await recipientsFor(db, scan.siteId, config);
  // Chat is gated on the plan, not on who gets email, so it goes first.
  await postChat(
    db,
    scan.siteId,
    regressionMessage(scan.url, added.length, `${config.APP_URL}/app/scans/${scanId}`),
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

/** Members and outside recipients for a site's alerts, deduped. */
async function recipientsFor(
  db: Database,
  siteId: string,
  config: ScannerConfig,
): Promise<{ to: string[]; external: { email: string; unsubscribeUrl: string }[] }> {
  const recipients = await listAlertRecipients(db, siteId);
  const to = [...new Set(recipients.map((r) => r.email))].filter((e) => e.length > 0);
  const memberSet = new Set(to);
  const external = (await listExternalAlertRecipients(db, siteId))
    .filter((r) => !memberSet.has(r.email))
    .map((r) => ({
      email: r.email,
      unsubscribeUrl: `${config.APP_URL}/unsubscribe?t=${encodeURIComponent(r.unsubscribeToken)}`,
    }));
  return { to, external };
}

/**
 * Emails the org when a vendor starts running that the site's privacy policy
 * doesn't mention, or the policy stops mentioning one that still runs. Same
 * triggers as regression alerts; compared against the last 3 checked scans.
 */
export async function alertOnDisclosure(
  db: Database,
  scanId: string,
  config: ScannerConfig,
): Promise<void> {
  const scan = await getScan(db, scanId);
  if (!scan?.siteId) return;
  if (scan.trigger !== "scheduled" && scan.trigger !== "deploy" && scan.trigger !== "jira") return;
  const changes = await newDisclosureGaps(db, scan);
  if (!changes || changes.length === 0) return;

  const reportUrl = `${config.APP_URL}/app/scans/${scanId}`;
  const { to, external } = await recipientsFor(db, scan.siteId, config);
  await postChat(db, scan.siteId, disclosureMessage(scan.url, changes, reportUrl));
  if (to.length === 0 && external.length === 0) return;

  const policyUrl = scan.result?.disclosure?.policies.find((p) => p.kind === "privacy")?.url;
  const result = await sendDisclosureAlert({
    to,
    external,
    siteUrl: scan.url,
    changes,
    reportUrl,
    ...(policyUrl ? { policyUrl } : {}),
  });
  if (!result.sent) console.error("disclosure alert not sent", { scanId, reason: result.reason });
  else console.log(`disclosure alert sent for ${scan.url}: ${String(changes.length)} vendors`);
}

/**
 * Emails the org when a critical or serious accessibility check starts failing that
 * passed on the previous scan. Same triggers as the other alerts. Only compares scans
 * audited on the same page budget, so a plan upgrade doesn't read as a regression.
 */
export async function alertOnAccessibility(
  db: Database,
  scanId: string,
  config: ScannerConfig,
): Promise<void> {
  const scan = await getScan(db, scanId);
  if (!scan?.siteId || !scan.result?.accessibility) return;
  if (scan.trigger !== "scheduled" && scan.trigger !== "deploy" && scan.trigger !== "jira") return;
  const current = scan.result.accessibility;
  const [previous] = await findPreviousScans(db, scan.siteId, scan.id, 1);
  const before = previous?.result?.accessibility;
  if (!before || before.pageLimit !== current.pageLimit) return;
  // A page that failed to load last time would make every issue on it look new.
  const failedBefore = new Set(
    before.pages.filter((p) => p.status === "failed").map((p) => new URL(p.url).pathname),
  );
  const added = newSeriousIssues(before, current).filter(
    (i) => !i.pages.every((path) => failedBefore.has(path)),
  );
  if (added.length === 0) return;

  const reportUrl = `${config.APP_URL}/app/scans/${scanId}`;
  const host = new URL(scan.url).hostname.replace(/^www\./, "");
  await postChat(db, scan.siteId, {
    text: `${String(added.length)} new accessibility ${added.length === 1 ? "issue" : "issues"} on ${host}: ${added.map((i) => i.title).join(", ")}.`,
    link: { url: reportUrl, label: "See the report" },
  });
  const { to, external } = await recipientsFor(db, scan.siteId, config);
  if (to.length === 0 && external.length === 0) return;
  const result = await sendAccessibilityAlert({
    to,
    external,
    siteUrl: scan.url,
    added,
    score: current.score,
    reportUrl,
  });
  if (!result.sent)
    console.error("accessibility alert not sent", { scanId, reason: result.reason });
}

/** More versions than this in a week means the page changes on every load: stop alerting. */
export const UNSTABLE_VERSIONS_PER_WEEK = 3;

/**
 * Emails the org when a scan stored a new version of the policy and the text
 * really changed. A page that changes on every load (a rendered timestamp, a
 * rotating cookie list) is archived but never alerted on.
 */
export async function alertOnPolicyChange(
  db: Database,
  scanId: string,
  changed: readonly NewVersion[],
  config: ScannerConfig,
): Promise<void> {
  if (changed.length === 0) return;
  const scan = await getScan(db, scanId);
  if (!scan?.siteId) return;
  if (scan.trigger !== "scheduled" && scan.trigger !== "deploy" && scan.trigger !== "jira") return;
  const recent = await countPolicyVersionsSince(
    db,
    scan.siteId,
    new Date(Date.now() - 7 * 86_400_000),
  );
  if (recent > UNSTABLE_VERSIONS_PER_WEEK) {
    console.log(`policy alert skipped for ${scan.url}: ${String(recent)} versions this week`);
    return;
  }
  const historyUrl = `${config.APP_URL}/app/sites/${scan.siteId}/policy`;
  const { to, external } = await recipientsFor(db, scan.siteId, config);
  for (const { version, previous } of changed) {
    // The first version on record is a baseline, not a change.
    if (!previous) continue;
    const diff = diffPolicy(previous.text, version.text);
    if (!isMeaningfulChange(diff)) continue;
    await postChat(db, scan.siteId, {
      text: `The ${version.kind} policy on ${new URL(scan.url).hostname.replace(/^www\./, "")} changed: ${String(diff.added.length)} paragraphs added, ${String(diff.removed.length)} removed.`,
      link: { url: historyUrl, label: "See both versions" },
    });
    if (to.length === 0 && external.length === 0) continue;
    const result = await sendPolicyChangeAlert({
      to,
      external,
      siteUrl: scan.url,
      kind: version.kind,
      added: diff.added,
      removed: diff.removed,
      historyUrl,
    });
    if (!result.sent) console.error("policy alert not sent", { scanId, reason: result.reason });
  }
}

export async function newDisclosureGaps(
  db: Database,
  scan: { id: string; siteId: string | null; result: ScanResult | null },
): Promise<DisclosureChange[] | null> {
  if (!scan.siteId || !scan.result?.disclosure) return null;
  const previous = await findPreviousScans(db, scan.siteId, scan.id, 3);
  return disclosureChanges(
    scan.result.disclosure,
    previous.map((p) => p.result?.disclosure),
  );
}

export function disclosureMessage(
  siteUrl: string,
  changes: DisclosureChange[],
  reportUrl: string,
): ChatMessage {
  const host = new URL(siteUrl).hostname.replace(/^www\./, "");
  const names = changes.map((c) => c.vendor).join(", ");
  return {
    text: `${names} ${changes.length === 1 ? "is" : "are"} running on ${host} and the privacy policy doesn't mention ${changes.length === 1 ? "it" : "them"}.`,
    link: { url: reportUrl, label: "See the report" },
  };
}

export function regressionMessage(siteUrl: string, count: number, reportUrl: string): ChatMessage {
  const host = new URL(siteUrl).hostname.replace(/^www\./, "");
  const noun = count === 1 ? "finding" : "findings";
  return {
    text: `${String(count)} new critical ${noun} on ${host}: trackers firing before consent.`,
    link: { url: reportUrl, label: "See the evidence" },
  };
}

// Moved to @consentinel/db so the deploy check API shares the exact rule.
export { newCriticalFindings } from "@consentinel/db";

/** Posts to every chat app the org connected. Never throws. */
async function postChat(db: Database, siteId: string, msg: ChatMessage): Promise<void> {
  await Promise.all([
    postWebhook("slack", () => getSlackTargetForSite(db, siteId), db, siteId, slackPayload(msg)),
    postWebhook("teams", () => getTeamsTargetForSite(db, siteId), db, siteId, teamsPayload(msg)),
  ]);
}

/** Never throws: a chat outage must not fail the scan or block the email. */
async function postWebhook(
  app: "slack" | "teams",
  target: () => Promise<{ orgId: string; url: string | null } | null>,
  db: Database,
  siteId: string,
  body: unknown,
): Promise<void> {
  try {
    const t = await target();
    if (!t?.url) return;
    if (!can(await getBillingState(db, t.orgId), app)) return;
    const res = await fetch(t.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      redirect: "error",
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error(`${app} alert not sent`, { siteId, status: res.status });
  } catch (error) {
    console.error(`${app} alert failed`, error);
  }
}
