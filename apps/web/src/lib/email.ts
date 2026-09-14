import "server-only";
import {
  countBySeverity,
  isUnattributed,
  type Finding,
  type ScanResult,
  type Severity,
} from "@consentinel/shared";

/**
 * Report delivery via Resend's REST API. No SDK: one fetch call, one fewer
 * dependency in a bundle we ship to a serverless runtime.
 *
 * Delivery must never block the unlock. If mail fails, the person still sees their
 * report in the page - losing the lead AND the report because an API was down is
 * the worst of both outcomes.
 */

const ENDPOINT = "https://api.resend.com/emails";

export type SendResult = { sent: true } | { sent: false; reason: string };

export async function sendReportEmail(to: string, result: ScanResult): Promise<SendResult> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return { sent: false, reason: "RESEND_API_KEY not configured" };

  const from = process.env["REPORT_FROM_EMAIL"] ?? "Consentinel <reports@consentinel.dev>";

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `${result.headline} on ${hostOf(result.url)}`,
        html: renderReportHtml(result),
        text: renderReportText(result),
      }),
    });
    if (!response.ok) return { sent: false, reason: `Resend returned ${response.status}` };
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : "send failed" };
  }
}

const COLOR: Record<Severity, string> = {
  critical: "#d70015",
  warning: "#b25000",
  info: "#6e6e73",
};

function renderReportHtml(result: ScanResult): string {
  // Same split as the web report: unattributed cookies are evidence, not findings.
  const attributed = result.findings.filter((f) => !isUnattributed(f));
  const unattributed = result.findings.filter(isUnattributed).map((f) => esc(f.vendor));
  const rows = attributed.map(renderFinding).join("");
  const gated = result.correctlyGated.map((g) => esc(g.vendor)).join(", ");
  // Recounted from attributed findings so the email matches the page.
  const counts = countBySeverity(attributed);

  return `<!doctype html>
<html><body style="margin:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;color:#1d1d1f">
  <div style="max-width:640px;margin:0 auto;padding:32px 20px">
    <h1 style="font-size:28px;line-height:1.15;letter-spacing:-0.03em;margin:0 0 8px">${esc(result.headline)}</h1>
    <p style="margin:0 0 4px;color:#6e6e73;font-size:15px">${esc(result.url)}</p>
    <p style="margin:0 0 28px;color:#6e6e73;font-size:15px">
      ${counts.critical} critical, ${counts.warning} to clean up.
      ${result.cmp.detected ? `Consent platform: ${esc(result.cmp.detected.name)}.` : "No consent platform detected."}
    </p>
    ${rows}
    ${gated ? `<p style="margin:28px 0 0;color:#00795c;font-size:14px">Correctly gated: ${gated}</p>` : ""}
    ${
      unattributed.length
        ? `<p style="margin:28px 0 0;color:#6e6e73;font-size:13px;line-height:1.6">
             ${unattributed.length} more cookies were set before consent that we could not
             attribute to a known vendor. Confirm whether each is strictly necessary:
             <br><span style="font-family:ui-monospace,monospace;font-size:12px">${unattributed.join(", ")}</span>
           </p>`
        : ""
    }
    <p style="margin:32px 0 0;color:#6e6e73;font-size:12px;line-height:1.5">
      Scanned ${esc(result.scannedAt)} with engine ${esc(result.engineVersion)},
      signatures ${esc(result.signatureLibraryVersion)}.
      Every finding above includes the request or cookie that proves it.
    </p>
  </div>
</body></html>`;
}

function renderFinding(finding: Finding): string {
  return `<div style="background:#fff;border-left:3px solid ${COLOR[finding.severity]};border-radius:6px;padding:16px 18px;margin-bottom:10px">
  <p style="margin:0 0 6px;font-size:16px;font-weight:600;letter-spacing:-0.01em">${esc(finding.title)}</p>
  <p style="margin:0 0 10px;font-size:14px;color:#6e6e73;line-height:1.45">${esc(finding.detail)}</p>
  <p style="margin:0 0 10px;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#1d1d1f;background:#f5f5f7;padding:8px 10px;border-radius:4px;word-break:break-all">${esc(evidenceLine(finding))}</p>
  <p style="margin:0;font-size:14px;line-height:1.45"><strong>Fix:</strong> ${esc(finding.remediation)}</p>
</div>`;
}

/** The evidence line is the product. Without it this is just an opinion. */
function evidenceLine(finding: Finding): string {
  const e = finding.evidence;
  switch (e.kind) {
    case "request":
      return `${e.method} ${e.url}${e.matched ? `  (matched: ${e.matched})` : ""}`;
    case "cookie":
      return `Cookie ${e.name} on ${e.domain} (${e.firstParty ? "first" : "third"}-party)`;
    case "script":
      return `Script ${e.src}${e.documented ? "" : " (undocumented)"}`;
    case "credential":
      return `Credential in ${e.location}: ${e.tokenPreview}`;
    case "cmp":
      return e.detail;
  }
}

function renderReportText(result: ScanResult): string {
  const attributed = result.findings.filter((f) => !isUnattributed(f));
  const unattributed = result.findings.filter(isUnattributed).map((f) => f.vendor);
  const counts = countBySeverity(attributed);
  const lines = [
    result.headline,
    result.url,
    `${counts.critical} critical, ${counts.warning} to clean up`,
    "",
  ];
  for (const f of attributed) {
    lines.push(
      `[${f.severity.toUpperCase()}] ${f.title}`,
      `  ${evidenceLine(f)}`,
      `  Fix: ${f.remediation}`,
      "",
    );
  }
  if (unattributed.length > 0) {
    lines.push(
      `${unattributed.length} cookies set before consent that we could not attribute.`,
      "Confirm whether each is strictly necessary:",
      `  ${unattributed.join(", ")}`,
      "",
    );
  }
  return lines.join("\n");
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
