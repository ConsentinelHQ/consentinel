import type { AccessibilityIssue } from "@consentinel/shared";
import { appUrl, esc, hostOf, renderEmail } from "./layout.js";
import { sendEmail, type SendResult } from "./send.js";

/** New critical or serious accessibility checks failing since the previous scan. */
export interface AccessibilityAlertInput {
  to: string[];
  siteUrl: string;
  added: Pick<AccessibilityIssue, "title" | "impact" | "wcag" | "pages" | "fix">[];
  score: number;
  reportUrl: string;
  external?: { email: string; unsubscribeUrl: string }[];
}

export function accessibilitySubject(siteUrl: string, count: number): string {
  const host = hostOf(siteUrl);
  return count === 1
    ? `New accessibility issue on ${host}`
    : `${String(count)} new accessibility issues on ${host}`;
}

export async function sendAccessibilityAlert(input: AccessibilityAlertInput): Promise<SendResult> {
  const host = hostOf(input.siteUrl);
  const subject = accessibilitySubject(input.siteUrl, input.added.length);
  const color = (i: AccessibilityAlertInput["added"][number]): string =>
    i.impact === "critical" ? "#c2261d" : "#b25000";

  const items = input.added
    .map(
      (
        i,
      ) => `<tr><td style="padding:14px 16px;border-left:3px solid ${color(i)};background:#fafafa;border-radius:6px">
        <div style="font-size:15px;font-weight:600;margin:0 0 4px">${esc(i.title)}</div>
        <div style="font-size:13px;color:#6e6e73;margin:0 0 6px">WCAG ${esc(i.wcag.join(", "))} · ${esc(i.pages.join(", "))}</div>
        <div style="font-size:14px;line-height:1.5">${esc(i.fix)}</div>
      </td></tr><tr><td style="height:8px"></td></tr>`,
    )
    .join("");

  const bodyHtml = `
    <h1 style="font-size:22px;line-height:1.25;letter-spacing:-0.02em;margin:0 0 10px">${esc(subject)}</h1>
    <p style="margin:0 0 24px;color:#6e6e73;font-size:15px;line-height:1.5">
      The latest scan of ${esc(host)} found accessibility checks failing that passed last time. Accessibility score: ${String(input.score)}/100.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>
    <p style="margin:24px 0 0">
      <a href="${esc(input.reportUrl)}" style="display:inline-block;padding:12px 20px;background:#1d1d1f;color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px">See the report</a>
    </p>`;

  const bodyText = [
    subject,
    "",
    `The latest scan of ${host} found accessibility checks failing that passed last time. Score: ${String(input.score)}/100.`,
    "",
    ...input.added.flatMap((i) => [
      i.title,
      `  WCAG ${i.wcag.join(", ")} - ${i.pages.join(", ")}`,
      `  ${i.fix}`,
      "",
    ]),
    `See the report: ${input.reportUrl}`,
  ].join("\n");

  const from = process.env["ALERT_FROM_EMAIL"] ?? "Consentinel <alerts@consentinelhq.com>";
  const preheader = input.added.map((i) => i.title).join(", ");
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
    if (i > 0) await new Promise((r) => setTimeout(r, 550)); // Resend allows 2/s
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
