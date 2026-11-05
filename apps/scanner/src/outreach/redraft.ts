import { sheetContact } from "./backlog.js";
import { gather, MIN_VENDORS, tier } from "./evidence.js";
import {
  createDraft,
  draftExists,
  search,
  updateRow,
  type Sheet,
  type SheetRow,
} from "./google.js";
import { nyDate, record, type Entry } from "./state.js";
import { render } from "./template.js";

/**
 * Rows whose first-email draft Charlie deleted before sending. The ledger
 * still says "drafted", so the nightly run skips them. This rescans each one
 * and writes a fresh draft in the current template. Never sends.
 */

export interface Orphan {
  row: SheetRow;
  domain: string;
  email: string;
  draftId: string;
}

/** Pure: rows waiting on a draft review, with the ledger's last draft id for contact 1. */
export function orphans(rows: SheetRow[], ledger: Entry[]): Orphan[] {
  const out: Orphan[] = [];
  for (const row of rows) {
    const v = row.values;
    if (v["Status"] !== "Scanned - ready") continue;
    if (!/review gmail draft/i.test(v["Next action"] ?? "")) continue;
    if ((v["First email"] ?? "").trim()) continue;
    const email = (v["Email"] ?? "").trim().toLowerCase();
    if (!email) continue;
    const domain = (v["Domain"] ?? "").trim().toLowerCase();
    const last = [...ledger]
      .reverse()
      .find(
        (e) => e.action === "drafted" && e.messageId && (e.email ?? "").toLowerCase() === email,
      );
    if (!last?.messageId) continue;
    out.push({ row, domain, email, draftId: last.messageId });
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
  redrafted: string[];
  stillThere: number;
  sent: string[];
  skipped: Record<string, string>;
}> {
  const out = {
    redrafted: [] as string[],
    stillThere: 0,
    sent: [] as string[],
    skipped: {} as Record<string, string>,
  };
  const today = nyDate(new Date());
  const note = (row: SheetRow, s: string): Promise<void> => {
    const prior = row.values["Notes"] ?? "";
    const line = `${today}: outreach bot - ${s}`;
    return updateRow(o.sheetId, o.tab, o.sheet.headers, row.rowNumber, {
      Notes: prior ? `${prior} | ${line}` : line,
    });
  };
  let done = 0;
  for (const x of orphans(o.sheet.rows, o.ledger)) {
    if (done >= o.limit) break;
    if (await draftExists(x.draftId)) {
      out.stillThere++;
      continue;
    }
    // Gone because it went out: sync records the send, nothing to redo.
    if ((await search(`in:sent to:${x.email}`, 1)).length) {
      out.sent.push(x.domain);
      continue;
    }
    const contact = sheetContact(x.row.values);
    if (!contact) {
      out.skipped[x.domain] = "no verified contact on the row";
      continue;
    }
    done++;
    log(`redraft ${x.domain}`);
    const ev = await gather(`https://${x.domain}`);
    if (typeof ev === "string") {
      out.skipped[x.domain] = ev.slice(0, 200);
      await note(x.row, `redraft skipped: ${ev.slice(0, 120)}`);
      continue;
    }
    if (ev.firing.length < MIN_VENDORS || tier(ev, o.minGpc) === 3) {
      const why = `rescan found weak evidence (${String(ev.firing.length)} vendors)`;
      out.skipped[x.domain] = why;
      await updateRow(o.sheetId, o.tab, o.sheet.headers, x.row.rowNumber, { Status: "Dead" });
      await note(x.row, why);
      continue;
    }
    const email = render({
      domain: x.domain,
      firstName: contact.firstName,
      ev,
      postalAddress: o.postalAddress,
    });
    const id = await createDraft(o.from, contact.email, email);
    record({
      domain: x.domain,
      action: "drafted",
      email: contact.email,
      messageId: id,
      reason: "redraft",
    });
    await note(x.row, "redrafted in the new template");
    out.redrafted.push(`${x.domain} -> ${contact.email}`);
  }
  return out;
}
