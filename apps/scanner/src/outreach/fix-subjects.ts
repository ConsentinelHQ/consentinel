import { createDraft, deleteDraft, getDraft, listDrafts } from "./google.js";
import { header, partBody } from "./mail.js";
import { OLD_SUBJECT } from "./followup.js";
import { domainFromSubject } from "./referral.js";
import { record } from "./state.js";
import { subjectFor } from "./template.js";

/**
 * One-off (Nov 9, 2026): unsent follow-up drafts that inherited the retired
 * "Privacy issues on <domain>" subject become fresh drafts with "Consentinel
 * for <domain>", same recipient and body, no thread. Never sends.
 */

export interface FixResult {
  fixed: string[];
  skipped: Record<string, string>;
}

export async function fixSubjects(log: (s: string) => void = () => {}): Promise<FixResult> {
  const out: FixResult = { fixed: [], skipped: {} };
  for (const id of await listDrafts('subject:"Privacy issues on"')) {
    const msg = await getDraft(id);
    if (!msg) continue;
    const subject = header(msg, "Subject");
    const to = header(msg, "To");
    const from = header(msg, "From");
    const domain = domainFromSubject(subject);
    const text = partBody(msg, "text/plain");
    const html = partBody(msg, "text/html");
    if (!OLD_SUBJECT.test(subject) || !domain || !to || !from || !text || !html) {
      out.skipped[id] = `can't rebuild: ${subject || "no subject"}`;
      continue;
    }
    // New draft first, so a failure never loses the old one.
    const fresh = await createDraft(from, to, { subject: subjectFor(domain), text, html });
    await deleteDraft(id);
    record({
      domain,
      action: "drafted",
      email: to,
      messageId: fresh,
      reason: "follow-up: subject fix",
    });
    out.fixed.push(`${domain} -> ${to}`);
    log(`fixed ${domain} (${to})`);
  }
  return out;
}
