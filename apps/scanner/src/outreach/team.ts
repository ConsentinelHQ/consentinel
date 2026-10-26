import { deleteDraft } from "./google.js";
import { roleFor, type Role, type RoleContact } from "./contacts.js";
import type { Entry } from "./state.js";

/**
 * Up to three people per company, one per role, each in their own thread.
 * Contact 1 keeps the original columns; 2 and 3 get numbered copies.
 */

export const TEAM_SIZE = 3;
export const SLOTS = [2, 3] as const;
export type Slot = 1 | (typeof SLOTS)[number];

/** "Email" for contact 1, "Email 2" for contact 2. */
export const col = (base: string, n: Slot): string => (n === 1 ? base : `${base} ${String(n)}`);

const BASES = ["Contact", "Title", "Email", "Email check", "Report link"] as const;
export const EXTRA_HEADERS: readonly string[] = SLOTS.flatMap((n) => BASES.map((b) => col(b, n)));

export interface Member {
  slot: Slot;
  fullName: string;
  firstName: string;
  email: string;
  title: string;
  check: string;
  reportLink: string;
}

/** Everyone on a row with an address, contact 1 first. */
export function members(v: Record<string, string>): Member[] {
  const out: Member[] = [];
  for (const n of [1, ...SLOTS] as Slot[]) {
    const email = (v[col("Email", n)] ?? "").trim().toLowerCase();
    if (!email.includes("@")) continue;
    const fullName = (v[col("Contact", n)] ?? "").trim();
    out.push({
      slot: n,
      fullName,
      firstName: fullName.split(/\s+/)[0] ?? "",
      email,
      title: v[col("Title", n)] ?? "",
      check: v[col("Email check", n)] ?? "",
      reportLink: v[col("Report link", n)] ?? "",
    });
  }
  return out;
}

/**
 * Colleagues for the primary contact: roles the primary doesn't already cover,
 * different people, at most two.
 */
export function pickExtras(
  primary: { email: string; title: string },
  found: RoleContact[],
): RoleContact[] {
  const taken = new Set<Role>();
  const own = roleFor(primary.title);
  if (own) taken.add(own);
  const seen = new Set([primary.email.toLowerCase()]);
  const out: RoleContact[] = [];
  for (const c of found) {
    const email = c.email.toLowerCase();
    if (taken.has(c.role) || seen.has(email)) continue;
    taken.add(c.role);
    seen.add(email);
    out.push(c);
    if (out.length >= TEAM_SIZE - 1) break;
  }
  return out;
}

/** Sheet columns for an extra contact. */
export function extraCols(n: Slot, c: RoleContact, reportUrl?: string): Record<string, string> {
  return {
    [col("Contact", n)]: c.fullName,
    [col("Title", n)]: c.title,
    [col("Email", n)]: c.email,
    [col("Email check", n)]: `${c.verified} (${c.source})`,
    ...(reportUrl ? { [col("Report link", n)]: reportUrl } : {}),
  };
}

/** Bot drafts that can go once the company has answered. Inbound lead notes stay. */
export function draftsToStop(ledger: Entry[], domain: string, before: Date): Entry[] {
  return ledger.filter(
    (e) =>
      e.domain === domain &&
      e.action === "drafted" &&
      Boolean(e.messageId) &&
      e.reason !== "inbound lead" &&
      new Date(e.at).getTime() < before.getTime(),
  );
}

/**
 * Someone at the company replied: remove every unsent bot draft to that company
 * so nobody else gets a cold email or follow-up. Sent drafts are already gone
 * from Gmail and come back false.
 */
export async function stopDrafts(
  ledger: Entry[],
  domain: string,
  replyAt: Date,
  remove: (id: string) => Promise<boolean> = deleteDraft,
): Promise<string[]> {
  const deleted: string[] = [];
  for (const e of draftsToStop(ledger, domain, replyAt)) {
    try {
      if (await remove(e.messageId!)) deleted.push(e.email ?? e.messageId!);
    } catch {
      // A draft we can't delete is left for Charlie; the row already says Replied.
    }
  }
  return deleted;
}
