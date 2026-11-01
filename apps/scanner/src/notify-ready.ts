import { getScan, leadsWaitingOnScan, type Database } from "@consentinel/db";
import { esc, hostOf, renderEmail, sendEmail } from "@consentinel/notify";
import type { ScannerConfig } from "./config.js";

/**
 * Emails anyone who asked "email me the results" while this scan waited.
 * The link carries their lead id, which unlocks the full report.
 */
export async function notifyWaitingLeads(
  db: Database,
  scanId: string,
  config: Pick<ScannerConfig, "APP_URL">,
): Promise<number> {
  const scan = await getScan(db, scanId);
  if (!scan?.finishedAt || scan.status !== "complete") return 0;
  const waiting = await leadsWaitingOnScan(db, scanId, scan.finishedAt);
  const host = hostOf(scan.url);
  let sent = 0;
  for (const lead of waiting) {
    const link = `${config.APP_URL}/scan/${scanId}?lead=${lead.id}`;
    const { html, text } = renderEmail({
      preheader: `See what fires on ${host} before consent.`,
      bodyHtml: `
        <h1 style="font-size:24px;line-height:1.2;letter-spacing:-0.02em;margin:0 0 10px">Your scan of ${esc(host)} is ready.</h1>
        <p style="margin:0 0 20px;color:#3f3f46;font-size:15px;line-height:1.5">Every finding, the request that proves it, and how to fix it.</p>
        <a href="${esc(link)}" style="display:inline-block;padding:11px 18px;background:#1d1d1f;color:#ffffff;text-decoration:none;border-radius:10px;font-size:14px">See the full report</a>`,
      bodyText: `Your scan of ${host} is ready.\n\nSee the full report: ${link}`,
      reason: `You're receiving this because you asked us to email you the scan of ${host}.`,
    });
    const result = await sendEmail({
      from: process.env["REPORT_FROM_EMAIL"] ?? "Consentinel <reports@consentinelhq.com>",
      to: [lead.email],
      subject: `${host}: your scan is ready`,
      html,
      text,
    });
    if (result.sent) sent += 1;
    else console.error("ready email not sent", { scanId, reason: result.reason });
  }
  return sent;
}
