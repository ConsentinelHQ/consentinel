import type { Contact } from "./contacts.js";
import { normDomain, type SheetRow } from "./google.js";
import type { Entry } from "./state.js";

/**
 * The sheet's own backlog: rows already scanned and marked "Scanned - ready"
 * that were never emailed. Anything Charlie flagged by hand is left alone.
 */

/** Notes that mean a person decided this row needs a human. */
const HANDS_OFF = /do not|don't|hold|avoid|weak|skip|already (emailed|contacted)|wait/i;

export function backlog(rows: SheetRow[]): SheetRow[] {
  return rows
    .filter(({ values: v }) => {
      const t = Number(v["Tier"]);
      return (
        v["Status"] === "Scanned - ready" &&
        !v["First email"] &&
        (t === 1 || t === 2) &&
        !HANDS_OFF.test(v["Notes"] ?? "") &&
        // Already drafted by the bot: the sheet knows even when this machine's ledger doesn't.
        !/review gmail draft/i.test(v["Next action"] ?? "") &&
        !/outreach bot - (drafted|sent)/i.test(v["Notes"] ?? "") &&
        normDomain(v["Domain"] ?? "") !== ""
      );
    })
    .sort(
      (a, b) =>
        Number(a.values["Tier"]) - Number(b.values["Tier"]) ||
        Number(b.values["Critical"] || 0) - Number(a.values["Critical"] || 0),
    );
}

/** A verified address already in the sheet saves a lookup credit. */
export function sheetContact(v: Record<string, string>): Contact | null {
  const email = v["Email"]?.trim();
  if (!email || !/^valid\b/i.test(v["Email check"] ?? "")) return null;
  const fullName = v["Contact"]?.trim() ?? "";
  return {
    firstName: fullName.split(/\s+/)[0] ?? "",
    fullName,
    email,
    title: v["Title"] ?? "",
    verified: "valid",
    source: "sheet",
  };
}

export const RETRY_AFTER_DAYS = 30;

/** Domains skipped within the window. Errors (quota, outage) are left out so they retry. */
export function recentlyTried(ledger: Entry[], now: Date, days: number): Set<string> {
  const since = now.getTime() - days * 86_400_000;
  return new Set(
    ledger
      .filter((e) => e.action === "skipped" && new Date(e.at).getTime() >= since)
      .map((e) => e.domain),
  );
}

/** Every address on this row that has bounced: the current one plus any in the notes. */
export function bouncedEmails(v: Record<string, string>): string[] {
  const found = new Set<string>();
  if (/bounced/i.test(v["Email check"] ?? "") && v["Email"]?.includes("@")) {
    found.add(v["Email"].trim().toLowerCase());
  }
  for (const m of (v["Notes"] ?? "").matchAll(/bounced:\s*([^\s|,;]+@[^\s|,;]+)/gi)) {
    if (m[1]) found.add(m[1].toLowerCase());
  }
  return [...found];
}

/** Two dead addresses at one company is enough; past that a human should look. */
export const MAX_BOUNCES = 2;

/** Rows whose contact bounced and still need a new person, under the bounce limit. */
export function bouncedRows(rows: SheetRow[]): SheetRow[] {
  return rows.filter(({ values: v }) => {
    if (["Dead", "Customer", "Meeting", "Proposal", "Replied"].includes(v["Status"] ?? ""))
      return false;
    if (!/bounced/i.test(v["Email check"] ?? "")) return false;
    if (!/find new contact/i.test(v["Next action"] ?? "")) return false;
    if (HANDS_OFF.test(v["Notes"] ?? "") && !/bounced/i.test(v["Notes"] ?? "")) return false;
    return bouncedEmails(v).length < MAX_BOUNCES && normDomain(v["Domain"] ?? "") !== "";
  });
}
