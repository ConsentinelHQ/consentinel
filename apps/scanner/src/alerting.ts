import {
  diffScans,
  findPreviousScans,
  getScan,
  listAlertRecipients,
  listExternalAlertRecipients,
  type Database,
} from "@consentinel/db";
import { sendRegressionAlert } from "@consentinel/notify";
import type { ScannerConfig } from "./config.js";

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
  // Scheduled and deploy-triggered scans alert; manual ones are the user looking already.
  if (scan.trigger !== "scheduled" && scan.trigger !== "deploy") return;

  // Compare against the last 3 scans, not just the last one. Ad-tech syncs flicker:
  // a vendor missing from one scan and back in the next is not a regression, and
  // two false alarms teach a customer to ignore the real one.
  const previous = await findPreviousScans(db, scan.siteId, scanId, 3);
  // Only compare scans made by the same detection version. When we add signatures
  // or change fingerprints, older scans describe the same site differently, and
  // diffing across that line would alert every customer for a change on OUR side.
  const comparable = previous.filter(
    (p) =>
      p.engineVersion === scan.engineVersion &&
      p.signatureLibraryVersion === scan.signatureLibraryVersion,
  );
  // First comparable scan is a new baseline, not a regression.
  if (comparable.length === 0) {
    if (previous.length > 0)
      console.log(`baseline reset for ${scan.url}: detection version changed`);
    return;
  }

  const diff = await diffScans(
    db,
    comparable.map((p) => p.id),
    scanId,
  );
  const added = diff.added.filter((f) => f.severity === "critical");
  if (added.length === 0) return;

  const recipients = await listAlertRecipients(db, scan.siteId);
  const to = [...new Set(recipients.map((r) => r.email))].filter((e) => e.length > 0);
  const memberSet = new Set(to);
  const external = (await listExternalAlertRecipients(db, scan.siteId))
    .filter((r) => !memberSet.has(r.email))
    .map((r) => ({
      email: r.email,
      unsubscribeUrl: `${config.APP_URL}/unsubscribe?t=${encodeURIComponent(r.unsubscribeToken)}`,
    }));
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
