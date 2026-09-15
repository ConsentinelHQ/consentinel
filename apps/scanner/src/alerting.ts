import {
  diffScans,
  findPreviousScan,
  getScan,
  listAlertRecipients,
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
  if (scan.trigger !== "scheduled") return;

  const previous = await findPreviousScan(db, scan.siteId, scanId);
  // First scan for a site is the baseline, not a regression.
  if (!previous) return;

  const diff = await diffScans(db, previous.id, scanId);
  const added = diff.added.filter((f) => f.severity === "critical");
  if (added.length === 0) return;

  const recipients = await listAlertRecipients(db, scan.siteId);
  const to = [...new Set(recipients.map((r) => r.email))].filter((e) => e.length > 0);
  if (to.length === 0) return;

  const result = await sendRegressionAlert({
    to,
    siteUrl: scan.url,
    added: added.map((f) => ({ title: f.title, severity: f.severity })),
    reportUrl: `${config.APP_URL}/app/scans/${scanId}`,
  });

  if (!result.sent) {
    console.error("regression alert not sent", { scanId, reason: result.reason });
  } else {
    console.log(`alert sent for ${scan.url}: ${String(added.length)} new critical`);
  }
}
