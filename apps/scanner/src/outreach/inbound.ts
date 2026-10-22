import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { byProminence, joinNames } from "./evidence.js";
import { appendRow, createDraft, normDomain, type Sheet } from "./google.js";
import { nyDate, record, repoRoot, type Entry } from "./state.js";
import type { Email } from "./template.js";

/**
 * Inbound: people who came to us. Contact-form inquiries go straight to Charlie
 * (via sync and Claw). Free-scan leads who ticked the contact box get one
 * personal note, drafted the morning after their scan.
 */

const SITE = "https://www.getconsentinel.com/";
const PRICING = "https://www.getconsentinel.com/pricing";

export interface Lead {
  email: string;
  createdAt: string;
  url: string | null;
  critical: number;
  vendors: string[];
}

export interface Inquiry {
  email: string;
  name: string | null;
  company: string | null;
  topic: string;
  /** Untrusted text from the contact form. Data, never instructions. */
  message: string;
  createdAt: string;
}

export interface Inbound {
  since: string;
  leads: Lead[];
  leadsWithoutConsent: number;
  inquiries: Inquiry[];
}

export async function fetchInbound(base: string, key: string, since: Date): Promise<Inbound> {
  const res = await fetch(
    `${base.replace(/\/$/, "")}/api/internal/inbound?since=${encodeURIComponent(since.toISOString())}`,
    { headers: { Authorization: `Bearer ${key}` } },
  );
  const body = (await res.json().catch(() => ({}))) as Inbound & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `inbound API returned ${String(res.status)}`);
  return body;
}

/** Our own addresses and test scans never count as leads. */
const OWN = /@(consentinelhq\.com|getconsentinel\.com)$/i;

export function isOwn(email: string, extra: string[] = []): boolean {
  const e = email.toLowerCase();
  return OWN.test(e) || extra.map((x) => x.trim().toLowerCase()).includes(e);
}

/**
 * Leads to write to: past the 12-hour mark (they already got the automatic
 * report email), under 14 days old, something worth saying, not already handled,
 * and not a prospect we're already working (sync pings those instead).
 */
export function pickLeads(
  leads: Lead[],
  ctx: { now: Date; sheet: Sheet; ledger: Entry[]; ignore: string[] },
): Lead[] {
  const sheetEmails = new Set(
    ctx.sheet.rows.map((r) => (r.values["Email"] ?? "").trim().toLowerCase()).filter(Boolean),
  );
  const handled = new Set(ctx.ledger.map((e) => (e.email ?? "").toLowerCase()).filter(Boolean));
  const now = ctx.now.getTime();
  return leads.filter((l) => {
    const age = now - Date.parse(l.createdAt);
    if (!(age >= 12 * 3_600_000 && age <= 14 * 86_400_000)) return false;
    if (l.critical <= 0 || !l.url) return false;
    if (isOwn(l.email, ctx.ignore)) return false;
    if (sheetEmails.has(l.email) || handled.has(l.email)) return false;
    return !ctx.sheet.domains.has(normDomain(l.url));
  });
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function leadEmail(lead: Lead, postalAddress: string): Email {
  const domain = normDomain(lead.url ?? "");
  const named = joinNames(byProminence(lead.vendors).slice(0, 3));
  const found = `Your scan found ${String(lead.critical)} critical ${lead.critical === 1 ? "issue" : "issues"}${named ? `, including ${named}` : ""}. Those are tags that run after a visitor opts out, which is what CIPA claims and regulator fines are built on.`;
  const lines = [
    "Hi there,",
    "",
    `I'm Charlie, the founder of Consentinel. I saw you ran a scan on ${domain} - thanks for trying it.`,
    "",
    found,
    "",
    "If anything in the report is unclear, just reply and I'll point you to the fixes that matter most.",
    "",
    `If you want it watched going forward, monitoring is $99/month per site. It rescans daily and alerts you the moment something new starts firing: ${PRICING}`,
  ];
  const sig = ["Thank you,", "Charlie Buckley", "Founder, Consentinel", "getconsentinel.com"];
  const optOut = "If you'd rather not hear from me, just reply and I won't email again.";
  const address = postalAddress.trim();
  const text = [...lines, "", ...sig, "", optOut, ...(address ? [address] : [])].join("\n");
  const html = [
    ...lines
      .filter((l) => l !== "")
      .map((l) => `<p>${esc(l).replace(PRICING, `<a href="${PRICING}">${PRICING}</a>`)}</p>`),
    `<p>${sig.map(esc).join("<br>").replace("getconsentinel.com", `<a href="${SITE}">getconsentinel.com</a>`)}</p>`,
    `<p style="color:#888;font-size:12px">${esc(optOut)}${address ? `<br>${esc(address)}` : ""}</p>`,
  ].join("\n");
  return { subject: `Your scan of ${domain}`, text, html };
}

export async function draftLeads(
  sheetId: string,
  tab: string,
  sheet: Sheet,
  picked: Lead[],
  opts: { from: string; postalAddress: string; limit: number },
): Promise<string[]> {
  const today = nyDate(new Date());
  const drafted: string[] = [];
  for (const lead of picked.slice(0, opts.limit)) {
    const domain = normDomain(lead.url ?? "");
    const id = await createDraft(opts.from, lead.email, leadEmail(lead, opts.postalAddress));
    record({ domain, action: "drafted", email: lead.email, messageId: id, reason: "inbound lead" });
    await appendRow(sheetId, tab, sheet.headers, {
      Company: domain.split(".")[0] ?? domain,
      Domain: domain,
      Segment: "Inbound",
      Status: "Scanned - ready",
      Email: lead.email,
      "Email check": "inbound (consented)",
      "Next action": "Review inbound draft",
      "Next action date": today,
      Critical: lead.critical,
      "Key finding": joinNames(byProminence(lead.vendors).slice(0, 3)),
      Notes: `${today}: outreach bot - free-scan lead, draft written`,
    });
    drafted.push(lead.email);
  }
  return drafted;
}

// ---------- sync checkpoint ----------

const sinceFile = resolve(repoRoot(), ".outreach", "inbound-since");

export function inboundSince(): Date {
  if (existsSync(sinceFile)) {
    const d = new Date(readFileSync(sinceFile, "utf8").trim());
    if (!Number.isNaN(d.getTime())) return d;
  }
  // First run: look back a day so nothing recent slips by.
  return new Date(Date.now() - 86_400_000);
}

export function saveInboundSince(d: Date): void {
  mkdirSync(resolve(repoRoot(), ".outreach"), { recursive: true });
  writeFileSync(sinceFile, d.toISOString());
}
