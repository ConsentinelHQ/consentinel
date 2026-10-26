import { createDraft, getMessage, normDomain, search, updateRow, type Sheet } from "./google.js";
import { address, header } from "./mail.js";
import { nyDate } from "./state.js";
import type { Email } from "./template.js";

/**
 * Hot lead: rescan the prospect's site through the production API, get a share
 * link to the full report, and draft Charlie's reply in their thread with the
 * link in it. Drafts only.
 */

const SITE = "https://www.getconsentinel.com/";
const POLL_MS = 10_000;
const TIMEOUT_MS = 6 * 60_000;

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "Kevin Ubert <k@x.com>" -> "Kevin". Falls back to "there". */
export function firstNameFrom(from: string): string {
  const name = from
    .replace(/<[^>]*>/, "")
    .replace(/"/g, "")
    .trim();
  if (!name || name.includes("@")) return "there";
  return name.split(/\s+/)[0] ?? "there";
}

export function reportReply(input: {
  firstName: string;
  domain: string;
  reportUrl: string;
  subject: string;
}): Email {
  const greeting = `Hi ${input.firstName},`;
  const lead = `Thanks for getting back to me. Here's the full report for ${input.domain}:`;
  const what =
    "It lists every tag that fires after a visitor opts out, with the exact request and cookie as evidence, and what to change to fix each one.";
  const call = "Happy to walk through it on a quick call if that's easier.";
  const sig = ["Thank you,", "Charlie Buckley", "Founder, Consentinel", "getconsentinel.com"];
  const text = [greeting, "", lead, input.reportUrl, "", what, "", call, "", ...sig].join("\n");
  const html = [
    `<p>${esc(greeting)}</p>`,
    `<p>${esc(lead)}<br><a href="${esc(input.reportUrl)}">${esc(input.reportUrl)}</a></p>`,
    `<p>${esc(what)}</p>`,
    `<p>${esc(call)}</p>`,
    `<p>${sig.map(esc).join("<br>").replace("getconsentinel.com", `<a href="${SITE}">getconsentinel.com</a>`)}</p>`,
  ].join("\n");
  const subject = /^re:/i.test(input.subject) ? input.subject : `Re: ${input.subject}`;
  return { subject, text, html };
}

export interface ApiOpts {
  base: string;
  key: string;
}

async function api<T>(o: ApiOpts, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${o.base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${o.key}`, "Content-Type": "application/json" },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `report API returned ${String(res.status)}`);
  return body;
}

interface ScanStatus {
  status: string;
  reportUrl?: string;
  critical?: number;
  error?: string;
  blockedBy?: string;
}

export interface PrepResult {
  domain: string;
  status: "drafted" | "report_only" | "failed";
  reportUrl?: string;
  critical?: number;
  draftTo?: string;
  reason?: string;
}

/**
 * Scan a site through the production API and return a share link to its full
 * report. The link is what open tracking counts.
 */
export async function fetchReport(
  o: ApiOpts,
  domain: string,
): Promise<{ reportUrl: string; scanId: string; critical?: number } | string> {
  const { scanId } = await api<{ scanId: string }>(o, "/api/internal/prospect-report", {
    method: "POST",
    body: JSON.stringify({ url: domain }),
  });
  let scan: ScanStatus = { status: "queued" };
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    scan = await api<ScanStatus>(o, `/api/internal/prospect-report?scanId=${scanId}`);
    if (scan.status === "complete" || scan.status === "failed") break;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  if (scan.status !== "complete" || !scan.reportUrl) {
    return scan.status === "failed"
      ? `scan failed${scan.blockedBy ? ` (blocked by ${scan.blockedBy})` : ""}: ${scan.error ?? ""}`
      : "scan didn't finish in 6 minutes";
  }
  return {
    reportUrl: scan.reportUrl,
    scanId,
    ...(scan.critical !== undefined ? { critical: scan.critical } : {}),
  };
}

export async function prep(
  sheetId: string,
  tab: string,
  sheet: Sheet,
  domainInput: string,
  opts: { from: string; apiBase: string; apiKey: string },
): Promise<PrepResult> {
  const domain = normDomain(domainInput);
  const o = { base: opts.apiBase.replace(/\/$/, ""), key: opts.apiKey };

  const got = await fetchReport(o, domain);
  if (typeof got === "string") return { domain, status: "failed", reason: got };
  const scan = { reportUrl: got.reportUrl, critical: got.critical };

  const row = sheet.rows.find((r) => normDomain(r.values["Domain"] ?? "") === domain);
  const today = nyDate(new Date());

  // Answer in the thread of their latest message.
  const [latestId] = await search(`from:@${domain} -in:sent newer_than:30d`, 1);
  let result: PrepResult = {
    domain,
    status: "report_only",
    reportUrl: scan.reportUrl,
    ...(scan.critical !== undefined ? { critical: scan.critical } : {}),
  };
  if (latestId) {
    const msg = await getMessage(latestId);
    const fromHeader = header(msg.payload, "Reply-To") || header(msg.payload, "From");
    const to = address(fromHeader);
    const messageId = header(msg.payload, "Message-ID") || header(msg.payload, "Message-Id");
    const draft = reportReply({
      firstName: firstNameFrom(header(msg.payload, "From")),
      domain,
      reportUrl: scan.reportUrl,
      subject: header(msg.payload, "Subject") || `Privacy issues on ${domain}`,
    });
    await createDraft(
      opts.from,
      to,
      draft,
      messageId ? { threadId: msg.threadId, messageId } : undefined,
    );
    result = { ...result, status: "drafted", draftTo: to };
  }

  if (row) {
    const prior = row.values["Notes"] ?? "";
    const n = `${today}: outreach bot - fresh report${result.status === "drafted" ? " + reply drafted" : ""}`;
    await updateRow(sheetId, tab, sheet.headers, row.rowNumber, {
      "Report link": scan.reportUrl,
      "Next action": result.status === "drafted" ? "Review report reply draft" : "Send report link",
      "Next action date": today,
      Notes: prior ? `${prior} | ${n}` : n,
    });
  }
  return result;
}
