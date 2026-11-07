import { appUrl, esc, hostOf, renderEmail } from "./layout.js";
import { sendEmail, type SendResult } from "./send.js";

/** "Jira stopped accepting your token", sent once per broken token. */
export async function sendJiraAuthAlert(input: {
  to: string[];
  jiraUrl: string;
}): Promise<SendResult> {
  const from = process.env["ALERT_FROM_EMAIL"] ?? "Consentinel <alerts@consentinelhq.com>";
  const site = hostOf(input.jiraUrl);
  const fix = `${appUrl()}/app/alerts`;
  const guide = `${appUrl()}/help/jira-integration`;
  const subject = `Jira stopped accepting Consentinel's API token`;
  const { html, text } = renderEmail({
    preheader: "New findings aren't opening tickets until you reconnect.",
    bodyHtml: `<p style="font-size:16px;line-height:1.55;margin:0 0 14px">${esc(site)} refused the API token Consentinel uses, so new critical findings aren't opening Jira tickets and Done tickets aren't getting verified.</p>
<p style="font-size:15px;line-height:1.55;margin:0 0 20px;color:#3a3a3c">Atlassian API tokens expire after a year at most, so this is usually an expired token. Create a new one and reconnect. It takes a minute and keeps your settings.</p>
<p style="margin:0 0 16px"><a href="${esc(fix)}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;font-size:15px">Reconnect Jira</a></p>
<p style="font-size:13px;color:#6e6e73;margin:0">Step-by-step: <a href="${esc(guide)}" style="color:#6e6e73">Jira setup guide</a></p>`,
    bodyText: `${site} refused the API token Consentinel uses, so new critical findings aren't opening Jira tickets and Done tickets aren't getting verified.

Atlassian API tokens expire after a year at most, so this is usually an expired token. Create a new one and reconnect: ${fix}

Step-by-step: ${guide}`,
    reason: "You're getting this because your organization connected Jira to Consentinel.",
    manageUrl: fix,
  });
  return sendEmail({ from, to: input.to, subject, html, text });
}
