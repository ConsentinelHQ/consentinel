import type { DisclosureChange } from "@consentinel/shared";
import { appUrl, esc, hostOf, renderEmail } from "./layout.js";
import { sendEmail, type SendResult } from "./send.js";

/**
 * Disclosure alerts: a vendor started running that the site's privacy policy
 * doesn't mention, or the policy stopped mentioning one that still runs.
 */

export interface DisclosureAlertInput {
  to: string[];
  siteUrl: string;
  changes: DisclosureChange[];
  reportUrl: string;
  /** The policy we read, so they can open it. */
  policyUrl?: string;
  external?: { email: string; unsubscribeUrl: string }[];
}

const WHY: Record<DisclosureChange["why"], string> = {
  started: "Started running, and your policy doesn’t mention it.",
  dropped: "Your policy used to mention it and no longer does. It’s still running.",
};

export function disclosureSubject(siteUrl: string, changes: DisclosureChange[]): string {
  const host = hostOf(siteUrl);
  const first = changes[0];
  return changes.length === 1 && first
    ? `${first.vendor} is running on ${host} and your privacy policy doesn’t mention it`
    : `${String(changes.length)} vendors running on ${host} aren’t in your privacy policy`;
}

export async function sendDisclosureAlert(input: DisclosureAlertInput): Promise<SendResult> {
  const host = hostOf(input.siteUrl);
  const subject = disclosureSubject(input.siteUrl, input.changes);
  const fix = "Add it to your privacy policy, or remove the tag if nobody on your team needs it.";

  const items = input.changes
    .map(
      (
        c,
      ) => `<tr><td style="padding:14px 16px;border-left:3px solid #b25000;background:#fafafa;border-radius:6px">
        <div style="font-size:15px;font-weight:600;margin:0 0 4px">${esc(c.vendor)}</div>
        <div style="font-size:14px;line-height:1.5">${esc(WHY[c.why])}</div>
      </td></tr><tr><td style="height:8px"></td></tr>`,
    )
    .join("");

  const policyLine = input.policyUrl
    ? `<p style="margin:16px 0 0;color:#6e6e73;font-size:13px">Policy checked: <a href="${esc(input.policyUrl)}" style="color:#6e6e73">${esc(input.policyUrl)}</a></p>`
    : "";

  const bodyHtml = `
    <h1 style="font-size:22px;line-height:1.25;letter-spacing:-0.02em;margin:0 0 10px">${esc(subject)}</h1>
    <p style="margin:0 0 24px;color:#6e6e73;font-size:15px;line-height:1.5">
      A scan compared what runs on ${esc(host)} with your privacy policy. A vendor your policy never mentions is hard to defend as disclosed. ${esc(fix)}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>
    <p style="margin:24px 0 0">
      <a href="${esc(input.reportUrl)}" style="display:inline-block;padding:12px 20px;background:#1d1d1f;color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px">See the report</a>
    </p>${policyLine}`;

  const bodyText = [
    subject,
    "",
    `A scan compared what runs on ${host} with your privacy policy. ${fix}`,
    "",
    ...input.changes.flatMap((c) => [c.vendor, `  ${WHY[c.why]}`, ""]),
    `See the report: ${input.reportUrl}`,
    ...(input.policyUrl ? [`Policy checked: ${input.policyUrl}`] : []),
  ].join("\n");

  const from = process.env["ALERT_FROM_EMAIL"] ?? "Consentinel <alerts@consentinelhq.com>";
  const preheader = input.changes.map((c) => c.vendor).join(", ");
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
