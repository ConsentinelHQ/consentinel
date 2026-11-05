import { gather, MIN_VENDORS, tier } from "./evidence.js";
import {
  createDraft,
  deleteDraft,
  getDraft,
  getMessage,
  normDomain,
  search,
  updateRow,
  type Sheet,
  type SheetRow,
} from "./google.js";
import { followUpEmail } from "./followup.js";
import { extractText, header } from "./mail.js";
import { GONE } from "./referral.js";
import { nyDate, record, type Entry } from "./state.js";
import { members, type Member } from "./team.js";
import { isShopify } from "./queue.js";
import { render, subjectFor } from "./template.js";

/**
 * First-email drafts (contact 1 or a colleague) that need the current template:
 * ones Charlie deleted before sending, and unsent ones still carrying the old
 * legal-threat wording, which are replaced. Drafts already in the new wording
 * are left alone, as are follow-ups. Rescans each company once. Never sends.
 */

export interface Orphan {
  row: SheetRow;
  domain: string;
  m: Member;
  draftId: string;
}

/** Only drafts from the last two weeks: older ones were cleaned up on purpose. */
export const REDRAFT_DAYS = 14;
/** Old wording that reads as a threat. A draft with any of it is replaced. */
export const OLD_WORDING = /CIPA|lawsuit|legal exposure|demand letter|regulator fines/i;
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

/** Plain follow-ups (contact 1 or a colleague), not GPC re-touches. */
const FOLLOW_UP = /^follow-up(, contact \d+)?( \(redraft\))?$/;
const FOLLOW_LIVE = new Set(["Emailed", "Followed up"]);

/** Pure: the latest follow-up draft per person in the window, on a live row. */
export function followUpOrphans(rows: SheetRow[], ledger: Entry[], now = new Date()): Orphan[] {
  const since = now.getTime() - REDRAFT_DAYS * 86_400_000;
  const latest = new Map<string, Entry>();
  for (const e of ledger) {
    if (e.action !== "drafted" || !e.messageId || !e.email) continue;
    if (!FOLLOW_UP.test(e.reason ?? "")) continue;
    latest.set(`${e.domain}|${e.email.toLowerCase()}`, e);
  }
  const byDomain = new Map(rows.map((r) => [normDomain(r.values["Domain"] ?? ""), r]));
  const out: Orphan[] = [];
  for (const e of latest.values()) {
    if (new Date(e.at).getTime() < since) continue;
    const row = byDomain.get(e.domain);
    if (!row || !FOLLOW_LIVE.has(row.values["Status"] ?? "")) continue;
    const m = members(row.values).find((x) => x.email === (e.email ?? "").toLowerCase());
    if (!m || GONE.test(m.check)) continue;
    out.push({ row, domain: e.domain, m, draftId: e.messageId! });
  }
  return out;
}

const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

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
  followUps: string[];
  redrafted: string[];
  stillThere: number;
  replaced: number;
  sent: string[];
  skipped: Record<string, string>;
}> {
  const found = orphans(o.sheet.rows, o.ledger);
  const followUps = followUpOrphans(o.sheet.rows, o.ledger);
  const out = {
    candidates: found.length + followUps.length,
    followUps: [] as string[],
    redrafted: [] as string[],
    stillThere: 0,
    replaced: 0,
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
    // Stay under Gmail's per-minute quota.
    await pause(400);
    // Sent first: Gmail can still answer for a draft id after it went out.
    if ((await search(`in:sent to:${x.m.email}`, 1)).length) {
      out.sent.push(x.m.email);
      continue;
    }
    const draft = await getDraft(x.draftId);
    // Still there in the new wording: leave it for Charlie.
    if (draft && !OLD_WORDING.test(extractText(draft))) {
      out.stillThere++;
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
    const shopifyStore = await isShopify(x.domain);
    const email = render({
      domain: x.domain,
      shopify: shopifyStore,
      firstName: x.m.firstName,
      ev,
      postalAddress: o.postalAddress,
    });
    // Swap the old draft only once the new one is ready, so nobody is left without one.
    if (draft) {
      await deleteDraft(x.draftId);
      out.replaced++;
    }
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
  // Follow-ups deleted before sending: rebuild in the thread of the first email. No rescan needed.
  for (const x of followUps) {
    if (out.followUps.length >= o.limit) break;
    await pause(400);
    const sent = await search(`in:sent to:${x.m.email}`, 10);
    if (sent.length >= 2) {
      out.sent.push(x.m.email);
      continue;
    }
    const firstId = sent[0];
    if (!firstId) {
      out.skipped[x.m.email] = "first email not in Sent";
      continue;
    }
    if (await getDraft(x.draftId)) {
      out.stillThere++;
      continue;
    }
    const first = await getMessage(firstId);
    const mid = header(first.payload, "Message-ID") || header(first.payload, "Message-Id");
    const id = await createDraft(
      o.from,
      x.m.email,
      followUpEmail({
        domain: x.domain,
        firstName: x.m.firstName,
        subject: header(first.payload, "Subject") || subjectFor(x.domain),
        postalAddress: o.postalAddress,
      }),
      mid ? { threadId: first.threadId, messageId: mid } : undefined,
    );
    record({
      domain: x.domain,
      action: "drafted",
      email: x.m.email,
      messageId: id,
      reason: `${x.m.slot === 1 ? "follow-up" : `follow-up, contact ${String(x.m.slot)}`} (redraft)`,
    });
    out.followUps.push(`${x.domain} -> ${x.m.email}`);
    log(`redraft ${x.domain}: follow-up for ${x.m.email}`);
  }
  return out;
}
