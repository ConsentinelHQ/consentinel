import { GONE } from "./referral.js";
import {
  createDraft,
  getMessage,
  normDomain,
  search,
  updateRow,
  type Sheet,
  type SheetRow,
  type Thread,
} from "./google.js";
import { header } from "./mail.js";
import { addBusinessDays, dayToDate, nyDate, parseDay, record } from "./state.js";
import { subjectFor, type Email } from "./template.js";
import { members } from "./team.js";

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

/** The retired first-email subject. Charlie won't send anything that carries it (Nov 9, 2026). */
export const OLD_SUBJECT = /privacy issues on /i;

/**
 * How a later email goes out: in the first email's thread, or as a fresh email
 * with the current subject when that thread carries the retired one.
 */
export function threadPlan(
  domain: string,
  first: { subject: string; threadId: string; messageId: string },
): { subject: string; fresh: boolean; thread?: Thread } {
  if (!first.subject || OLD_SUBJECT.test(first.subject)) {
    return { subject: subjectFor(domain), fresh: true };
  }
  return {
    subject: first.subject,
    fresh: false,
    ...(first.messageId
      ? { thread: { threadId: first.threadId, messageId: first.messageId } }
      : {}),
  };
}

export function followUpEmail(input: {
  domain: string;
  firstName: string;
  subject: string;
  postalAddress: string;
  /** A new thread: keep the subject as is, no "Re:". */
  fresh?: boolean;
}): Email {
  const greeting = `Hi ${input.firstName.trim() || "there"},`;
  // Nov 8, 2026: matches the first email's voice. One new thing (the GTM fix), one easy ask.
  const body = `Quick follow-up on ${input.domain} in case my last email got buried. I can send over the full report if it helps - it shows each tag that fires after a visitor opts out, and for tags in Google Tag Manager, the exact setting to change.`;
  const self = "Or you can run a free scan yourself anytime at getconsentinel.com.";
  const sig = ["Cheers,", "Charlie", "Founder, Consentinel"];
  const optOut = "If you'd rather not hear from me, just reply and I won't email again.";
  const address = input.postalAddress.trim();
  const text = [
    greeting,
    "",
    body,
    "",
    self,
    "",
    ...sig,
    "",
    optOut,
    ...(address ? [address] : []),
  ].join("\n");
  const html = [
    `<p>${esc(greeting)}</p>`,
    `<p>${esc(body)}</p>`,
    `<p>${esc(self).replace("getconsentinel.com", `<a href="${SITE}">getconsentinel.com</a>`)}</p>`,
    `<p>${sig.map(esc).join("<br>")}</p>`,
    `<p style="color:#888;font-size:12px">${esc(optOut)}${address ? `<br>${esc(address)}` : ""}</p>`,
  ].join("\n");
  const subject =
    input.fresh || /^re:/i.test(input.subject) ? input.subject : `Re: ${input.subject}`;
  return { subject, text, html };
}

/** Emailed, never followed up, first email 5+ business days ago, not hand-flagged. */
export function dueForFollowUp(rows: SheetRow[], today: string): SheetRow[] {
  return rows.filter(({ values: v }) => {
    if (v["Status"] !== "Emailed" || v["Follow-up"]?.trim()) return false;
    if (!(v["Email"] ?? "").includes("@") || GONE.test(v["Email check"] ?? "")) return false;
    if (HANDS_OFF.test(v["Notes"] ?? "")) return false;
    if (/review follow-up draft/i.test(v["Next action"] ?? "")) return false;
    const first = parseDay(v["First email"]);
    if (!first) return false;
    return nyDate(addBusinessDays(dayToDate(first), FOLLOW_UP_AFTER)) <= today;
  });
}

/**
 * Followed up, and nothing back 10 business days later. Also any open row whose
 * hand-written next action says to mark it Dead once its date has passed.
 */
export function dueToClose(rows: SheetRow[], today: string): SheetRow[] {
  return rows.filter(({ values: v }) => {
    if (
      ["Emailed", "Followed up"].includes(v["Status"] ?? "") &&
      /mark dead/i.test(v["Next action"] ?? "")
    ) {
      const when = parseDay(v["Next action date"]);
      if (when && when <= today) return true;
    }
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
    const plan = threadPlan(domain, {
      subject: header(first.payload, "Subject"),
      threadId: first.threadId,
      messageId: header(first.payload, "Message-ID") || header(first.payload, "Message-Id"),
    });
    const draft = followUpEmail({
      domain,
      firstName: (row.values["Contact"] ?? "").trim().split(/\s+/)[0] ?? "",
      subject: plan.subject,
      postalAddress: opts.postalAddress,
      fresh: plan.fresh,
    });
    const id = await createDraft(opts.from, email, draft, plan.thread);
    record({ domain, action: "drafted", email, messageId: id, reason: "follow-up" });
    // Colleagues get theirs in their own thread, only if Charlie sent them the first email.
    let extra = 0;
    for (const m of members(row.values).filter((m) => m.slot !== 1)) {
      if (GONE.test(m.check)) continue;
      const theirs = await search(`in:sent to:${m.email}`, 10);
      if (theirs.length !== 1) continue;
      const msg = await getMessage(theirs[0]!);
      // A colleague emailed later than contact 1 waits their own 5 business days, so skip for now.
      if (nyDate(addBusinessDays(msg.at, FOLLOW_UP_AFTER)) > today) continue;
      const p = threadPlan(domain, {
        subject: header(msg.payload, "Subject"),
        threadId: msg.threadId,
        messageId: header(msg.payload, "Message-ID") || header(msg.payload, "Message-Id"),
      });
      const fid = await createDraft(
        opts.from,
        m.email,
        followUpEmail({
          domain,
          firstName: m.firstName,
          subject: p.subject,
          postalAddress: opts.postalAddress,
          fresh: p.fresh,
        }),
        p.thread,
      );
      record({
        domain,
        action: "drafted",
        email: m.email,
        messageId: fid,
        reason: `follow-up, contact ${String(m.slot)}`,
      });
      extra++;
    }
    await update(row, {
      "Next action": extra ? "Review follow-up drafts" : "Review follow-up draft",
      "Next action date": today,
      Notes: note(
        extra ? `follow-ups drafted for ${String(extra + 1)} contacts` : "follow-up drafted",
      ),
    });
    out.drafted.push(domain);
  }
  return out;
}
