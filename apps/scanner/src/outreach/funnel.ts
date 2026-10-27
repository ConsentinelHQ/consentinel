import { resolveTxt } from "node:dns/promises";
import { roleFor } from "./contacts.js";
import { address, extractText, header } from "./mail.js";
import { getMessage, normDomain, search, type SheetRow } from "./google.js";
import { domainFromSubject } from "./referral.js";
import { members } from "./team.js";
import { fetchViews, scanIdFromLink, type View } from "./views.js";

/**
 * Where cold email breaks: not delivered, not opened, or opened and ignored.
 * Read only. Built from Gmail's Sent folder, the sheet and report views.
 */

export interface Send {
  to: string;
  domain: string;
  at: Date;
  followUp: boolean;
  /** Report the email linked to, when it had one. */
  scanId: string | null;
}

export interface Person {
  email: string;
  domain: string;
  role: string;
  mode: string;
  firstAt: Date;
  followedUp: boolean;
  linked: boolean;
  bounced: boolean;
  opened: boolean;
  /** Hours from the first email to the first open. */
  hoursToOpen: number | null;
  /** Someone at the company wrote back, any answer. */
  replied: boolean;
}

export interface Bucket {
  label: string;
  people: number;
  delivered: number;
  linked: number;
  opened: number;
  replied: number;
}

export interface Dns {
  domain: string;
  spf: boolean;
  dmarc: string | null;
  dkim: boolean;
}

export interface Funnel {
  from: string[];
  people: Person[];
  total: Bucket;
  byRole: Bucket[];
  byMode: Bucket[];
  byWeek: Bucket[];
  medianHoursToOpen: number | null;
  dns: Dns[];
  verdict: string[];
}

const REPLIED = /reply from|not now:|UNSUBSCRIBED|interested/i;
const REPLIED_STATUS = new Set(["Replied", "Meeting", "Proposal", "Customer"]);

/** Pure: one row per person we actually emailed, matched to the sheet. */
export function people(sends: Send[], rows: SheetRow[], views: View[]): Person[] {
  const byEmail = new Map<string, { row: SheetRow; title: string; check: string }>();
  for (const row of rows)
    for (const m of members(row.values))
      byEmail.set(m.email, { row, title: m.title, check: m.check });
  const viewed = new Map(views.map((v) => [v.scanId.toLowerCase(), v]));
  const sorted = [...sends].sort((a, b) => a.at.getTime() - b.at.getTime());
  const out = new Map<string, Person>();
  for (const s of sorted) {
    const hit = byEmail.get(s.to);
    if (!hit) continue;
    const prior = out.get(s.to);
    if (prior) {
      if (s.followUp) prior.followedUp = true;
      if (s.scanId && !prior.linked) prior.linked = true;
      continue;
    }
    const v = hit.row.values;
    const view = s.scanId ? viewed.get(s.scanId) : undefined;
    const firstView = view ? new Date(view.firstViewedAt) : null;
    out.set(s.to, {
      email: s.to,
      domain: s.domain,
      role: roleFor(hit.title) ?? (hit.title ? "other" : "unknown"),
      mode: (v["Scan mode"] ?? "").trim().toLowerCase() || "unknown",
      firstAt: s.at,
      followedUp: s.followUp,
      linked: Boolean(s.scanId),
      bounced: /bounced/i.test(hit.check),
      opened: Boolean(view && view.views > 0),
      hoursToOpen:
        firstView && firstView >= s.at
          ? Math.round((firstView.getTime() - s.at.getTime()) / 3_600_000)
          : null,
      replied: REPLIED_STATUS.has(v["Status"] ?? "") || REPLIED.test(v["Notes"] ?? ""),
    });
  }
  // A later link (follow-up with a report) can still be opened: check every report on the row.
  for (const p of out.values()) {
    if (p.opened) continue;
    const row = byEmail.get(p.email)!.row;
    for (const m of members(row.values)) {
      if (m.email !== p.email) continue;
      const id = scanIdFromLink(m.reportLink);
      const view = id ? viewed.get(id) : undefined;
      if (view && view.views > 0) {
        p.opened = true;
        p.linked = true;
      }
    }
  }
  return [...out.values()];
}

export function bucket(label: string, ps: Person[]): Bucket {
  const delivered = ps.filter((p) => !p.bounced);
  return {
    label,
    people: ps.length,
    delivered: delivered.length,
    linked: delivered.filter((p) => p.linked).length,
    opened: delivered.filter((p) => p.opened).length,
    replied: delivered.filter((p) => p.replied).length,
  };
}

function groupBy(ps: Person[], key: (p: Person) => string): Bucket[] {
  const groups = new Map<string, Person[]>();
  for (const p of ps) groups.set(key(p), [...(groups.get(key(p)) ?? []), p]);
  return [...groups.entries()]
    .map(([k, g]) => bucket(k, g))
    .sort((a, b) => b.people - a.people || a.label.localeCompare(b.label));
}

/** Monday of the week, as YYYY-MM-DD. */
export function weekOf(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

const pct = (n: number, d: number): number => (d === 0 ? 0 : Math.round((n / d) * 100));

/** Pure: what the numbers say, most important first. */
export function verdict(total: Bucket, dns: Dns[]): string[] {
  const out: string[] = [];
  for (const d of dns) {
    const gaps = [d.spf ? null : "SPF", d.dkim ? null : "DKIM", d.dmarc ? null : "DMARC"].filter(
      Boolean,
    );
    if (gaps.length)
      out.push(`Fix email authentication first: ${d.domain} has no ${gaps.join(", ")}.`);
    else if (d.dmarc && /p=none/i.test(d.dmarc))
      out.push(
        `${d.domain}: DMARC is p=none. Fine for now; move to quarantine once sending is steady.`,
      );
  }
  if (total.delivered < 15) {
    out.push(`Only ${String(total.delivered)} delivered: too few to judge. Keep sending.`);
    return out;
  }
  if (total.replied > 0)
    out.push(
      `${String(total.replied)} of ${String(total.delivered)} wrote back (${String(pct(total.replied, total.delivered))}%).`,
    );
  if (total.linked < 10) {
    out.push(
      `Only ${String(total.linked)} emails had a report link, so opens can't be measured yet. Most went out before links worked.`,
    );
    return out;
  }
  const openRate = pct(total.opened, total.linked);
  if (openRate < 10)
    out.push(
      `${String(openRate)}% of linked emails got a report open. That points to not being seen: spam folder, filtering, or a subject people skip. Fix delivery before the pitch.`,
    );
  else if (total.replied === 0)
    out.push(
      `${String(openRate)}% opened the report but nobody wrote back. They see it and don't act: the ask or the report is the problem, not delivery.`,
    );
  else out.push(`${String(openRate)}% opened the report.`);
  return out;
}

async function txt(name: string): Promise<string[]> {
  try {
    return (await resolveTxt(name)).map((r) => r.join(""));
  } catch {
    return [];
  }
}

export async function checkDns(domain: string): Promise<Dns> {
  const [root, dmarc, dkim] = await Promise.all([
    txt(domain),
    txt(`_dmarc.${domain}`),
    txt(`google._domainkey.${domain}`),
  ]);
  return {
    domain,
    spf: root.some((r) => /^v=spf1/i.test(r)),
    dmarc: dmarc.find((r) => /^v=DMARC1/i.test(r)) ?? null,
    dkim: dkim.some((r) => /v=DKIM1|p=/i.test(r)),
  };
}

/** Pulls sends from Gmail, then builds the funnel. */
export async function funnel(
  rows: SheetRow[],
  api: { base: string; key: string } | null,
  days = 120,
): Promise<Funnel> {
  const ids = await search(`in:sent subject:"Privacy issues on" newer_than:${String(days)}d`, 500);
  const sends: Send[] = [];
  const from = new Set<string>();
  for (const id of ids) {
    const msg = await getMessage(id);
    const subject = header(msg.payload, "Subject");
    const domain = domainFromSubject(subject);
    if (!domain) continue;
    from.add((address(header(msg.payload, "From")).split("@")[1] ?? "").toLowerCase());
    for (const to of header(msg.payload, "To").split(",").map(address).filter(Boolean)) {
      sends.push({
        to,
        domain: normDomain(domain),
        at: msg.at,
        followUp: /^re:/i.test(subject.trim()),
        scanId: scanIdFromLink(extractText(msg.payload)),
      });
    }
  }
  const views = api
    ? await fetchViews(api.base, api.key, new Date(Date.now() - days * 86_400_000)).catch(() => [])
    : [];
  const ps = people(sends, rows, views);
  const total = bucket("all", ps);
  const hours = ps
    .map((p) => p.hoursToOpen)
    .filter((h): h is number => h !== null)
    .sort((a, b) => a - b);
  const fromDomains = [...from].filter(Boolean).sort();
  const dns = await Promise.all(fromDomains.map(checkDns));
  return {
    from: fromDomains,
    people: ps,
    total,
    byRole: groupBy(ps, (p) => p.role),
    byMode: groupBy(ps, (p) => p.mode),
    byWeek: groupBy(ps, (p) => weekOf(p.firstAt)).sort((a, b) => a.label.localeCompare(b.label)),
    medianHoursToOpen: hours.length ? (hours[Math.floor(hours.length / 2)] ?? null) : null,
    dns,
    verdict: verdict(total, dns),
  };
}

/** Plain text for a terminal or Slack. */
export function renderFunnel(f: Funnel): string {
  const line = (b: Bucket): string =>
    `${b.label.padEnd(12)} ${String(b.people).padStart(4)} emailed  ${String(b.delivered).padStart(4)} delivered  ${String(b.linked).padStart(4)} linked  ${String(b.opened).padStart(3)} opened (${String(pct(b.opened, b.linked)).padStart(3)}%)  ${String(b.replied).padStart(3)} replied`;
  const out = [
    "Outreach funnel",
    "",
    line(f.total),
    `Follow-ups sent: ${String(f.people.filter((p) => p.followedUp).length)}. Median hours to first open: ${f.medianHoursToOpen === null ? "n/a" : String(f.medianHoursToOpen)}.`,
    "",
    "By role",
    ...f.byRole.map(line),
    "",
    "By finding",
    ...f.byMode.map(line),
    "",
    "By week sent",
    ...f.byWeek.map(line),
    "",
    "Sending domain",
    ...f.dns.map(
      (d) =>
        `${d.domain}: SPF ${d.spf ? "ok" : "MISSING"}, DKIM ${d.dkim ? "ok" : "MISSING"}, DMARC ${d.dmarc ?? "MISSING"}`,
    ),
    "",
    "What it says",
    ...f.verdict.map((v) => `- ${v}`),
  ];
  const opened = f.people.filter((p) => p.opened);
  if (opened.length) {
    out.push("", "Opened");
    for (const p of opened)
      out.push(
        `- ${p.domain} (${p.role}): ${p.hoursToOpen === null ? "?" : String(p.hoursToOpen)}h after sending${p.replied ? ", replied" : ""}`,
      );
  }
  return out.join("\n");
}
