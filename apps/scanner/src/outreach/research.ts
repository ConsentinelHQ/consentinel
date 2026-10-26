import { findPerson, wantedTitle } from "./contacts.js";
import { normDomain, updateRow, type Sheet, type SheetRow } from "./google.js";
import { nyDate, parseDay } from "./state.js";

/**
 * Contact research for rows the automatic lookup couldn't fill. Claw finds a
 * person's name and title on the web; this code is the only thing that turns a
 * name into an address, and only a verified-valid one reaches the sheet.
 */

/** Written to Email check so the backlog knows research filled this row. */
export const RESEARCHED = "valid (researched)";
/** Note prefix for every attempt, found or not. */
const TRIED = "contact research";
/** Days before research tries the same row again. */
export const RETRY_DAYS = 30;
/** Names tried per row, ever. Past this a person should look. */
export const MAX_NAMES = 3;

const HANDS_OFF = /do not|don't|hold|avoid|skip|unsubscribe|not interested/i;

export interface Need {
  domain: string;
  /** Names already tried for this row, so research doesn't repeat them. */
  tried: string[];
}

function triedNames(notes: string): string[] {
  return [...notes.matchAll(/contact research: ([^(|]+?) \(/g)].map((m) => (m[1] ?? "").trim());
}

function lastTried(notes: string): string | null {
  const days = [...notes.matchAll(/(\d{4}-\d{2}-\d{2}): outreach bot - contact research/g)].map(
    (m) => m[1] ?? "",
  );
  return days.sort().pop() ?? null;
}

/** Never-emailed backlog rows whose automatic lookup came up empty. */
/**
 * `sameRun`: attempts logged today don't start the wait, so a run can try a
 * second person or log a skip after a first name came back unverified.
 */
export function needsContact(rows: SheetRow[], today: string, sameRun = false): SheetRow[] {
  const cutoff = new Date(`${today}T12:00:00Z`).getTime() - RETRY_DAYS * 86_400_000;
  return rows.filter(({ values: v }) => {
    if (v["Status"] !== "Scanned - ready" || v["First email"]) return false;
    // Hand-written variants too: "Find contact on LinkedIn (Hunter had none)", "Contact lookup".
    // A bounced contact ("Find new contact") already has a first email and is excluded above.
    if (!/^(find\b.*\bcontacts?\b|contact lookup\b)/i.test((v["Next action"] ?? "").trim()))
      return false;
    if ((v["Email"] ?? "").includes("@")) return false;
    const notes = v["Notes"] ?? "";
    // The bot's own research notes ("skipped", "not found") aren't a person's hands-off flag.
    const human = notes
      .split("|")
      .filter((part) => !part.includes(`outreach bot - ${TRIED}`))
      .join("|");
    if (HANDS_OFF.test(human)) return false;
    if (triedNames(notes).length >= MAX_NAMES) return false;
    const last = parseDay(lastTried(notes) ?? "");
    if (last && !(sameRun && last === today) && new Date(`${last}T12:00:00Z`).getTime() > cutoff)
      return false;
    return normDomain(v["Domain"] ?? "") !== "";
  });
}

export function needList(rows: SheetRow[], today: string, limit: number): Need[] {
  return needsContact(rows, today)
    .slice(0, limit)
    .map((r) => ({
      domain: normDomain(r.values["Domain"] ?? ""),
      tried: triedNames(r.values["Notes"] ?? ""),
    }));
}

/** Research found nobody solid: log it so the row waits RETRY_DAYS instead of nightly. */
export async function skipContact(
  sheetId: string,
  tab: string,
  sheet: Sheet,
  input: { domain: string; reason: string },
): Promise<SetResult> {
  const domain = normDomain(input.domain);
  const today = nyDate(new Date());
  const row = needsContact(sheet.rows, today, true).find(
    (r) => normDomain(r.values["Domain"] ?? "") === domain,
  );
  if (!row) return { domain, status: "rejected", reason: "not a row that needs a contact" };
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

export type SetResult =
  | { domain: string; status: "found"; email: string }
  | { domain: string; status: "not found" | "rejected" | "skipped"; reason: string };

/** Plain name: letters, hyphens, apostrophes, periods. Two to four words. */
export function cleanName(name: string): string | null {
  const n = name.replace(/\s+/g, " ").trim();
  if (n.length > 60 || !/^[\p{L}'.-]+(?: [\p{L}'.-]+){1,3}$/u.test(n)) return null;
  return n;
}

export async function setContact(
  sheetId: string,
  tab: string,
  sheet: Sheet,
  input: { domain: string; name: string; title: string; source: string },
): Promise<SetResult> {
  const domain = normDomain(input.domain);
  const today = nyDate(new Date());
  const row = needsContact(sheet.rows, today, true).find(
    (r) => normDomain(r.values["Domain"] ?? "") === domain,
  );
  if (!row) return { domain, status: "rejected", reason: "not a row that needs a contact" };
  const name = cleanName(input.name);
  if (!name) return { domain, status: "rejected", reason: "name must be a plain full name" };
  const title = input.title.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!wantedTitle(title)) {
    return { domain, status: "rejected", reason: `"${title}" isn't a role we email` };
  }
  if (!/^https?:\/\//i.test(input.source.trim())) {
    return {
      domain,
      status: "rejected",
      reason: "source must be the page URL where you found them",
    };
  }
  if (triedNames(row.values["Notes"] ?? "").some((t) => t.toLowerCase() === name.toLowerCase())) {
    return { domain, status: "rejected", reason: "already tried this name" };
  }

  const hit = await findPerson(domain, name);
  const prior = row.values["Notes"] ?? "";
  const source = input.source.trim().slice(0, 200);
  if (typeof hit === "string") {
    const n = `${today}: outreach bot - ${TRIED}: ${name} (${title}) not found, ${hit}`;
    await updateRow(sheetId, tab, sheet.headers, row.rowNumber, {
      Notes: prior ? `${prior} | ${n}` : n,
    });
    return { domain, status: "not found", reason: hit };
  }
  const n = `${today}: outreach bot - ${TRIED}: ${name} (${title}) found via ${hit.source}, source ${source}`;
  await updateRow(sheetId, tab, sheet.headers, row.rowNumber, {
    Contact: name,
    Title: title,
    Email: hit.email,
    "Email check": RESEARCHED,
    "Next action": "Draft first email",
    Notes: prior ? `${prior} | ${n}` : n,
  });
  return { domain, status: "found", email: hit.email };
}
