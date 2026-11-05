import { gather, MIN_VENDORS, tier } from "./evidence.js";
import {
  createDraft,
  draftExists,
  normDomain,
  search,
  updateRow,
  type Sheet,
  type SheetRow,
} from "./google.js";
import { GONE } from "./referral.js";
import { nyDate, record, type Entry } from "./state.js";
import { members, type Member } from "./team.js";
import { render } from "./template.js";

/**
 * First-email drafts (contact 1 or a colleague) that Charlie deleted before
 * sending. The ledger still says "drafted", so nothing redrafts them. This
 * rescans each company once and writes fresh drafts in the current template.
 * Follow-ups are left alone. Never sends.
 */

export interface Orphan {
  row: SheetRow;
  domain: string;
  m: Member;
  draftId: string;
}

/** Only drafts from the last two weeks: older ones were cleaned up on purpose. */
export const REDRAFT_DAYS = 14;
const FIRST_EMAIL = /^(draft mode|redraft)/;
const LIVE = new Set(["Scanned - ready", "Emailed", "Followed up"]);

/** Pure: the latest first-email draft per person, still on a live row and never sent. */
export function orphans(rows: SheetRow[], ledger: Entry[], now = new Date()): Orphan[] {
  const since = now.getTime() - REDRAFT_DAYS * 86_400_000;
  const sent = new Set(
    ledger.filter((e) => e.action === "sent").map((e) => (e.email ?? "").toLowerCase()),
  );
  const latest = new Map<string, Entry>();
  for (const e of ledger) {
    if (e.action !== "drafted" || !e.messageId || !e.email) continue;
    if (!FIRST_EMAIL.test(e.reason ?? "")) continue;
    latest.set(`${e.domain}|${e.email.toLowerCase()}`, e);
  }
  const byDomain = new Map(rows.map((r) => [normDomain(r.values["Domain"] ?? ""), r]));
  const out: Orphan[] = [];
  for (const e of latest.values()) {
    if (new Date(e.at).getTime() < since) continue;
    const email = (e.email ?? "").toLowerCase();
    if (sent.has(email)) continue;
    const row = byDomain.get(e.domain);
    if (!row || !LIVE.has(row.values["Status"] ?? "")) continue;
    const m = members(row.values).find((x) => x.email === email);
    if (!m || GONE.test(m.check)) continue;
    out.push({ row, domain: e.domain, m, draftId: e.messageId! });
  }
  return out;
}

export async function redraft(
  o: {
    sheetId: string;
    tab: string;
    sheet: Sheet;
    ledger: Entry[];
    from: string;
    postalAddress: string;
    minGpc: number;
    limit: number;
  },
  log: (s: string) => void = () => undefined,
): Promise<{
  candidates: number;
  redrafted: string[];
  stillThere: number;
  sent: string[];
  skipped: Record<string, string>;
}> {
  const found = orphans(o.sheet.rows, o.ledger);
  const out = {
    candidates: found.length,
    redrafted: [] as string[],
    stillThere: 0,
    sent: [] as string[],
    skipped: {} as Record<string, string>,
  };
  const today = nyDate(new Date());
  const notes = new Map<number, string>();
  const note = async (row: SheetRow, s: string): Promise<void> => {
    const prior = notes.get(row.rowNumber) ?? row.values["Notes"] ?? "";
    const next = `${prior ? `${prior} | ` : ""}${today}: outreach bot - ${s}`;
    notes.set(row.rowNumber, next);
    await updateRow(o.sheetId, o.tab, o.sheet.headers, row.rowNumber, { Notes: next });
  };
  // One rescan per company, shared by its people.
  const evidence = new Map<string, Awaited<ReturnType<typeof gather>>>();
  for (const x of found) {
    if (out.redrafted.length >= o.limit) break;
    if (await draftExists(x.draftId)) {
      out.stillThere++;
      continue;
    }
    // Gone because it went out: sync records the send.
    if ((await search(`in:sent to:${x.m.email}`, 1)).length) {
      out.sent.push(x.m.email);
      continue;
    }
    let ev = evidence.get(x.domain);
    if (ev === undefined) {
      log(`redraft ${x.domain}: rescan`);
      ev = await gather(`https://${x.domain}`);
      evidence.set(x.domain, ev);
    }
    if (typeof ev === "string") {
      out.skipped[x.m.email] = ev.slice(0, 200);
      continue;
    }
    if (ev.firing.length < MIN_VENDORS || tier(ev, o.minGpc) === 3) {
      out.skipped[x.m.email] = `rescan found weak evidence (${String(ev.firing.length)} vendors)`;
      continue;
    }
    const email = render({
      domain: x.domain,
      firstName: x.m.firstName,
      ev,
      postalAddress: o.postalAddress,
    });
    const id = await createDraft(o.from, x.m.email, email);
    record({
      domain: x.domain,
      action: "drafted",
      email: x.m.email,
      messageId: id,
      reason: `redraft, contact ${String(x.m.slot)}`,
    });
    await note(x.row, `redrafted for ${x.m.fullName || x.m.email} in the new template`);
    out.redrafted.push(`${x.domain} -> ${x.m.email}`);
    log(`redraft ${x.domain}: drafted for ${x.m.email}`);
  }
  return out;
}
