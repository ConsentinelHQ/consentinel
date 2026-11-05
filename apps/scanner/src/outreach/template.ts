import type { Role } from "./contacts.js";
import { byProminence, joinNames, type Evidence } from "./evidence.js";

/**
 * The cold email, word for word from Charlie's template. Every claim in the
 * bullets comes straight from Evidence, so nothing here is model-written.
 */

export interface Email {
  subject: string;
  text: string;
  html: string;
}

export interface TemplateInput {
  domain: string;
  firstName: string;
  ev: Evidence;
  /** Optional footer line. Empty leaves it out. */
  postalAddress: string;
  /** Ignored by the first email (no links in a cold first touch); kept for callers. */
  reportUrl?: string;
  /** Ignored: one short email fits every role. */
  role?: Role;
  /** Ignored: colleagues are emailed later, never named. */
  alsoSent?: string[];
  /** First name of the contact who left and whose auto-reply named this person. "" when unknown. */
  referredBy?: string;
  /** Shopify store: offer the App Store install as a no-reply option. */
  shopify?: boolean;
}

export const SHOPIFY_LISTING = "https://apps.shopify.com/consentinel-1";

/** One line per role, after the findings. Plain, no pitch. */
export const ROLE_LINE: Readonly<Record<Role, string | null>> = {
  owner: null,
  risk: null,
  budget: "Most of these are marketing tags, so the fix likely runs through your team.",
};

/** The deadline that makes this urgent: AB 566, effective January 1, 2027. */
const DEADLINE = "which every browser has to offer starting January 1";

export function stillFire(list: string[]): string {
  const n = list.length;
  const named = joinNames(byProminence(list).slice(0, 3));
  return n <= 3
    ? `${String(n)} ad vendors still fire: ${named}`
    : `${String(n)} ad vendors still fire, including ${named}`;
}

/** "TikTok or Attentive", "TikTok, Attentive or Klaviyo". */
function joinOr(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1] ?? ""}`;
}

const COUNT_WORDS = ["", "", "both", "all three"];

/** The policy line, only when every scan read the policy and found a vendor missing. */
export function policyBullet(notMentioned: string[] | undefined): string | null {
  const list = notMentioned ?? [];
  const n = list.length;
  if (n === 0) return null;
  if (n === 1)
    return `Your privacy policy doesn't mention ${list[0] ?? ""}, but it runs on your site`;
  if (n <= 3)
    return `Your privacy policy doesn't mention ${joinOr(list)}, but ${COUNT_WORDS[n] ?? ""} run on your site`;
  const rest = n - 3;
  return `Your privacy policy doesn't mention ${list.slice(0, 3).join(", ")} or ${String(rest)} other ${rest === 1 ? "vendor" : "vendors"}, but all of them run on your site`;
}

export function bullets(ev: Evidence): [string, string, string, ...string[]] {
  const base = coreBullets(ev);
  const policy = policyBullet(ev.notMentioned);
  return policy ? [...base, policy] : base;
}

function coreBullets(ev: Evidence): [string, string, string] {
  const vendors = stillFire(ev.firing);
  const plural = ev.gated === 1 ? "vendor correctly" : "vendors correctly";
  // evaluate() only names vendors that fired in both runs, so this is literal.
  const repeat = `We ran the scan twice and the same vendors fired both times, with ${String(ev.critical)} critical findings in total`;
  if (ev.mode === "rejected") {
    const gpc = ev.gpcIgnored ?? [];
    return [
      `After declining cookies, ${vendors}`,
      ev.gated > 0
        ? `${String(ev.gated)} other ${plural} ${ev.gated === 1 ? "waits" : "wait"} for consent, so the banner is working - these just aren't connected to it`
        : "None of the tags we saw changed behavior after the reject click",
      // The dated hook beats the repeat-run line when we have it.
      gpc.length >= MIN_GPC_BULLET
        ? `With Global Privacy Control on (the browser opt-out setting California requires sites to honor, ${DEADLINE}), ${stillFire(gpc)}`
        : repeat,
    ];
  }
  return [
    `With Global Privacy Control turned on (the browser opt-out signal California requires sites to honor, ${DEADLINE}), ${vendors}`,
    ev.gated > 0
      ? `${String(ev.gated)} other ${plural} ${ev.gated === 1 ? "stops" : "stop"}, so the signal is being read - these just aren't connected to it`
      : "None of them stopped when the signal was on",
    repeat,
  ];
}

/** One vendor ignoring GPC reads as a shrug; two is a pattern. */
const MIN_GPC_BULLET = 2;

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Neutral subject. "Privacy issues" read like a demand letter. Older sends keep the old one. */
export const subjectFor = (domain: string): string => `Opt-out check on ${domain}`;
/** Gmail search for every first email we've sent, old subject and new. */
export const SUBJECT_QUERY = '(subject:"Privacy issues on" OR subject:"Opt-out check on")';

/** The one finding the first email leads with: GPC when we have it, else the reject click. */
const SITE = "https://www.getconsentinel.com/";

/** "9 ad vendors were still firing, including Meta, Google Ads and TikTok". */
function wereFiring(list: string[]): string {
  const n = list.length;
  const named = joinNames(byProminence(list).slice(0, 3));
  return n <= 3
    ? `${String(n)} ad vendors were still firing: ${named}`
    : `${String(n)} ad vendors were still firing, including ${named}`;
}

/** GPC leads when we have it; the reject click otherwise. */
function gpcLed(ev: Evidence): boolean {
  return ev.mode !== "rejected" || (ev.gpcIgnored ?? []).length >= MIN_GPC_BULLET;
}

/** The finding sentence. `site` is the domain as text, or as a link in HTML. */
export function headline(ev: Evidence, site: string): string {
  if (gpcLed(ev)) {
    const list = ev.mode === "rejected" ? (ev.gpcIgnored ?? []) : ev.firing;
    return `I ran a scan on ${site} with the browser's opt-out signal (Global Privacy Control) turned on, and ${wereFiring(list)}.`;
  }
  return `I ran a scan on ${site}, and after declining cookies, ${wereFiring(ev.firing)}.`;
}

/**
 * First email, Charlie's wording (Nov 3, 2026): one finding, why it's usually an
 * easy fix, an offer to send the report. Two links only: Consentinel and their site.
 * Colleagues get their own email later (team-draft), never named here.
 */
export function render({
  domain,
  firstName,
  ev,
  postalAddress,
  referredBy,
  shopify,
}: TemplateInput): Email {
  const greeting = `Hi ${firstName.trim() || "there"},`;
  const referral =
    referredBy === undefined
      ? null
      : `${referredBy.trim() ? `${referredBy.trim()}'s` : "An"} auto-reply pointed me to you.`;
  const intro = (name: string): string =>
    `I'm Charlie, I build ${name} - a tool that checks whether sites honor privacy opt-outs.`;
  const policy = ev.notMentioned?.length
    ? "Some of them aren't named in your privacy policy either."
    : null;
  // Why it matters now, with no legal threat: more shoppers will be sending the signal.
  const why = gpcLed(ev)
    ? "Starting January 1, every browser has to offer that setting, so a lot more of your shoppers will be sending it."
    : null;
  const body = (site: string): string =>
    [headline(ev, site), ...(policy ? [policy] : []), ...(why ? [why] : [])].join(" ");
  const peer =
    "I've spent years managing marketing tags for different companies, and these gaps almost always come from a tag that hasn't been connected to the consent setup, so it's typically a quick and easy fix.";
  const ask =
    "If you'd like, I'm happy to send over the full report. It shows each request and when it fired. Hope this helps!";
  // A smaller ask than replying: run it themselves from their admin.
  const app = shopify
    ? (link: string): string =>
        `It's also on the ${link} if you'd rather run the check yourself from your admin.`
    : null;
  const sig = ["Charlie", "Founder, Consentinel"];
  const optOut = "If you'd rather not hear from me, just say so and I won't email again.";

  const text = [
    greeting,
    "",
    ...(referral ? [referral, ""] : []),
    intro("Consentinel"),
    "",
    body(domain),
    "",
    peer,
    "",
    ask,
    "",
    ...(app ? [app(`Shopify App Store (${SHOPIFY_LISTING})`), ""] : []),
    ...sig,
    "",
    optOut,
    ...(postalAddress.trim() ? [postalAddress.trim()] : []),
  ].join("\n");

  const a = (href: string, label: string): string => `<a href="${esc(href)}">${esc(label)}</a>`;
  const p = (x: string): string => `<p>${x}</p>`;
  const html = [
    p(esc(greeting)),
    ...(referral ? [p(esc(referral))] : []),
    p(esc(intro("\u0000")).replace("\u0000", a(SITE, "Consentinel"))),
    p(esc(body("\u0000")).replace("\u0000", a(`https://${domain}`, domain))),
    p(esc(peer)),
    p(esc(ask)),
    ...(app
      ? [p(esc(app("\u0000")).replace("\u0000", a(SHOPIFY_LISTING, "Shopify App Store")))]
      : []),
    p(sig.map(esc).join("<br>")),
    `<p style="color:#888;font-size:12px">${esc(optOut)}${postalAddress.trim() ? `<br>${esc(postalAddress.trim())}` : ""}</p>`,
  ].join("\n");

  return { subject: subjectFor(domain), text, html };
}
