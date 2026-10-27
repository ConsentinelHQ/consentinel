import { findPerson, roleFor, type Role } from "./contacts.js";
import { ensureHeaders, normDomain, updateRow, type Sheet, type SheetRow } from "./google.js";
import { MAX_NAMES, RESEARCHED, cleanName, type SetResult } from "./research.js";
import { addBusinessDays, dayToDate, nyDate, parseDay } from "./state.js";
import { EXTRA_HEADERS, SLOTS, col, members, type Slot } from "./team.js";

/**
 * Colleague research: rows where contact 1 is already drafted or emailed but
 * the automatic lookup left a role empty. Claw finds a name on the web; code
 * verifies the address and fills slot 2 or 3. The 2am run drafts their email.
 */

const TRIED = "team research";
/** A colleague email this long after the first one reads as a fresh cold email. Stop. */
export const WINDOW_DAYS = 5;
const ROLES: Role[] = ["owner", "risk", "budget"];
const HANDS_OFF = /do not|don't|hold|avoid|skip|unsubscribe|not interested|reply from|stop/i;

export interface TeamNeed {
  domain: string;
  /** People already on the row, so research doesn't find them again. */
  have: { name: string; title: string }[];
  /** Roles nobody on the row covers yet. */
  missing: Role[];
  /** Names already tried for colleagues. */
  tried: string[];
}

function triedNames(notes: string): string[] {
  return [...notes.matchAll(/team research: ([^(|]+?) \(/g)].map((m) => (m[1] ?? "").trim());
}

/** Roles not covered by anyone on the row. Unknown titles cover nothing. */
export function missingRoles(v: Record<string, string>): Role[] {
  const have = new Set(members(v).map((m) => roleFor(m.title)));
  return ROLES.filter((r) => !have.has(r));
}

function freeSlot(v: Record<string, string>): Slot | null {
  return SLOTS.find((n) => !(v[col("Email", n)] ?? "").includes("@")) ?? null;
}

/**
 * Contact 1 already handled by the run (draft waiting or sent within the
 * window), a slot free, a role uncovered, not hands-off, not given up on.
 */
export function needsTeam(rows: SheetRow[], today: string): SheetRow[] {
  return rows.filter(({ values: v }) => {
    const status = v["Status"] ?? "";
    if (status !== "Scanned - ready" && status !== "Emailed") return false;
    if (!(v["Email"] ?? "").includes("@") || /bounced/i.test(v["Email check"] ?? "")) return false;
    const first = parseDay(v["First email"]);
    if (first) {
      if (nyDate(addBusinessDays(dayToDate(first), WINDOW_DAYS)) <= today) return false;
    } else if (!/^review gmail drafts? and send/i.test(v["Next action"] ?? "")) {
      // Not drafted yet: the run's own lookup goes first.
      return false;
    }
    const notes = v["Notes"] ?? "";
    const human = notes
      .split("|")
      .filter((part) => !part.includes("outreach bot - "))
      .join("|");
    if (HANDS_OFF.test(human)) return false;
    if (notes.includes(`${TRIED} skipped`)) return false;
    if (triedNames(notes).length >= MAX_NAMES) return false;
    if (!freeSlot(v) || missingRoles(v).length === 0) return false;
    return normDomain(v["Domain"] ?? "") !== "";
  });
}

export function teamNeedList(rows: SheetRow[], today: string, limit: number): TeamNeed[] {
  return needsTeam(rows, today)
    .slice(0, limit)
    .map(({ values: v }) => ({
      domain: normDomain(v["Domain"] ?? ""),
      have: members(v).map((m) => ({ name: m.fullName, title: m.title })),
      missing: missingRoles(v),
      tried: triedNames(v["Notes"] ?? ""),
    }));
}

const rowFor = (sheet: Sheet, domain: string, today: string): SheetRow | undefined =>
  needsTeam(sheet.rows, today).find((r) => normDomain(r.values["Domain"] ?? "") === domain);

export async function setTeam(
  sheetId: string,
  tab: string,
  sheet: Sheet,
  input: { domain: string; name: string; title: string; source: string },
): Promise<SetResult> {
  const domain = normDomain(input.domain);
  const today = nyDate(new Date());
  const row = rowFor(sheet, domain, today);
  if (!row) return { domain, status: "rejected", reason: "not a row that needs a colleague" };
  const v = row.values;
  const name = cleanName(input.name);
  if (!name) return { domain, status: "rejected", reason: "name must be a plain full name" };
  const title = input.title.replace(/\s+/g, " ").trim().slice(0, 80);
  const role = roleFor(title);
  const missing = missingRoles(v);
  if (!role || !missing.includes(role)) {
    return {
      domain,
      status: "rejected",
      reason: `"${title}" doesn't fill a missing role (need: ${missing.join(", ")})`,
    };
  }
  if (!/^https?:\/\//i.test(input.source.trim())) {
    return {
      domain,
      status: "rejected",
      reason: "source must be the page URL where you found them",
    };
  }
  const known = [...members(v).map((m) => m.fullName), ...triedNames(v["Notes"] ?? "")];
  if (known.some((k) => k.toLowerCase() === name.toLowerCase())) {
    return { domain, status: "rejected", reason: "already on this row or already tried" };
  }

  const hit = await findPerson(
    domain,
    name,
    members(v).map((m) => m.email),
  );
  const prior = v["Notes"] ?? "";
  const source = input.source.trim().slice(0, 200);
  if (typeof hit === "string") {
    const n = `${today}: outreach bot - ${TRIED}: ${name} (${title}) not found, ${hit}`;
    await updateRow(sheetId, tab, sheet.headers, row.rowNumber, {
      Notes: prior ? `${prior} | ${n}` : n,
    });
    return { domain, status: "not found", reason: hit };
  }
  // The colleague columns may not exist yet; writes to a missing column are dropped.
  await ensureHeaders(sheetId, tab, sheet, EXTRA_HEADERS);
  const slot = freeSlot(v)!;
  const n = `${today}: outreach bot - ${TRIED}: ${name} (${title}) found via ${hit.source}, source ${source}`;
  const fields = {
    [col("Contact", slot)]: name,
    [col("Title", slot)]: title,
    [col("Email", slot)]: hit.email,
    [col("Email check", slot)]: RESEARCHED,
    Notes: prior ? `${prior} | ${n}` : n,
  };
  Object.assign(v, fields);
  await updateRow(sheetId, tab, sheet.headers, row.rowNumber, fields);
  return { domain, status: "found", email: hit.email };
}

/** Nobody solid for the missing roles: stop listing this row. */
export async function skipTeam(
  sheetId: string,
  tab: string,
  sheet: Sheet,
  input: { domain: string; reason: string },
): Promise<SetResult> {
  const domain = normDomain(input.domain);
  const today = nyDate(new Date());
  const row = rowFor(sheet, domain, today);
  if (!row) return { domain, status: "rejected", reason: "not a row that needs a colleague" };
  const reason =
    input.reason
      .replace(/[|\s]+/g, " ")
      .trim()
      .slice(0, 120) || "no fitting person";
  const prior = row.values["Notes"] ?? "";
  const n = `${today}: outreach bot - ${TRIED} skipped: ${reason}`;
  await updateRow(sheetId, tab, sheet.headers, row.rowNumber, {
    Notes: prior ? `${prior} | ${n}` : n,
  });
  return { domain, status: "skipped", reason };
}

/** "team research: Jane Doe (General Counsel) found via anymail" entries. */
export function foundNames(notes: string): { name: string; title: string }[] {
  return [...notes.matchAll(/team research: ([^(|]+?) \(([^)|]*)\) found via/g)].map((m) => ({
    name: (m[1] ?? "").trim(),
    title: (m[2] ?? "").trim(),
  }));
}

/**
 * Colleagues research found but the sheet never stored, from before the columns
 * existed. Re-verifies each address (it isn't in the notes) and fills a slot.
 * Same window and hands-off rules as research, so nothing stale comes back.
 */
export async function repairTeam(
  sheetId: string,
  tab: string,
  sheet: Sheet,
  log: (s: string) => void = () => undefined,
): Promise<string[]> {
  await ensureHeaders(sheetId, tab, sheet, EXTRA_HEADERS);
  const today = nyDate(new Date());
  const restored: string[] = [];
  for (const row of sheet.rows) {
    const v = row.values;
    const status = v["Status"] ?? "";
    if (status !== "Scanned - ready" && status !== "Emailed") continue;
    const first = parseDay(v["First email"]);
    if (first && nyDate(addBusinessDays(dayToDate(first), WINDOW_DAYS)) <= today) continue;
    const have = members(v).map((m) => m.fullName.toLowerCase());
    for (const { name, title } of foundNames(v["Notes"] ?? "")) {
      if (have.includes(name.toLowerCase())) continue;
      const slot = freeSlot(v);
      if (!slot) break;
      const domain = normDomain(v["Domain"] ?? "");
      const hit = await findPerson(
        domain,
        name,
        members(v).map((m) => m.email),
      );
      if (typeof hit === "string") {
        log(`team   ${domain}: couldn't restore ${name}, ${hit}`);
        continue;
      }
      const prior = v["Notes"] ?? "";
      const n = `${today}: outreach bot - restored colleague ${name}`;
      const fields = {
        [col("Contact", slot)]: name,
        [col("Title", slot)]: title,
        [col("Email", slot)]: hit.email,
        [col("Email check", slot)]: RESEARCHED,
        Notes: prior ? `${prior} | ${n}` : n,
      };
      Object.assign(v, fields);
      await updateRow(sheetId, tab, sheet.headers, row.rowNumber, fields);
      have.push(name.toLowerCase());
      restored.push(`${domain} (${name})`);
    }
  }
  return restored;
}
