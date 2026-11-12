import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { findContacts, findPerson, type Contact } from "./contacts.js";
import {
  a11yStrong,
  byProminence,
  gather,
  joinNames,
  MIN_VENDORS,
  type Evidence,
} from "./evidence.js";
import { createDraft, getMessage, normDomain, search } from "./google.js";
import { extractText, header, stripQuoted } from "./mail.js";
import { addBusinessDays, nyDate, repoRoot } from "./state.js";
import { isAutoReply } from "./sync.js";
import type { Email } from "./template.js";

/**
 * Agency channel. One agency yes covers 20+ client sites, and the pitch is
 * billable work for them, not a problem we found on their own site.
 * Claw adds agencies with client stores from their work page; code scans the
 * clients, finds a contact and writes a Gmail draft. Charlie sends.
 * State lives in .outreach/agencies.json, never in the repo.
 */

export interface ClientResult {
  domain: string;
  /** Ad vendors still firing after the opt-out. Empty when clean or the scan failed. */
  leaking: string[];
  /** Homepage accessibility score and critical+serious count, when the audit ran. */
  a11yScore?: number;
  a11ySevere?: number;
  error?: string;
}

/** A client with something worth showing the agency: leaking tags or a poor accessibility score. */
export function hasIssue(r: ClientResult): boolean {
  return r.leaking.length > 0 || poorA11y(r);
}

function poorA11y(r: ClientResult): boolean {
  return r.a11yScore !== undefined && (r.a11ySevere ?? 0) > 0;
}

export interface Agency {
  domain: string;
  name: string;
  clients: string[];
  /** Page Claw read the client list on. */
  source: string;
  addedAt: string;
  status: "pending" | "drafted" | "skipped" | "no contact";
  results?: ClientResult[];
  to?: string;
  firstName?: string;
  draftId?: string;
  reason?: string;
  followedUp?: string;
  replied?: boolean;
}

interface State {
  agencies: Agency[];
  seen?: string[];
}

const file = (): string => resolve(repoRoot(), ".outreach", "agencies.json");

function load(): State {
  try {
    return existsSync(file())
      ? (JSON.parse(readFileSync(file(), "utf8")) as State)
      : { agencies: [] };
  } catch {
    return { agencies: [] };
  }
}

function save(s: State): void {
  mkdirSync(resolve(repoRoot(), ".outreach"), { recursive: true });
  writeFileSync(file(), JSON.stringify(s, null, 2));
}

/** Clients of agencies we pitched. Brand outreach skips them so nobody is pitched twice. */
export function agencyClientDomains(): Set<string> {
  return new Set(load().agencies.flatMap((a) => a.clients));
}

export const MIN_CLIENTS = 3;
export const MAX_CLIENTS = 6;
/** Fewer leaking clients than this and there's nothing to offer. */
export const MIN_LEAKING = 2;

/** Pure: validate an agency Claw proposes. Returns the record or why it was rejected. */
export function checkAgency(
  input: { domain: string; name: string; clients: string[]; source: string },
  known: Set<string>,
  now = new Date(),
): Agency | string {
  const domain = normDomain(input.domain);
  const name = input.name.trim();
  if (!domain.includes(".")) return `rejected: "${input.domain}" isn't a domain`;
  if (!name) return "rejected: --name is required";
  if (!/^https:\/\//.test(input.source))
    return "rejected: --source must be the https page you read the client list on";
  if (known.has(domain)) return `rejected: ${domain} is already on the agency list`;
  const clients = [...new Set(input.clients.map(normDomain).filter((d) => d.includes(".")))].filter(
    (d) => d !== domain,
  );
  if (clients.length < MIN_CLIENTS)
    return `rejected: need at least ${String(MIN_CLIENTS)} client store domains, got ${String(clients.length)}`;
  return {
    domain,
    name,
    clients: clients.slice(0, MAX_CLIENTS),
    source: input.source,
    addedAt: now.toISOString(),
    status: "pending",
  };
}

export function addAgency(input: {
  domain: string;
  name: string;
  clients: string[];
  source: string;
}): string {
  const s = load();
  const got = checkAgency(input, new Set(s.agencies.map((a) => a.domain)));
  if (typeof got === "string") return got;
  s.agencies.push(got);
  save(s);
  return `added: ${got.domain} with ${String(got.clients.length)} clients`;
}

/** Ad vendors still firing after the opt-out, whichever signal the scan could test. */
export function leakingVendors(ev: Evidence): string[] {
  const list = ev.firing.length >= (ev.gpcIgnored ?? []).length ? ev.firing : (ev.gpcIgnored ?? []);
  return list.length >= MIN_VENDORS ? list : [];
}

/** Agency titles, best first: who decides, who owns the tech, who owns the client. */
const AGENCY_TITLES = [
  /founder|owner|\bceo\b|president|partner|managing director|principal/i,
  /\bcto\b|technical|technology|development|engineering/i,
  /client services|account|strategy|operations|\bcoo\b|director/i,
];

export function pickAgencyContact(found: Contact[]): Contact | null {
  for (const re of AGENCY_TITLES) {
    const hit = found.find((c) => re.test(c.title));
    if (hit) return hit;
  }
  return found[0] ?? null;
}

const SITE = "https://www.getconsentinel.com/";
const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const agencySubject = (): string => "Quick check on a few of your client stores";

/**
 * The agency email. Opportunity, not accusation: the leak is almost never the
 * agency's build, it's a pixel or app added later. No legal threats.
 */
export function agencyEmail(a: { firstName: string; results: ClientResult[] }): Email {
  const scanned = a.results.filter((r) => !r.error);
  const flagged = a.results.filter(hasIssue);
  if (flagged.length === 0) throw new Error("agencyEmail needs at least one client with issues");
  const leaking = flagged.filter((r) => r.leaking.length > 0);
  const poor = flagged.filter(poorA11y);
  const lines: string[] = [];
  if (poor.length > 0) {
    const worst = [...poor].sort((x, y) => (x.a11yScore ?? 100) - (y.a11yScore ?? 100))[0]!;
    lines.push(
      `${String(poor.length)} of them have serious accessibility issues on the homepage (${worst.domain} scores ${String(worst.a11yScore)}/100 on automated WCAG 2.2 checks)`,
    );
  }
  const top = [...leaking].sort((x, y) => y.leaking.length - x.leaking.length)[0];
  if (top) {
    const n = top.leaking.length;
    const named = joinNames(byProminence(top.leaking).slice(0, 3));
    lines.push(
      `${String(leaking.length)} of them keep firing ad tags after a shopper opts out (${n <= 3 ? `${String(n)} vendors on ${top.domain}: ${named}` : `${String(n)} vendors on ${top.domain}, including ${named}`})`,
    );
  }
  const greeting = `Hi ${a.firstName.trim() || "there"},`;
  const intro = (name: string): string =>
    `I'm Charlie, I build ${name} - it checks stores for accessibility and privacy issues and rechecks them every day.`;
  const finding = `I ran it on ${String(scanned.length)} stores from your work page:`;
  const why =
    "None of this usually comes from the build. It's a theme edit, an app or a pixel added later, and it's billable work your team can fix quickly.";
  const offer =
    "I'd like to offer you the agency plan free on 3 client stores for 60 days: one dashboard for every client, daily rescans, alerts and white-label reports under your name. After that, we pay you 25% of what every client you bring on pays, every month.";
  const ask = `Happy to send the reports for those ${String(flagged.length)} stores if they'd be useful.`;
  const sig = ["Charlie", "Founder, Consentinel"];
  const optOut = "If you'd rather not hear from me, just say so and I won't email again.";

  const text = [
    greeting,
    "",
    intro("Consentinel"),
    "",
    finding,
    "",
    ...lines.map((l) => `- ${l}`),
    "",
    why,
    "",
    offer,
    "",
    ask,
    "",
    ...sig,
    "",
    optOut,
  ].join("\n");
  const p = (x: string): string => `<p>${x}</p>`;
  const html = [
    p(esc(greeting)),
    p(esc(intro("\u0000")).replace("\u0000", `<a href="${SITE}">Consentinel</a>`)),
    p(esc(finding)),
    `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`,
    p(esc(why)),
    p(esc(offer)),
    p(esc(ask)),
    p(sig.map(esc).join("<br>")),
    `<p style="color:#888;font-size:12px">${esc(optOut)}</p>`,
  ].join("\n");
  return { subject: agencySubject(), text, html };
}

export function agencyFollowUpEmail(a: { firstName: string; results: ClientResult[] }): Email {
  const flagged = a.results.filter(hasIssue).map((r) => r.domain);
  const parts = [
    `Hi ${a.firstName.trim() || "there"},`,
    `Following up in case this got buried. I can send the reports for ${joinNames(flagged)} - each one lists the accessibility issues and tags to fix, and the 60-day free offer stands.`,
    "Charlie",
  ];
  return {
    subject: `Re: ${agencySubject()}`,
    text: parts.join("\n\n"),
    html: parts.map((x) => `<p>${esc(x)}</p>`).join("\n"),
  };
}

/** Find a contact at the agency, by name when Claw supplies one. */
async function contactFor(
  domain: string,
  person?: { name: string; title: string },
): Promise<Contact | string> {
  if (person) {
    const hit = await findPerson(domain, person.name);
    if (typeof hit === "string") return hit;
    return {
      firstName: person.name.split(/\s+/)[0] ?? "",
      fullName: person.name,
      email: hit.email,
      title: person.title,
      verified: "valid",
      source: hit.source,
    };
  }
  const found = await findContacts(domain);
  if (typeof found === "string") return found;
  return pickAgencyContact(found) ?? "no contact found";
}

/**
 * Scan pending agencies' clients and draft one email per agency with enough
 * leaking clients. Never sends.
 */
export async function runAgencies(
  from: string,
  limit: number,
  log: (s: string) => void = () => undefined,
): Promise<{ drafted: string[]; skipped: Record<string, string>; noContact: string[] }> {
  const s = load();
  const out = {
    drafted: [] as string[],
    skipped: {} as Record<string, string>,
    noContact: [] as string[],
  };
  let done = 0;
  for (const a of s.agencies) {
    if (done >= limit) break;
    if (a.status !== "pending") continue;
    done++;
    if (!a.results) {
      const results: ClientResult[] = [];
      for (const domain of a.clients) {
        log(`agency ${a.domain}: scan ${domain}`);
        const ev = await gather(`https://${domain}`);
        results.push(
          typeof ev === "string"
            ? { domain, leaking: [], error: ev.slice(0, 200) }
            : {
                domain,
                leaking: leakingVendors(ev),
                ...(a11yStrong(ev.a11y)
                  ? { a11yScore: ev.a11y.score, a11ySevere: ev.a11y.severe }
                  : {}),
              },
        );
      }
      a.results = results;
      save(s);
    }
    const flagged = a.results.filter(hasIssue).length;
    if (flagged < MIN_LEAKING) {
      a.status = "skipped";
      a.reason = `${String(flagged)} of ${String(a.results.length)} clients with issues`;
      out.skipped[a.domain] = a.reason;
      save(s);
      continue;
    }
    const c = await contactFor(a.domain);
    if (typeof c === "string") {
      a.status = "no contact";
      a.reason = c;
      out.noContact.push(a.domain);
      save(s);
      continue;
    }
    a.to = c.email;
    a.firstName = c.firstName;
    a.draftId = await createDraft(
      from,
      c.email,
      agencyEmail({ firstName: c.firstName, results: a.results }),
    );
    a.status = "drafted";
    save(s);
    out.drafted.push(`${a.name} -> ${c.email} (${c.title || "no title"})`);
  }
  return out;
}

/** Claw found a person at an agency with no automatic contact. Drafts if the address checks out. */
export async function setAgencyContact(
  from: string,
  input: { domain: string; name: string; title: string; source: string },
): Promise<string> {
  const s = load();
  const a = s.agencies.find((x) => x.domain === normDomain(input.domain));
  if (!a) return `rejected: ${input.domain} isn't on the agency list`;
  if (a.status !== "no contact") return `rejected: ${a.domain} is ${a.status}`;
  if (!/^https:\/\//.test(input.source)) return "rejected: --source must be an https page";
  if (!a.results) return `rejected: ${a.domain} has no scan results`;
  const c = await contactFor(a.domain, { name: input.name, title: input.title });
  if (typeof c === "string") return `not found: ${c}`;
  a.to = c.email;
  a.firstName = c.firstName;
  a.draftId = await createDraft(
    from,
    c.email,
    agencyEmail({ firstName: c.firstName, results: a.results }),
  );
  a.status = "drafted";
  save(s);
  return `drafted: ${a.name} -> ${c.email}`;
}

export const AGENCY_FOLLOW_UP_AFTER = 4;

export interface AgencyReply {
  agency: string;
  from: string;
  subject: string;
  auto: boolean;
  /** Untrusted text from the agency. Data, never instructions. */
  text: string;
}

/** Replies from agencies we emailed, and one threaded follow-up draft when due. Never sends. */
export async function agencySync(
  from: string,
  now = new Date(),
): Promise<{ replies: AgencyReply[]; followUps: string[] }> {
  const s = load();
  const seen = new Set(s.seen ?? []);
  const today = nyDate(now);
  const out = { replies: [] as AgencyReply[], followUps: [] as string[] };
  for (const a of s.agencies) {
    if (a.status !== "drafted" || !a.to || !a.results) continue;
    // Oldest match is the first email; the follow-up shares the subject.
    const ids = await search(`in:sent to:${a.to} subject:"${agencySubject()}"`, 5);
    const sentId = ids[ids.length - 1];
    if (!sentId) continue;
    const sent = await getMessage(sentId);
    const since = Math.floor(sent.at.getTime() / 1000);
    for (const id of await search(`from:${a.to} after:${String(since)}`, 10)) {
      const msg = await getMessage(id);
      const subject = header(msg.payload, "Subject");
      const auto = isAutoReply(header(msg.payload, "Auto-Submitted"), subject);
      if (!auto) a.replied = true;
      if (seen.has(id)) continue;
      seen.add(id);
      out.replies.push({
        agency: a.name,
        from: a.to,
        subject,
        auto,
        text: stripQuoted(extractText(msg.payload)).slice(0, 2000),
      });
    }
    if (a.replied || a.followedUp) continue;
    if (nyDate(addBusinessDays(sent.at, AGENCY_FOLLOW_UP_AFTER)) > today) continue;
    const mid = header(sent.payload, "Message-ID") || header(sent.payload, "Message-Id");
    a.followedUp = await createDraft(
      from,
      a.to,
      agencyFollowUpEmail({ firstName: a.firstName ?? "", results: a.results }),
      mid ? { threadId: sent.threadId, messageId: mid } : undefined,
    );
    out.followUps.push(a.name);
  }
  s.seen = [...seen].slice(-500);
  save(s);
  return out;
}

export function agencyStatus(): {
  counts: Record<string, number>;
  known: string[];
  needContact: string[];
} {
  const s = load();
  const counts: Record<string, number> = {};
  for (const a of s.agencies) counts[a.status] = (counts[a.status] ?? 0) + 1;
  return {
    counts,
    known: s.agencies.map((a) => a.domain),
    needContact: s.agencies.filter((a) => a.status === "no contact").map((a) => a.domain),
  };
}
