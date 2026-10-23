import type { ScanResult } from "@consentinel/shared";
import { scan } from "../index.js";
import { gpcIgnoredInAll } from "./evidence.js";
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
import { stillFire, type Email } from "./template.js";

/**
 * One-time GPC re-touch for prospects who never replied. Each gets at most one
 * extra email, threaded under the first, and only when two scans agree that two
 * or more ad vendors ignore Global Privacy Control. Drafts only: Charlie sends.
 */

const SITE = "https://www.getconsentinel.com/";
/** Same bar as the cold-email GPC bullet. */
export const MIN_VENDORS = 2;
/** Leave a just-sent follow-up alone this long before adding another email. */
export const AFTER_FOLLOW_UP = 5;

/** Sites scanned per draft allowed, at most. */
const SITES_PER_DRAFT = 3;

/** Written to Notes; the only record that a row was re-touched. */
export const DRAFTED = "gpc re-touch drafted";
export const SENT = "gpc re-touch sent";
/** Ledger reason. Starts with "follow-up" so the brief counts it as one. */
export const REASON = "follow-up: gpc re-touch";

/** A person decided, or the prospect said, to leave this row alone. */
const LEAVE_ALONE =
  /do not|don't|hold|avoid|skip|wait|unsubscribe|not interested|reply from|remove|stop/i;

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function retouchEmail(input: {
  domain: string;
  firstName: string;
  subject: string;
  gpcIgnored: string[];
  postalAddress: string;
}): Email {
  const greeting = `Hi ${input.firstName.trim() || "there"},`;
  const finding = `One more finding on ${input.domain} since my last note. With Global Privacy Control turned on (the browser opt-out setting California requires sites to honor), ${stillFire(input.gpcIgnored)}.`;
  const deadline =
    "Starting January 1, every browser has to offer that setting, so a lot more of your visitors will be sending it.";
  const offer =
    "I can send over the full report if it's useful - it lists each tag and what to change.";
  const sig = ["Thank you,", "Charlie Buckley", "Founder, Consentinel", "getconsentinel.com"];
  const optOut = "If you'd rather not hear from me, just reply and I won't email again.";
  const address = input.postalAddress.trim();
  const text = [
    greeting,
    "",
    finding,
    "",
    deadline,
    "",
    offer,
    "",
    ...sig,
    "",
    optOut,
    ...(address ? [address] : []),
  ].join("\n");
  const html = [
    `<p>${esc(greeting)}</p>`,
    `<p>${esc(finding)}</p>`,
    `<p>${esc(deadline)}</p>`,
    `<p>${esc(offer)}</p>`,
    `<p>${sig.map(esc).join("<br>").replace("getconsentinel.com", `<a href="${SITE}">getconsentinel.com</a>`)}</p>`,
    `<p style="color:#888;font-size:12px">${esc(optOut)}${address ? `<br>${esc(address)}` : ""}</p>`,
  ].join("\n");
  const subject = /^re:/i.test(input.subject) ? input.subject : `Re: ${input.subject}`;
  return { subject, text, html };
}

/**
 * Followed up or closed for silence, never re-touched, never replied, not
 * hand-flagged, with a working address. A follow-up has to be 5+ business days old.
 */
export function dueForRetouch(rows: SheetRow[], today: string): SheetRow[] {
  return rows.filter(({ values: v }) => {
    const status = v["Status"] ?? "";
    if (status !== "Followed up" && status !== "Dead") return false;
    if (!(v["Email"] ?? "").includes("@") || /bounced/i.test(v["Email check"] ?? "")) return false;
    const notes = v["Notes"] ?? "";
    if (notes.includes(DRAFTED) || notes.includes(SENT)) return false;
    if (LEAVE_ALONE.test(notes)) return false;
    // Dead only counts when the bot closed it for silence, not for any other reason.
    if (status === "Dead" && !/closed, no reply after follow-up/i.test(notes)) return false;
    if (status === "Followed up") {
      const followed = parseDay(v["Follow-up"]);
      if (!followed) return false;
      if (nyDate(addBusinessDays(dayToDate(followed), AFTER_FOLLOW_UP)) > today) return false;
    }
    return Boolean(parseDay(v["First email"]));
  });
}

export interface RetouchSummary {
  drafted: string[];
  /** Domain -> why it was passed over. */
  skipped: Record<string, string>;
}

type Scanner = (url: string) => Promise<ScanResult>;

export async function retouch(
  sheetId: string,
  tab: string,
  sheet: Sheet,
  opts: { from: string; postalAddress: string; limit: number; scanner?: Scanner },
): Promise<RetouchSummary> {
  const scanner = opts.scanner ?? ((url: string) => scan(url));
  const today = nyDate(new Date());
  const out: RetouchSummary = { drafted: [], skipped: {} };
  const note = (s: string): string => `${today}: outreach bot - ${s}`;
  const update = (row: SheetRow, fields: Record<string, string>): Promise<void> => {
    const prior = row.values["Notes"] ?? "";
    const n = fields["Notes"];
    const merged = n ? { ...fields, Notes: prior ? `${prior} | ${n}` : n } : fields;
    Object.assign(row.values, merged);
    return updateRow(sheetId, tab, sheet.headers, row.rowNumber, merged);
  };

  // Two scans a site: cap total work so a night of non-qualifying sites stays short.
  const maxSites = opts.limit * SITES_PER_DRAFT;
  let tried = 0;
  for (const row of dueForRetouch(sheet.rows, today)) {
    if (out.drafted.length >= opts.limit || tried >= maxSites) break;
    tried += 1;
    const domain = normDomain(row.values["Domain"] ?? "");
    const email = row.values["Email"]!.trim().toLowerCase();

    let gpcIgnored: string[];
    try {
      const url = `https://${domain}`;
      gpcIgnored = gpcIgnoredInAll([await scanner(url), await scanner(url)]);
    } catch (error) {
      out.skipped[domain] =
        `scan failed: ${error instanceof Error ? error.message : String(error)}`;
      continue;
    }
    if (gpcIgnored.length < MIN_VENDORS) {
      // Recorded so a rerun doesn't spend two scans on it again.
      await update(row, {
        Notes: note(`gpc re-touch skipped, ${String(gpcIgnored.length)} vendors`),
      });
      out.skipped[domain] = `${String(gpcIgnored.length)} vendors ignore GPC`;
      continue;
    }

    const sent = await search(`in:sent to:${email}`, 10);
    const firstId = sent[sent.length - 1];
    if (!firstId) {
      out.skipped[domain] = "first email not found in Gmail";
      continue;
    }
    // Anything beyond first email and follow-up means someone already went further by hand.
    if (sent.length >= 3) {
      out.skipped[domain] = "already has 3+ sent emails";
      continue;
    }
    const first = await getMessage(firstId);
    const draft = retouchEmail({
      domain,
      firstName: (row.values["Contact"] ?? "").trim().split(/\s+/)[0] ?? "",
      subject: header(first.payload, "Subject") || `Privacy issues on ${domain}`,
      gpcIgnored,
      postalAddress: opts.postalAddress,
    });
    const messageId = header(first.payload, "Message-ID") || header(first.payload, "Message-Id");
    const id = await createDraft(
      opts.from,
      email,
      draft,
      messageId ? { threadId: first.threadId, messageId } : undefined,
    );
    record({ domain, action: "drafted", email, messageId: id, reason: REASON });
    await update(row, {
      "Next action": "Review re-touch draft",
      "Next action date": today,
      Notes: note(`${DRAFTED} (${String(gpcIgnored.length)} vendors ignore GPC)`),
    });
    out.drafted.push(domain);
  }
  return out;
}
