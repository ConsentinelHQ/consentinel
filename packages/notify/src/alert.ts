import type { Severity } from "@consentinel/shared";

/**
 * Regression alerts, sent from the worker after a scheduled scan.
 *
 * Separate from the web app's report email on purpose: that one renders a full
 * report for a lead, this one says "something changed, here is what" in as few
 * words as possible. Sharing a template would make both worse.
 */

const ENDPOINT = "https://api.resend.com/emails";

export type SendResult = { sent: true } | { sent: false; reason: string };

export interface AlertInput {
  to: string[];
  siteUrl: string;
  /** Newly appeared findings. Only criticals are passed in. */
  added: { title: string; severity: Severity }[];
  reportUrl: string;
}

export async function sendRegressionAlert(input: AlertInput): Promise<SendResult> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return { sent: false, reason: "RESEND_API_KEY not configured" };
  if (input.to.length === 0) return { sent: false, reason: "no recipients" };

  const from = process.env["ALERT_FROM_EMAIL"] ?? "Consentinel <alerts@consentinelhq.com>";
  const host = hostOf(input.siteUrl);
  const n = input.added.length;
  const subject = `${String(n)} new tracker${n === 1 ? "" : "s"} firing before consent on ${host}`;

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject,
        html: renderHtml(input, host),
        text: renderText(input, host),
      }),
    });
    if (!response.ok) return { sent: false, reason: `Resend returned ${String(response.status)}` };
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : "send failed" };
  }
}

function renderHtml(input: AlertInput, host: string): string {
  const rows = input.added
    .map((f) => `<li style="margin:0 0 10px;line-height:1.5">${esc(f.title)}</li>`)
    .join("");

  return `<!doctype html>
<html><body style="margin:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;color:#1d1d1f">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <h1 style="font-size:22px;line-height:1.25;letter-spacing:-0.02em;margin:0 0 12px">
      Something changed on ${esc(host)}
    </h1>
    <p style="margin:0 0 24px;color:#6e6e73;font-size:15px;line-height:1.5">
      A scheduled scan found ${String(input.added.length)} new critical
      ${input.added.length === 1 ? "finding" : "findings"} that were not there last time.
    </p>
    <ul style="margin:0 0 28px;padding-left:20px;font-size:15px">${rows}</ul>
    <a href="${esc(input.reportUrl)}"
       style="display:inline-block;padding:12px 20px;background:#1d1d1f;color:#fff;
              text-decoration:none;border-radius:10px;font-size:15px">
      See the full report
    </a>
    <p style="margin:28px 0 0;color:#6e6e73;font-size:13px">
      You are receiving this because you are a member of the organisation that monitors ${esc(host)}.
    </p>
  </div>
</body></html>`;
}

function renderText(input: AlertInput, host: string): string {
  return [
    `Something changed on ${host}`,
    "",
    `A scheduled scan found ${String(input.added.length)} new critical findings:`,
    "",
    ...input.added.map((f) => `- ${f.title}`),
    "",
    input.reportUrl,
  ].join("\n");
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
