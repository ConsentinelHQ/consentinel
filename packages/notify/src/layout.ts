/**
 * One layout for every email: logo header, white card, footer that says why you
 * got this and where to change it. Table-based because Outlook still is.
 */

export interface EmailLayout {
  /** Inbox preview text. Shown next to the subject, hidden in the body. */
  preheader: string;
  bodyHtml: string;
  bodyText: string;
  /** Why this person received it. Builds trust, and keeps spam filters happy. */
  reason: string;
  /** Where to change what they receive. */
  manageUrl?: string;
}

export function appUrl(): string {
  return (process.env["APP_URL"] ?? "https://www.consentinelhq.com").replace(/\/$/, "");
}

export function renderEmail(layout: EmailLayout): { html: string; text: string } {
  const base = appUrl();
  const manage = layout.manageUrl
    ? ` <a href="${esc(layout.manageUrl)}" style="color:#6e6e73;text-decoration:underline">Manage alerts</a>.`
    : "";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;color:#1d1d1f">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(layout.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7">
  <tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
      <tr><td style="padding:0 4px 20px">
        <a href="${esc(base)}" style="text-decoration:none;color:#1d1d1f">
          <img src="${esc(base)}/email-logo.png" width="27" height="30" alt="" style="vertical-align:middle;border:0">
          <span style="vertical-align:middle;font-size:17px;font-weight:600;letter-spacing:-0.01em;margin-left:8px">Consentinel</span>
        </a>
      </td></tr>
      <tr><td style="background:#ffffff;border-radius:14px;padding:32px 28px">
        ${layout.bodyHtml}
      </td></tr>
      <tr><td style="padding:20px 4px 0;color:#6e6e73;font-size:12px;line-height:1.6">
        ${esc(layout.reason)}${manage}<br>
        Consentinel &middot; <a href="${esc(base)}" style="color:#6e6e73">consentinelhq.com</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const text = [
    layout.bodyText.trim(),
    "",
    "--",
    layout.reason,
    ...(layout.manageUrl ? [`Manage alerts: ${layout.manageUrl}`] : []),
    `Consentinel - ${base}`,
  ].join("\n");

  return { html, text };
}

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
