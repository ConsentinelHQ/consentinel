import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ensureHeaders,
  getMessage,
  normDomain,
  search,
  updateRow,
  type Sheet,
  type SheetRow,
} from "./google.js";
import { address, bouncedRecipients, extractText, header, stripQuoted } from "./mail.js";
import { DRAFTED as RETOUCH_DRAFTED, SENT as RETOUCH_SENT } from "./retouch.js";
import { addBusinessDays, nyDate, parseDay, readLedger, repoRoot } from "./state.js";
import {
  GONE,
  LEFT,
  REFERRED,
  domainFromSubject,
  nameFromEmail,
  referralEmails,
  saysLeft,
} from "./referral.js";
import { EXTRA_HEADERS, SLOTS, col, members, stopDrafts, type Slot } from "./team.js";

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
  followedUp: string[];
  replies: Reply[];
  autoReplies: string[];
  bounces: { domain: string; email: string }[];
  /** Unsent bot drafts removed because someone at that company replied. */
  stopped: { domain: string; emails: string[] }[];
  /** A contact's auto-reply said they left. `to`: who it pointed to, queued for a 2am draft. */
  referrals: { domain: string; left: string; to: string | null; queued: boolean }[];
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
  const out: SyncSummary = {
    markedEmailed: [],
    followedUp: [],
    replies: [],
    autoReplies: [],
    bounces: [],
    stopped: [],
    referrals: [],
  };
  const ledger = readLedger();
  const today = nyDate(new Date());
  const withEmail = sheet.rows.filter((r) => (r.values["Email"] ?? "").includes("@"));
  const byEmail = new Map<string, { row: SheetRow; slot: Slot }>();
  for (const row of withEmail)
    for (const m of members(row.values)) byEmail.set(m.email, { row, slot: m.slot });

  const update = (row: SheetRow, fields: Record<string, string>): Promise<void> => {
    const prior = row.values["Notes"] ?? "";
    const n = fields["Notes"];
    const merged = n ? { ...fields, Notes: prior ? `${prior} | ${n}` : n } : fields;
    Object.assign(row.values, merged);
    return updateRow(sheetId, tab, sheet.headers, row.rowNumber, merged);
  };

  type Msg = Awaited<ReturnType<typeof getMessage>>;

  /** One message from someone at the company: a reply, an auto-reply, or nothing. */
  const onMessage = async (row: SheetRow, domain: string, msg: Msg): Promise<void> => {
    const subject = header(msg.payload, "Subject");
    // Newsletters and receipts from the brand are not replies.
    if (isBulk(msg.payload)) return;
    if (isAutoReply(header(msg.payload, "Auto-Submitted"), subject)) {
      const text = stripQuoted(extractText(msg.payload));
      if (saysLeft(text)) await onLeft(row, domain, msg.payload, text);
      else out.autoReplies.push(domain);
      return;
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
    // One answer speaks for the company: nobody else there gets a cold email or follow-up.
    const emails = await stopDrafts(ledger, domain, msg.at);
    if (emails.length) {
      out.stopped.push({ domain, emails });
      await update(row, { Notes: note(`deleted unsent drafts to ${emails.join(", ")}`) });
    }
  };

  /** A contact left. Mark them gone and queue whoever the auto-reply named. */
  const onLeft = async (
    row: SheetRow,
    domain: string,
    payload: Msg["payload"],
    text: string,
  ): Promise<void> => {
    const from = address(header(payload, "From"));
    const team = members(row.values);
    const leaver = team.find((m) => m.email === from);
    if (!leaver || GONE.test(leaver.check)) return;
    const known = new Set(team.map((m) => m.email));
    const to = referralEmails(text, from, domain).find((e) => !known.has(e)) ?? null;
    const free = SLOTS.find((n) => !(row.values[col("Email", n)] ?? "").includes("@"));
    const queued = Boolean(to && free);
    if (queued) await ensureHeaders(sheetId, tab, sheet, EXTRA_HEADERS);
    // Contact 1 gone with nobody named: same path as a bounce, so 2am finds a new person.
    const recover = leaver.slot === 1 && !queued;
    await update(row, {
      [col("Email check", leaver.slot)]: recover ? `bounced (${LEFT})` : LEFT,
      ...(queued && free
        ? {
            [col("Contact", free)]: nameFromEmail(to!),
            [col("Title", free)]: "",
            [col("Email", free)]: to!,
            [col("Email check", free)]: REFERRED,
          }
        : {}),
      ...(recover ? { "Next action": "Find new contact", "Next action date": today } : {}),
      Notes: note(
        recover
          ? `bounced: ${from} (left company)`
          : `${from} left company${to ? `, referred to ${to}${queued ? "" : " (no free slot)"}` : ""}`,
      ),
    });
    out.referrals.push({ domain, left: from, to, queued });
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

    // 1b. A follow-up Charlie sent from a bot draft (or by hand): the second sent message.
    if (row.values["Status"] === "Emailed" && !row.values["Follow-up"]) {
      const sent = await search(`in:sent to:${email}`, 10);
      if (sent.length >= 2) {
        const latest = await getMessage(sent[0]!);
        await update(row, {
          Status: "Followed up",
          "Follow-up": nyDate(latest.at),
          "Next action": "Close if no reply",
          "Next action date": nyDate(addBusinessDays(latest.at, 10)),
          Notes: note("follow-up sent"),
        });
        out.followedUp.push(domain);
      }
    }

    // 1c. A GPC re-touch Charlie sent: the third sent message. Reopens a closed row
    // so it closes again on the usual timer if nobody answers.
    const notes = row.values["Notes"] ?? "";
    if (notes.includes(RETOUCH_DRAFTED) && !notes.includes(RETOUCH_SENT)) {
      const sent = await search(`in:sent to:${email}`, 10);
      if (sent.length >= 3) {
        const latest = await getMessage(sent[0]!);
        const open = ["Followed up", "Dead"].includes(row.values["Status"] ?? "");
        await update(row, {
          ...(open
            ? {
                Status: "Followed up",
                "Follow-up": nyDate(latest.at),
                "Next action": "Close if no reply",
                "Next action date": nyDate(addBusinessDays(latest.at, 10)),
              }
            : {}),
          Notes: note(RETOUCH_SENT),
        });
        out.followedUp.push(domain);
      }
    }

    // 2. Anyone at the company writing back, not only the person emailed, after the first email.
    const firstDay = parseDay(row.values["First email"]);
    if (!firstDay) continue;
    const since = Math.floor(new Date(`${firstDay}T00:00:00`).getTime() / 1000);
    const ids = await search(`from:@${domain} -in:sent after:${String(since)}`, 10);
    for (const id of ids.reverse()) {
      if (seen.has(id)) continue;
      seen.add(id);
      await onMessage(row, domain, await getMessage(id));
    }
  }

  // 2b. Mail about one of our emails from another domain: a parent company, an agency.
  // Matched by our subject line, since the sender's domain isn't on the sheet.
  const byDomain = new Map(withEmail.map((r) => [normDomain(r.values["Domain"] ?? ""), r]));
  // Own seen key, so left-company auto-replies step 2 already filed as out-of-office get read once.
  for (const id of await search(
    'subject:"Privacy issues on" -in:sent -from:me newer_than:60d',
    50,
  )) {
    if (seen.has(`b:${id}`)) continue;
    seen.add(`b:${id}`);
    const msg = await getMessage(id);
    const domain = domainFromSubject(header(msg.payload, "Subject"));
    const row = domain ? byDomain.get(domain) : undefined;
    if (!domain || !row?.values["First email"]) continue;
    if (address(header(msg.payload, "From")).endsWith(`@${domain}`)) {
      const text = stripQuoted(extractText(msg.payload));
      const auto = isAutoReply(
        header(msg.payload, "Auto-Submitted"),
        header(msg.payload, "Subject"),
      );
      if (auto && saysLeft(text)) await onLeft(row, domain, msg.payload, text);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    await onMessage(row, domain, msg);
  }

  // 3. Bounces: the address is bad, so the row needs a new contact.
  for (const id of await search("from:(mailer-daemon OR postmaster) newer_than:30d", 50)) {
    if (seen.has(id)) continue;
    seen.add(id);
    const msg = await getMessage(id);
    for (const email of bouncedRecipients(msg.payload, extractText(msg.payload))) {
      const hit = byEmail.get(email);
      if (!hit) continue;
      const { row, slot } = hit;
      // A colleague bouncing just drops them; contact 1 bouncing needs a replacement.
      await update(row, {
        [col("Email check", slot)]: "bounced",
        ...(slot === 1 ? { "Next action": "Find new contact", "Next action date": today } : {}),
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
