import type { Severity } from "@consentinel/shared";
import { appUrl, esc, hostOf, renderEmail } from "./layout.js";
import { sendEmail, type SendResult } from "./send.js";

/**
 * Regression alerts, sent from the worker after a scheduled scan. Grouped by
 * vendor: a customer thinks "Amazon is back", not "four cookies appeared".
 */

export interface AlertInput {
  to: string[];
  siteUrl: string;
  /** Newly appeared findings. Only criticals are passed in. */
  added: { vendor: string; title: string; severity: Severity; remediation: string }[];
  reportUrl: string;
}

export async function sendRegressionAlert(input: AlertInput): Promise<SendResult> {
  const host = hostOf(input.siteUrl);
  const groups = groupByVendor(input.added);
  const n = groups.length;
  const noun = n === 1 ? "tracker" : "trackers";

  const items = groups
    .map(
      (
        g,
      ) => `<tr><td style="padding:14px 16px;border-left:3px solid #d70015;background:#fafafa;border-radius:6px">
        <div style="font-size:15px;font-weight:600;margin:0 0 4px">${esc(g.vendor)}</div>
        <div style="font-size:13px;color:#6e6e73;margin:0 0 8px">${String(g.count)} new finding${g.count === 1 ? "" : "s"}</div>
        <div style="font-size:14px;line-height:1.5"><strong>Fix:</strong> ${esc(g.remediation)}</div>
      </td></tr><tr><td style="height:8px"></td></tr>`,
    )
    .join("");

  const bodyHtml = `
    <h1 style="font-size:22px;line-height:1.25;letter-spacing:-0.02em;margin:0 0 10px">
      ${String(n)} new ${noun} firing before consent on ${esc(host)}
    </h1>
    <p style="margin:0 0 24px;color:#6e6e73;font-size:15px;line-height:1.5">
      A scheduled scan found ${n === 1 ? "a tracker that was" : "trackers that were"} not firing before consent last time.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>
    <p style="margin:24px 0 0">
      <a href="${esc(input.reportUrl)}" style="display:inline-block;padding:12px 20px;background:#1d1d1f;color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px">See the evidence</a>
    </p>`;

  const bodyText = [
    `${String(n)} new ${noun} firing before consent on ${host}`,
    "",
    ...groups.flatMap((g) => [
      `${g.vendor} (${String(g.count)} new finding${g.count === 1 ? "" : "s"})`,
      `  Fix: ${g.remediation}`,
      "",
    ]),
    `See the evidence: ${input.reportUrl}`,
  ].join("\n");

  const { html, text } = renderEmail({
    preheader: groups.map((g) => g.vendor).join(", "),
    bodyHtml,
    bodyText,
    reason: `You are receiving this because your organization monitors ${host} with Consentinel.`,
    manageUrl: `${appUrl()}/app`,
  });

  return sendEmail({
    from: process.env["ALERT_FROM_EMAIL"] ?? "Consentinel <alerts@consentinelhq.com>",
    to: input.to,
    subject: `${String(n)} new ${noun} firing before consent on ${host}`,
    html,
    text,
  });
}

function groupByVendor(
  added: AlertInput["added"],
): { vendor: string; count: number; remediation: string }[] {
  const map = new Map<string, { vendor: string; count: number; remediation: string }>();
  for (const f of added) {
    const g = map.get(f.vendor);
    if (g) g.count += 1;
    else map.set(f.vendor, { vendor: f.vendor, count: 1, remediation: f.remediation });
  }
  return [...map.values()];
}
