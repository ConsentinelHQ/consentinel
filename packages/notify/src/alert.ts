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
  /** Non-members added on the Alerts page, each with their own unsubscribe link. */
  external?: { email: string; unsubscribeUrl: string }[];
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

  const subject = `${String(n)} new ${noun} firing before consent on ${host}`;
  const from = process.env["ALERT_FROM_EMAIL"] ?? "Consentinel <alerts@consentinelhq.com>";
  const preheader = groups.map((g) => g.vendor).join(", ");
  const member = renderEmail({
    preheader,
    bodyHtml,
    bodyText,
    reason: `You’re receiving this because you get alerts for ${host} on Consentinel. You can turn them off anytime.`,
    manageUrl: `${appUrl()}/app/alerts`,
  });

  // One email per person: a shared To line would expose every address.
  const jobs = [
    ...input.to.map((email) => ({ email, html: member.html, text: member.text })),
    ...(input.external ?? []).map((r) => {
      const own = renderEmail({
        preheader,
        bodyHtml,
        bodyText,
        reason: `You’re receiving this because you were added to Consentinel alerts for ${host}. Unsubscribe anytime.`,
        manageUrl: r.unsubscribeUrl,
      });
      return { email: r.email, html: own.html, text: own.text };
    }),
  ];

  // One bad address shouldn't stop everyone else's alert.
  let last: SendResult | undefined;
  let failed: SendResult | undefined;
  for (const [i, job] of jobs.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 550)); // stay under Resend's 2/s
    const result = await sendEmail({
      from,
      to: [job.email],
      subject,
      html: job.html,
      text: job.text,
    });
    if (result.sent) last = result;
    else failed = result;
  }
  return failed ?? last ?? { sent: false, reason: "no recipients" };
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
