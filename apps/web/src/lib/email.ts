import "server-only";
import { appUrl, esc, hostOf, renderEmail, sendEmail, type SendResult } from "@consentinel/notify";
import type { ScanResult, Severity } from "@consentinel/shared";
import { joinList, toFullReport, type FreeFinding } from "@/lib/free-report";

/**
 * The full report, emailed to a lead who unlocked it. Built from the same grouped
 * report the web page renders, so the email and the page can never disagree.
 * Delivery must never block the unlock: if mail fails, the page still shows it.
 */

export type { SendResult };

const COLOR: Record<Severity, string> = {
  critical: "#d70015",
  warning: "#b25000",
  info: "#6e6e73",
};

export async function sendReportEmail(to: string, result: ScanResult): Promise<SendResult> {
  const report = toFullReport(result);
  const host = hostOf(report.url);
  const rows = orderByChain(report.findings.filter((f) => !f.locked));
  const top = rows
    .filter((f) => (f.triggers?.length ?? 0) >= 2)
    .sort((a, b) => (b.triggers?.length ?? 0) - (a.triggers?.length ?? 0))[0];
  const gpc = report.gpc && report.counts.critical > 0;

  const verdict =
    report.counts.critical > 0
      ? `${String(report.counts.critical)} critical, ${String(report.counts.warning)} to clean up`
      : report.counts.warning > 0
        ? `${String(report.counts.warning)} to clean up, nothing critical`
        : "Nothing firing before consent";

  const lede = report.cmpName
    ? `${report.cmpName} is installed on ${host}, and these trackers ran anyway.`
    : `No consent banner was found on ${host}, so everything below runs ungated.`;

  const stakes =
    "Twelve US states, including California and New Jersey, legally require sites to honor " +
    "Global Privacy Control. California has settled with Sephora ($1.2M) and Healthline ($1.55M) " +
    "over opt-outs that did not work.";

  const callout = top?.triggers
    ? `One tag, ${String(top.triggers.length + 1)} findings. ${top.vendor} also loads ${joinList(top.triggers)}. Fix it first and all of them stop.`
    : null;

  const bodyHtml = `
    <h1 style="font-size:24px;line-height:1.2;letter-spacing:-0.02em;margin:0 0 10px">${esc(report.headline)}</h1>
    <p style="margin:0 0 12px;color:#3f3f46;font-size:15px;line-height:1.5">${esc(lede)}</p>
    ${gpc ? `<p style="margin:0 0 16px;color:#3f3f46;font-size:14px;line-height:1.5">${esc(stakes)}</p>` : ""}
    ${callout ? `<p style="margin:0 0 20px;padding:12px 14px;background:#fef2f2;border-left:3px solid #b91c1c;border-radius:6px;font-size:14px;line-height:1.5">${esc(callout)}</p>` : ""}
    <p style="margin:0 0 14px;font-size:13px;color:#6e6e73">${esc(report.url)} &middot; <strong style="color:#1d1d1f">${esc(verdict)}</strong></p>
    ${rows.map(renderRow).join("")}
    ${
      report.correctlyGated.length > 0
        ? `<p style="margin:20px 0 0;color:#00795c;font-size:14px">Stopped correctly: ${esc(report.correctlyGated.join(", "))}</p>`
        : ""
    }
    ${
      report.unattributedCookies.length > 0
        ? `<p style="margin:16px 0 0;color:#6e6e73;font-size:13px;line-height:1.6">${String(report.unattributedCookies.length)} more cookies we could not attribute to a known vendor. Confirm whether each is strictly necessary:<br><span style="font-family:ui-monospace,Menlo,monospace;font-size:12px">${esc(report.unattributedCookies.join(", "))}</span></p>`
        : ""
    }
    <div style="margin:28px 0 0;padding:20px;border:1px solid #e4e4e7;border-radius:12px">
      <p style="margin:0 0 6px;font-size:16px;font-weight:600">Know the moment this changes.</p>
      <p style="margin:0 0 14px;color:#6e6e73;font-size:14px;line-height:1.5">Consentinel rescans your site on a schedule and emails you when a new tag fires before consent, before a regulator or a plaintiff finds it.</p>
      <a href="${esc(appUrl())}/pricing" style="display:inline-block;padding:11px 18px;background:#1d1d1f;color:#ffffff;text-decoration:none;border-radius:10px;font-size:14px">Start monitoring</a>
    </div>`;

  const bodyText = [
    report.headline,
    lede,
    ...(gpc ? ["", stakes] : []),
    ...(callout ? ["", callout] : []),
    "",
    `${report.url} - ${verdict}`,
    "",
    ...rows.flatMap((f) => [
      `[${f.severity.toUpperCase()}] ${f.title}${f.causedBy ? ` (loaded by ${f.causedBy})` : ""}`,
      ...(f.evidence ?? []).slice(0, 3).map((e) => `  ${e}`),
      ...(f.remediation ? [`  Fix: ${f.remediation}`] : []),
      "",
    ]),
    ...(report.correctlyGated.length > 0
      ? [`Stopped correctly: ${report.correctlyGated.join(", ")}`, ""]
      : []),
    `Start monitoring: ${appUrl()}/pricing`,
  ].join("\n");

  const { html, text } = renderEmail({
    preheader: callout ?? verdict,
    bodyHtml,
    bodyText,
    reason: `You are receiving this because you requested a Consentinel report for ${host}.`,
  });

  return sendEmail({
    from: process.env["REPORT_FROM_EMAIL"] ?? "Consentinel <reports@consentinelhq.com>",
    to: [to],
    subject: `${host}: ${report.headline}`,
    html,
    text,
  });
}

function renderRow(f: FreeFinding): string {
  const evidence = (f.evidence ?? [])
    .slice(0, 3)
    .map((e) => (e.length > 140 ? `${e.slice(0, 140)}...` : e));
  return `<div style="margin:0 0 10px${f.causedBy ? ";margin-left:20px" : ""};padding:14px 16px;background:#fafafa;border-left:3px solid ${COLOR[f.severity]};border-radius:6px">
    <p style="margin:0 0 4px;font-size:15px;font-weight:600">${esc(f.title)}</p>
    ${f.causedBy ? `<p style="margin:0 0 6px;font-size:13px;color:#6e6e73">Loaded by ${esc(f.causedBy)}</p>` : ""}
    ${f.triggers && f.triggers.length > 0 ? `<p style="margin:0 0 6px;font-size:13px;color:#6e6e73">Also loads ${esc(joinList(f.triggers))}</p>` : ""}
    ${evidence.map((e) => `<p style="margin:0 0 4px;font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#3f3f46;word-break:break-all">${esc(e)}</p>`).join("")}
    ${f.remediation ? `<p style="margin:8px 0 0;font-size:14px;line-height:1.5"><strong>Fix:</strong> ${esc(f.remediation)}</p>` : ""}
  </div>`;
}

/** Each parent followed directly by the trackers it loaded, biggest chain first. */
function orderByChain(rows: readonly FreeFinding[]): FreeFinding[] {
  const present = new Set(rows.map((r) => r.vendor));
  const childrenOf = new Map<string, FreeFinding[]>();
  for (const r of rows) {
    if (r.causedBy && present.has(r.causedBy)) {
      childrenOf.set(r.causedBy, [...(childrenOf.get(r.causedBy) ?? []), r]);
    }
  }
  const kids = (r: FreeFinding): number => childrenOf.get(r.vendor)?.length ?? 0;
  const out: FreeFinding[] = [];
  for (const r of [...rows].sort((a, b) => kids(b) - kids(a))) {
    if (r.causedBy && present.has(r.causedBy)) continue;
    out.push(r, ...(childrenOf.get(r.vendor) ?? []));
  }
  return out;
}
