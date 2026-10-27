import { roleFor } from "./contacts.js";
import { MIN_VENDORS, gather, type Evidence } from "./evidence.js";
import { createDraft, normDomain, updateRow, type Sheet, type SheetRow } from "./google.js";
import { reportLink, type ApiOpts } from "./prep.js";
import { GONE, REFERRED } from "./referral.js";
import { RESEARCHED } from "./research.js";
import { addBusinessDays, dayToDate, nyDate, parseDay, record, type Entry } from "./state.js";
import { WINDOW_DAYS } from "./team-research.js";
import { col, members, type Member } from "./team.js";
import { render } from "./template.js";

/**
 * Drafts the first email to colleagues Claw researched after contact 1 went
 * out. Drafts only: an address found from a web page always gets a human look.
 */

const LIVE = new Set(["Scanned - ready", "Emailed"]);
const HANDS_OFF = /do not|don't|hold|avoid|skip|unsubscribe|not interested|reply from|stop/i;

/**
 * Researched colleagues inside the window, plus people a left-company auto-reply
 * named (no window: they replace someone already emailed). Skips anyone already drafted or sent.
 */
export function teamDue(
  rows: SheetRow[],
  ledger: Entry[],
  today: string,
): { row: SheetRow; m: Member }[] {
  const contacted = new Set(
    ledger
      .filter((e) => e.action === "drafted" || e.action === "sent")
      .map((e) => `${e.domain}|${(e.email ?? "").toLowerCase()}`),
  );
  const out: { row: SheetRow; m: Member }[] = [];
  for (const row of rows) {
    const v = row.values;
    const live = LIVE.has(v["Status"] ?? "");
    // A referral still counts after the follow-up: nobody has read our email yet.
    if (!live && v["Status"] !== "Followed up") continue;
    const first = parseDay(v["First email"]);
    const late = Boolean(first && nyDate(addBusinessDays(dayToDate(first), WINDOW_DAYS)) <= today);
    const human = (v["Notes"] ?? "")
      .split("|")
      .filter((p) => !p.includes("outreach bot - "))
      .join("|");
    if (HANDS_OFF.test(human)) continue;
    const domain = normDomain(v["Domain"] ?? "");
    for (const m of members(v)) {
      const ok = m.check === REFERRED || (m.check === RESEARCHED && live && !late);
      if (m.slot === 1 || !ok) continue;
      if (contacted.has(`${domain}|${m.email}`)) continue;
      out.push({ row, m });
    }
  }
  return out;
}

export async function draftTeam(
  sheetId: string,
  tab: string,
  sheet: Sheet,
  ledger: Entry[],
  opts: { from: string; postalAddress: string; limit: number; reportApi: ApiOpts | null },
  log: (s: string) => void = () => undefined,
): Promise<string[]> {
  const today = nyDate(new Date());
  const drafted: string[] = [];
  // One rescan per company, shared by its colleagues.
  const evidence = new Map<string, Evidence | string>();
  for (const { row, m } of teamDue(sheet.rows, ledger, today)) {
    if (drafted.length >= opts.limit) break;
    const domain = normDomain(row.values["Domain"] ?? "");
    let ev = evidence.get(domain);
    if (ev === undefined) {
      ev = await gather(`https://${domain}`);
      evidence.set(domain, ev);
    }
    if (typeof ev === "string" || ev.firing.length < MIN_VENDORS) {
      log(`team   ${domain}: skipped, ${typeof ev === "string" ? ev : "weak evidence"}`);
      continue;
    }
    const reportUrl = opts.reportApi
      ? await reportLink(opts.reportApi, domain, ev.latest, log)
      : undefined;
    const role = roleFor(m.title);
    const email = render({
      domain,
      firstName: m.firstName,
      ev,
      postalAddress: opts.postalAddress,
      ...(reportUrl ? { reportUrl } : {}),
      ...(role ? { role } : {}),
      alsoSent: members(row.values)
        .filter((o) => o.slot !== m.slot && !GONE.test(o.check))
        .map((o) => o.fullName)
        .filter(Boolean),
    });
    try {
      const id = await createDraft(opts.from, m.email, email);
      record({
        domain,
        action: "drafted",
        email: m.email,
        messageId: id,
        reason: `draft mode, contact ${String(m.slot)} (${m.check === REFERRED ? "referred" : "researched"})`,
      });
      const prior = row.values["Notes"] ?? "";
      const n = `${today}: outreach bot - drafted for ${m.fullName} (contact ${String(m.slot)})`;
      await updateRow(sheetId, tab, sheet.headers, row.rowNumber, {
        ...(reportUrl ? { [col("Report link", m.slot)]: reportUrl } : {}),
        Notes: prior ? `${prior} | ${n}` : n,
      });
      row.values["Notes"] = prior ? `${prior} | ${n}` : n;
      drafted.push(`${domain} (${m.email})`);
      log(`team   drafted for ${m.email}`);
    } catch (error) {
      record({
        domain,
        action: "error",
        email: m.email,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return drafted;
}
