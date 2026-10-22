import type { Contact } from "./contacts.js";
import { normDomain, type SheetRow } from "./google.js";

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
