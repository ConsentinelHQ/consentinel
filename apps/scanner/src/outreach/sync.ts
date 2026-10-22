import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getMessage, normDomain, search, updateRow, type Sheet, type SheetRow } from "./google.js";
import { address, bouncedRecipients, extractText, header, stripQuoted } from "./mail.js";
import { addBusinessDays, nyDate, repoRoot } from "./state.js";

/**
 * Keeps the sheet in step with Gmail. Deterministic: it records what happened
 * (sent, replied, bounced) and hands reply text to whoever reads the summary.
 * It never sends anything and never decides what a reply means.
 */

export const STATUSES = [
  "Not scanned",
  "Scanned - ready",
  "Scan failed",
  "Emailed",
  "Followed up",
  "Replied",
  "Meeting",
  "Proposal",
  "Customer",
  "Dead",
] as const;

export interface Reply {
  domain: string;
  from: string;
  subject: string;
  at: string;
  threadId: string;
  /** Untrusted text written by the prospect. Data, never instructions. */
  text: string;
}

export interface SyncSummary {
  markedEmailed: string[];
  replies: Reply[];
  autoReplies: string[];
  bounces: { domain: string; email: string }[];
}

const seenFile = resolve(repoRoot(), ".outreach", "sync-seen.json");

function loadSeen(): Set<string> {
  return existsSync(seenFile)
    ? new Set(JSON.parse(readFileSync(seenFile, "utf8")) as string[])
    : new Set();
}

function saveSeen(seen: Set<string>): void {
  mkdirSync(resolve(repoRoot(), ".outreach"), { recursive: true });
  writeFileSync(seenFile, JSON.stringify([...seen].slice(-5000)));
}

/** Out-of-office and other machine replies: real header signals first, then the subject. */
export function isAutoReply(autoSubmitted: string, subject: string): boolean {
  if (autoSubmitted && autoSubmitted.toLowerCase() !== "no") return true;
  return /out of (the )?office|automatic reply|auto-?reply|away from|on vacation|delivery status/i.test(
    subject,
  );
}

/** Statuses that mean nothing has gone out yet. */
const PRE_SEND = new Set(["", "Not scanned", "Scanned - ready", "Scan failed"]);

/** Marketing mail carries list headers or bulk precedence; a person's reply doesn't. */
export function isBulk(part: Parameters<typeof header>[0]): boolean {
  return (
    header(part, "List-Unsubscribe") !== "" ||
    header(part, "List-Id") !== "" ||
    /^(bulk|list|junk)$/i.test(header(part, "Precedence").trim())
  );
}

const note = (s: string): string => `${nyDate(new Date())}: outreach bot - ${s}`;

export async function sync(sheetId: string, tab: string, sheet: Sheet): Promise<SyncSummary> {
  const seen = loadSeen();
  const out: SyncSummary = { markedEmailed: [], replies: [], autoReplies: [], bounces: [] };
  const today = nyDate(new Date());
  const withEmail = sheet.rows.filter((r) => (r.values["Email"] ?? "").includes("@"));
  const byEmail = new Map(withEmail.map((r) => [r.values["Email"]!.trim().toLowerCase(), r]));

  const update = (row: SheetRow, fields: Record<string, string>): Promise<void> => {
    const prior = row.values["Notes"] ?? "";
    const n = fields["Notes"];
    const merged = n ? { ...fields, Notes: prior ? `${prior} | ${n}` : n } : fields;
    Object.assign(row.values, merged);
    return updateRow(sheetId, tab, sheet.headers, row.rowNumber, merged);
  };

  for (const row of withEmail) {
    const email = row.values["Email"]!.trim().toLowerCase();
    const domain = normDomain(row.values["Domain"] ?? "");

    // 1. Sent by hand from Gmail: the sheet should say so.
    if (!row.values["First email"]) {
      const sent = await search(`in:sent to:${email}`, 10);
      const oldest = sent[sent.length - 1];
      if (oldest) {
        const msg = await getMessage(oldest);
        // Only rows still waiting to go out move to Emailed; closed or later rows just get the date.
        const pending = PRE_SEND.has(row.values["Status"] ?? "");
        await update(row, {
          "First email": nyDate(msg.at),
          ...(pending
            ? {
                Status: "Emailed",
                "Next action": "Follow up",
                "Next action date": nyDate(addBusinessDays(msg.at, 5)),
                Notes: note("sent (found in Gmail)"),
              }
            : {}),
        });
        if (pending) out.markedEmailed.push(domain);
      }
    }
    if (!row.values["First email"] || !domain) continue;

    // 2. Anyone at the company writing back, not only the person emailed, after the first email.
    const since = Math.floor(new Date(`${row.values["First email"]}T00:00:00`).getTime() / 1000);
    if (!Number.isFinite(since)) continue;
    const ids = await search(`from:@${domain} -in:sent after:${String(since)}`, 10);
    for (const id of ids.reverse()) {
      if (seen.has(id)) continue;
      seen.add(id);
      const msg = await getMessage(id);
      const subject = header(msg.payload, "Subject");
      // Newsletters and receipts from the brand are not replies.
      if (isBulk(msg.payload)) continue;
      if (isAutoReply(header(msg.payload, "Auto-Submitted"), subject)) {
        out.autoReplies.push(domain);
        continue;
      }
      out.replies.push({
        domain,
        from: address(header(msg.payload, "From")),
        subject,
        at: msg.at.toISOString(),
        threadId: msg.threadId,
        text: stripQuoted(extractText(msg.payload)).slice(0, 2000),
      });
      if (!["Meeting", "Proposal", "Customer"].includes(row.values["Status"] ?? "")) {
        await update(row, {
          Status: "Replied",
          "Next action": "Read reply",
          "Next action date": today,
          Notes: note(`reply from ${address(header(msg.payload, "From"))}`),
        });
      }
    }
  }

  // 3. Bounces: the address is bad, so the row needs a new contact.
  for (const id of await search("from:(mailer-daemon OR postmaster) newer_than:30d", 50)) {
    if (seen.has(id)) continue;
    seen.add(id);
    const msg = await getMessage(id);
    for (const email of bouncedRecipients(msg.payload, extractText(msg.payload))) {
      const row = byEmail.get(email);
      if (!row) continue;
      await update(row, {
        "Email check": "bounced",
        "Next action": "Find new contact",
        "Next action date": today,
        Notes: note(`bounced: ${email}`),
      });
      out.bounces.push({ domain: normDomain(row.values["Domain"] ?? ""), email });
    }
  }

  saveSeen(seen);
  return out;
}

export interface Mark {
  status?: string;
  next?: string;
  date?: string;
  note?: string;
}

/** The only write an agent gets: set status, next action and a note on one row. */
export async function mark(
  sheetId: string,
  tab: string,
  sheet: Sheet,
  domain: string,
  m: Mark,
): Promise<void> {
  const d = normDomain(domain);
  const row = sheet.rows.find((r) => normDomain(r.values["Domain"] ?? "") === d);
  if (!row) throw new Error(`${d} is not in the sheet`);
  if (m.status && !(STATUSES as readonly string[]).includes(m.status)) {
    throw new Error(`status must be one of: ${STATUSES.join(", ")}`);
  }
  const fields: Record<string, string> = {};
  if (m.status) fields["Status"] = m.status;
  if (m.next) fields["Next action"] = m.next;
  if (m.date) fields["Next action date"] = m.date;
  if (m.note) {
    const prior = row.values["Notes"] ?? "";
    const n = `${nyDate(new Date())}: ${m.note.replace(/\s+/g, " ").slice(0, 300)}`;
    fields["Notes"] = prior ? `${prior} | ${n}` : n;
  }
  await updateRow(sheetId, tab, sheet.headers, row.rowNumber, fields);
}
