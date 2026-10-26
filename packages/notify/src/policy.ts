import { appUrl, esc, hostOf, renderEmail } from "./layout.js";
import { sendEmail, type SendResult } from "./send.js";

/** "Your privacy policy changed", with what was added and removed. */

export interface PolicyChangeInput {
  to: string[];
  siteUrl: string;
  kind: "privacy" | "cookie";
  added: string[];
  removed: string[];
  historyUrl: string;
  external?: { email: string; unsubscribeUrl: string }[];
}

const SHOW = 5;
const clip = (p: string): string => (p.length > 240 ? `${p.slice(0, 237)}...` : p);

export function policyChangeSubject(siteUrl: string, kind: PolicyChangeInput["kind"]): string {
  return `The ${kind} policy on ${hostOf(siteUrl)} changed`;
}

export async function sendPolicyChangeAlert(input: PolicyChangeInput): Promise<SendResult> {
  const host = hostOf(input.siteUrl);
  const subject = policyChangeSubject(input.siteUrl, input.kind);
  const block = (label: string, items: string[], color: string): string => {
    if (items.length === 0) return "";
    const more =
      items.length > SHOW
        ? `<div style="font-size:13px;color:#6e6e73;margin-top:6px">and ${String(items.length - SHOW)} more</div>`
        : "";
    return `<tr><td style="padding:14px 16px;border-left:3px solid ${color};background:#fafafa;border-radius:6px">
      <div style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#6e6e73;margin:0 0 8px">${esc(label)}</div>
      ${items
        .slice(0, SHOW)
        .map(
          (p) => `<div style="font-size:14px;line-height:1.5;margin:0 0 8px">${esc(clip(p))}</div>`,
        )
        .join("")}${more}
    </td></tr><tr><td style="height:8px"></td></tr>`;
  };
  const bodyHtml = `
    <h1 style="font-size:22px;line-height:1.25;letter-spacing:-0.02em;margin:0 0 10px">${esc(subject)}</h1>
    <p style="margin:0 0 24px;color:#6e6e73;font-size:15px;line-height:1.5">
      Today’s scan found a new version. The old one is saved, dated and unchanged, so you can always show what it said and when.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${block("Added", input.added, "#007a3d")}${block("Removed", input.removed, "#d70015")}
    </table>
    <p style="margin:24px 0 0">
      <a href="${esc(input.historyUrl)}" style="display:inline-block;padding:12px 20px;background:#1d1d1f;color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px">See both versions</a>
    </p>`;
  const list = (label: string, items: string[]): string[] =>
    items.length
      ? [
          `${label}:`,
          ...items.slice(0, SHOW).map((p) => `  - ${clip(p)}`),
          ...(items.length > SHOW ? [`  and ${String(items.length - SHOW)} more`] : []),
          "",
        ]
      : [];
  const bodyText = [
    subject,
    "",
    "Today's scan found a new version. The old one is saved, dated and unchanged.",
    "",
    ...list("Added", input.added),
    ...list("Removed", input.removed),
    `See both versions: ${input.historyUrl}`,
  ].join("\n");

  const from = process.env["ALERT_FROM_EMAIL"] ?? "Consentinel <alerts@consentinelhq.com>";
  const preheader = `${String(input.added.length)} added, ${String(input.removed.length)} removed`;
  const member = renderEmail({
    preheader,
    bodyHtml,
    bodyText,
    reason: `You’re receiving this because you get alerts for ${host} on Consentinel. You can turn them off anytime.`,
    manageUrl: `${appUrl()}/app/alerts`,
  });
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
