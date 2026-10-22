import {
  createDraft,
  getMessage,
  normDomain,
  search,
  updateRow,
  type Sheet,
  type SheetRow,
} from "./google.js";
import { header } from "./mail.js";
import { addBusinessDays, dayToDate, nyDate, parseDay, record } from "./state.js";
import type { Email } from "./template.js";

/**
 * One follow-up per prospect, threaded under the first email, 5 business days
 * after it. Rows still silent 10 business days after the follow-up close as Dead.
 * Drafts only: Charlie sends.
 */

const SITE = "https://www.getconsentinel.com/";
export const FOLLOW_UP_AFTER = 5;
export const CLOSE_AFTER = 10;

/** Notes that mean a person decided this row needs a human. */
const HANDS_OFF = /do not|don't|hold|avoid|skip|wait|unsubscribe/i;

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function followUpEmail(input: {
  domain: string;
  firstName: string;
  subject: string;
  postalAddress: string;
}): Email {
  const greeting = `Hi ${input.firstName.trim() || "there"},`;
  const body = `Following up on my email about ${input.domain} in case it got buried. I can send over the full report - it lists every tag that fires after a visitor opts out and what to change for each one.`;
  const close = "Happy to connect if interested.";
  const sig = ["Thank you,", "Charlie Buckley", "Founder, Consentinel", "getconsentinel.com"];
  const optOut = "If you'd rather not hear from me, just reply and I won't email again.";
  const address = input.postalAddress.trim();
  const text = [
    greeting,
    "",
    body,
    "",
    close,
    "",
    ...sig,
    "",
    optOut,
    ...(address ? [address] : []),
  ].join("\n");
  const html = [
    `<p>${esc(greeting)}</p>`,
    `<p>${esc(body)}</p>`,
    `<p>${esc(close)}</p>`,
    `<p>${sig.map(esc).join("<br>").replace("getconsentinel.com", `<a href="${SITE}">getconsentinel.com</a>`)}</p>`,
    `<p style="color:#888;font-size:12px">${esc(optOut)}${address ? `<br>${esc(address)}` : ""}</p>`,
  ].join("\n");
  const subject = /^re:/i.test(input.subject) ? input.subject : `Re: ${input.subject}`;
  return { subject, text, html };
}

/** Emailed, never followed up, first email 5+ business days ago, not hand-flagged. */
export function dueForFollowUp(rows: SheetRow[], today: string): SheetRow[] {
  return rows.filter(({ values: v }) => {
    if (v["Status"] !== "Emailed" || v["Follow-up"]?.trim()) return false;
    if (!(v["Email"] ?? "").includes("@") || /bounced/i.test(v["Email check"] ?? "")) return false;
    if (HANDS_OFF.test(v["Notes"] ?? "")) return false;
    if (/review follow-up draft/i.test(v["Next action"] ?? "")) return false;
    const first = parseDay(v["First email"]);
    if (!first) return false;
    return nyDate(addBusinessDays(dayToDate(first), FOLLOW_UP_AFTER)) <= today;
  });
}

/** Followed up, and nothing back 10 business days later. */
export function dueToClose(rows: SheetRow[], today: string): SheetRow[] {
  return rows.filter(({ values: v }) => {
    if (v["Status"] !== "Followed up") return false;
    const followed = parseDay(v["Follow-up"]);
    if (!followed) return false;
    return nyDate(addBusinessDays(dayToDate(followed), CLOSE_AFTER)) <= today;
  });
}

export interface FollowUpSummary {
  drafted: string[];
  closed: string[];
  skipped: Record<string, string>;
}

export async function followups(
  sheetId: string,
  tab: string,
  sheet: Sheet,
  opts: { from: string; postalAddress: string; limit: number },
): Promise<FollowUpSummary> {
  const today = nyDate(new Date());
  const out: FollowUpSummary = { drafted: [], closed: [], skipped: {} };
  const note = (s: string): string => `${today}: outreach bot - ${s}`;
  const update = (row: SheetRow, fields: Record<string, string>): Promise<void> => {
    const prior = row.values["Notes"] ?? "";
    const n = fields["Notes"];
    const merged = n ? { ...fields, Notes: prior ? `${prior} | ${n}` : n } : fields;
    Object.assign(row.values, merged);
    return updateRow(sheetId, tab, sheet.headers, row.rowNumber, merged);
  };

  for (const row of dueToClose(sheet.rows, today)) {
    await update(row, {
      Status: "Dead",
      "Next action": "",
      "Next action date": "",
      Notes: note("closed, no reply after follow-up"),
    });
    out.closed.push(normDomain(row.values["Domain"] ?? ""));
  }

  for (const row of dueForFollowUp(sheet.rows, today).slice(0, opts.limit)) {
    const domain = normDomain(row.values["Domain"] ?? "");
    const email = row.values["Email"]!.trim().toLowerCase();
    const sent = await search(`in:sent to:${email}`, 10);
    const firstId = sent[sent.length - 1];
    if (!firstId) {
      out.skipped[domain] = "first email not found in Gmail";
      continue;
    }
    // Already followed up by hand: record it instead of drafting a second one.
    if (sent.length >= 2) {
      const latest = await getMessage(sent[0]!);
      await update(row, {
        Status: "Followed up",
        "Follow-up": nyDate(latest.at),
        "Next action": "Close if no reply",
        "Next action date": nyDate(addBusinessDays(latest.at, CLOSE_AFTER)),
        Notes: note("follow-up found in Gmail"),
      });
      out.skipped[domain] = "already followed up";
      continue;
    }
    const first = await getMessage(firstId);
    const draft = followUpEmail({
      domain,
      firstName: (row.values["Contact"] ?? "").trim().split(/\s+/)[0] ?? "",
      subject: header(first.payload, "Subject") || `Privacy issues on ${domain}`,
      postalAddress: opts.postalAddress,
    });
    const messageId = header(first.payload, "Message-ID") || header(first.payload, "Message-Id");
    const id = await createDraft(
      opts.from,
      email,
      draft,
      messageId ? { threadId: first.threadId, messageId } : undefined,
    );
    record({ domain, action: "drafted", email, messageId: id, reason: "follow-up" });
    await update(row, {
      "Next action": "Review follow-up draft",
      "Next action date": today,
      Notes: note("follow-up drafted"),
    });
    out.drafted.push(domain);
  }
  return out;
}
