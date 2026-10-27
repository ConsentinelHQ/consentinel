/**
 * "She's no longer with us, contact X" auto-replies. Pure parsing, so the
 * rules are testable without Gmail.
 */

/** Check value for a contact who left. Followups and also-sent lines skip it. */
export const LEFT = "left company";
/** Check value for a person named in a left-company auto-reply. */
export const REFERRED = "valid (referred)";
/** A contact we must not email again: bounced or gone. */
export const GONE = /bounced|left company/i;

const LEFT_TEXT =
  /no longer (with|at|employed|working|part of)|(has|have) left (the company|the organization|[A-Z])|is no longer (a|an|the|with)|(last|final) day (at|with|was)|moved on from/i;

/** The auto-reply says the person left. */
export function saysLeft(text: string): boolean {
  return LEFT_TEXT.test(text);
}

/** The prospect domain from our subject line, "Privacy issues on brand.com". */
export function domainFromSubject(subject: string): string | null {
  const m = /privacy issues on ([a-z0-9][a-z0-9.-]*\.[a-z]{2,})/i.exec(subject);
  return m ? m[1]!.toLowerCase().replace(/^www\./, "") : null;
}

const NOT_A_PERSON =
  /^(no-?reply|do-?not-?reply|info|support|help|hello|contact|sales|admin|hr|careers|jobs|privacy|legal|marketing|team|office|mailer-daemon|postmaster)@/i;

/**
 * People the auto-reply points to: addresses on the sender's or the prospect's
 * domain, minus the person who left and shared inboxes. First mention first.
 */
export function referralEmails(text: string, sender: string, prospect: string): string[] {
  const senderDomain = sender.split("@")[1] ?? "";
  const ok = new Set([senderDomain, prospect].filter(Boolean));
  const out: string[] = [];
  for (const m of text.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) {
    const e = m[0].toLowerCase().replace(/\.$/, "");
    const d = e.split("@")[1]!;
    if (e === sender || NOT_A_PERSON.test(e) || out.includes(e)) continue;
    if (![...ok].some((o) => d === o || d.endsWith(`.${o}`))) continue;
    out.push(e);
  }
  return out;
}

/** "kreg.adamsen@x.com" -> "Kreg Adamsen". Empty when the address isn't first.last. */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length < 2 || parts.some((p) => !/^[a-z]{2,}$/i.test(p))) return "";
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}
