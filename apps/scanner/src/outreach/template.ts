import type { Role } from "./contacts.js";
import { canonicalVendor } from "@consentinel/shared";
import {
  MIN_VENDORS,
  byProminence,
  joinNames,
  a11yStrong,
  leadWith,
  type A11yEvidence,
  type Evidence,
} from "./evidence.js";

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
  /** Consent evidence clears the bar on its own. Defaults to 2+ named vendors. */
  consentStrong?: boolean;
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

/** Names us and their site, nothing alarming. Older sends keep their old subjects. */
export const subjectFor = (domain: string): string => `Consentinel for ${domain}`;
/** Gmail search for every first email we've sent, old subjects and new. */
export const SUBJECT_QUERY =
  '(subject:"Privacy issues on" OR subject:"Opt-out check on" OR subject:"Quick heads-up about" OR subject:"Consentinel for")';

const SITE = "https://www.getconsentinel.com/";

/** GPC leads when we have it; the reject click otherwise. */
function gpcLed(ev: Evidence): boolean {
  return ev.mode !== "rejected" || (ev.gpcIgnored ?? []).length >= MIN_GPC_BULLET;
}

/** "9 ad vendors are still firing, including Meta, Google Ads and TikTok". */
function areFiring(list: string[]): string {
  const n = list.length;
  const named = joinNames(byProminence(list).slice(0, 3));
  return n <= 3
    ? `${String(n)} ad vendors are still firing: ${named}`
    : `${String(n)} ad vendors are still firing, including ${named}`;
}

/** The lead-in above the bullets. */
export function leadIn(ev: Evidence, domain: string): string {
  return gpcLed(ev)
    ? `Here's what's happening on ${domain} right now with the signal on:`
    : `Here's what's happening on ${domain} right now after declining cookies:`;
}

/**
 * The site's issues as bullets, so a skimmer gets them. Every line comes from
 * Evidence; nothing here is model-written.
 */
export function siteBullets(ev: Evidence): string[] {
  const led = gpcLed(ev);
  const list = led && ev.mode === "rejected" ? (ev.gpcIgnored ?? []) : ev.firing;
  const out = [areFiring(list)];
  const plural = ev.gated === 1 ? "vendor" : "vendors";
  if (ev.mode === "gpc") {
    out.push(
      ev.gated > 0
        ? `${String(ev.gated)} other ${plural} ${ev.gated === 1 ? "stops" : "stop"} correctly, so the signal is being read - these just aren't connected to it`
        : "None of them stopped when the signal was on",
    );
  } else if (!led) {
    out.push(
      ev.gated > 0
        ? `${String(ev.gated)} other ${plural} ${ev.gated === 1 ? "waits" : "wait"} for consent, so the banner is working - these just aren't connected to it`
        : "None of the tags we saw changed behavior after the reject click",
    );
  }
  const policy = policyBullet(ev.notMentioned);
  if (policy) out.push(policy);
  const gtm = gtmBullet(ev, list);
  if (gtm) out.push(gtm);
  return out;
}

/** "3 of them load through your Google Tag Manager container (GTM-ABC), so ...". */
export function gtmBullet(ev: Evidence, list: string[]): string | null {
  const findings = ev.latest?.findings ?? [];
  const names = new Set(list.map(canonicalVendor));
  const viaGtm = new Set<string>();
  const containers = new Set<string>();
  for (const f of findings) {
    const v = canonicalVendor(f.vendor);
    if (!names.has(v) || !f.gtm?.length) continue;
    viaGtm.add(v);
    for (const r of f.gtm) containers.add(r.containerId);
  }
  const n = viaGtm.size;
  if (n === 0) return null;
  const ids = [...containers].join(", ");
  const which =
    n === list.length
      ? n === 1
        ? "It loads"
        : n === 2
          ? "Both load"
          : "All of them load"
      : `${String(n)} of them load`;
  return `${which} through your Google Tag Manager container (${ids}), so the fix is a consent setting on ${n === 1 ? "that tag" : "each tag"}`;
}

/** "Images missing alt text (14 elements)". Titles come from our own rule table. */
export function a11yBullets(a: A11yEvidence): string[] {
  return a.top.map(
    (i) => `${i.title}${i.instances > 1 ? ` (${String(i.instances)} elements)` : ""}`,
  );
}

/** One line for the side that doesn't lead. */
export function a11yAside(a: A11yEvidence): string {
  return `Separately, your homepage scores ${String(a.score)}/100 on automated accessibility checks, with ${String(a.severe)} serious ${a.severe === 1 ? "issue" : "issues"} (${(a.top[0]?.title ?? "").toLowerCase()} is the biggest)`;
}

export function consentAside(ev: Evidence): string {
  const list = gpcLed(ev) && ev.mode === "rejected" ? (ev.gpcIgnored ?? []) : ev.firing;
  const how = gpcLed(ev)
    ? "with Global Privacy Control on (the browser opt-out setting every browser has to offer starting January 1)"
    : "after a visitor declines cookies";
  return `Separately, ${how}, ${areFiring(list)}`;
}

/**
 * Accessibility-led first email (Nov 12, 2026): same shape and sign-off as the
 * consent email, CTA is the free Shopify app for Shopify stores.
 */
function renderA11y(input: TemplateInput, a: A11yEvidence, consentStrong: boolean): Email {
  const { domain, firstName, ev, postalAddress, referredBy, shopify } = input;
  const greeting = `Hi ${firstName.trim() || "there"},`;
  const referral =
    referredBy === undefined
      ? null
      : `${referredBy.trim() ? `${referredBy.trim()}'s` : "An"} auto-reply pointed me to you.`;
  const intro = (name: string): string =>
    `I'm Charlie, founder of ${name}. We help companies catch accessibility and privacy issues on their websites.`;
  const why = `I ran ${domain}'s homepage through an automated WCAG 2.2 check. These are the kinds of issues that stop some visitors, like people using screen readers, from getting through a site, and most are quick fixes:`;
  const items = [...a11yBullets(a), ...(consentStrong ? [consentAside(ev)] : [])];
  const pitchShop = (link: string): string =>
    `If it helps, our free ${link} shows every issue with the fix, right in your admin, and can recheck the store for you after that.`;
  const pitchWeb = (link: string): string =>
    `You can run a free scan anytime at ${link} to see every issue and how to fix it. Consentinel can also recheck the site daily and alert your team in Teams, Jira or Slack when something new breaks.`;
  const close = "I'd be happy to send over the details or answer any questions.";
  const sig = ["Cheers,", "Charlie", "Founder, Consentinel"];
  const optOut = "If you'd rather I didn't follow up, just let me know.";

  const text = [
    greeting,
    "",
    ...(referral ? [referral, ""] : []),
    intro("Consentinel"),
    "",
    why,
    "",
    ...items.map((b) => `- ${b}`),
    "",
    shopify ? pitchShop(`Shopify app (${SHOPIFY_LISTING})`) : pitchWeb("getconsentinel.com"),
    "",
    close,
    "",
    ...sig,
    "",
    optOut,
    ...(postalAddress.trim() ? [postalAddress.trim()] : []),
  ].join("\n");

  const link = (href: string, label: string): string => `<a href="${esc(href)}">${esc(label)}</a>`;
  const p = (x: string): string => `<p>${x}</p>`;
  const linked = (sentence: (slot: string) => string, href: string, label: string): string =>
    esc(sentence("\u0000")).replace("\u0000", link(href, label));
  const html = [
    p(esc(greeting)),
    ...(referral ? [p(esc(referral))] : []),
    p(linked(intro, SITE, "Consentinel")),
    p(esc(why)),
    `<ul>${items.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`,
    shopify
      ? p(linked(pitchShop, SHOPIFY_LISTING, "Shopify app"))
      : p(linked(pitchWeb, SITE, "getconsentinel.com")),
    p(esc(close)),
    p(sig.map(esc).join("<br>")),
    `<p style="color:#888;font-size:12px">${esc(optOut)}${postalAddress.trim() ? `<br>${esc(postalAddress.trim())}` : ""}</p>`,
  ].join("\n");

  return { subject: subjectFor(domain), text, html };
}

/**
 * First email, Charlie's wording (Nov 8, 2026): who we are, why it matters now,
 * the site's issues as bullets, what Consentinel does, an offer to help.
 * Colleagues get their own email later (team-draft), never named here.
 */
export function render(input: TemplateInput): Email {
  const consentStrong = input.consentStrong ?? input.ev.firing.length >= MIN_VENDORS;
  const lead = leadWith(input.ev, consentStrong);
  if (lead === "a11y" && input.ev.a11y) return renderA11y(input, input.ev.a11y, consentStrong);
  return renderConsent(input);
}

/** Consent-led first email. A strong accessibility result adds one bullet. */
function renderConsent({
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
    a11yStrong(ev.a11y)
      ? `I'm Charlie, founder of ${name}. We help companies catch accessibility and privacy issues on their websites.`
      : `I'm Charlie, founder of ${name}. We help companies make sure their marketing tags respect visitors' privacy choices.`;
  const why = gpcLed(ev)
    ? "Starting January 1, every browser has to offer an opt-out setting called Global Privacy Control, so far more people will be sending that signal. The usual problem is a tag that was never connected to the consent setup, so it keeps firing anyway."
    : "The usual problem is a tag that was never connected to the consent setup, so it keeps firing after a visitor opts out.";
  const items = [...siteBullets(ev), ...(a11yStrong(ev.a11y) ? [a11yAside(ev.a11y)] : [])];
  const pitch = (link: string): string =>
    `It's usually a quick fix. You can run a free scan anytime at ${link}, and once it's fixed, Consentinel checks the site daily, points to the exact Google Tag Manager tag to change, and alerts your team in Teams, Jira or Slack if a new gap shows up.`;
  const store = (link: string): string =>
    `Consentinel is also on the ${link} if you'd rather run it from your admin.`;
  const close = "I'd be happy to send over the details or answer any questions.";
  const sig = ["Cheers,", "Charlie", "Founder, Consentinel"];
  const optOut = "If you'd rather I didn't follow up, just let me know.";

  const text = [
    greeting,
    "",
    ...(referral ? [referral, ""] : []),
    intro("Consentinel"),
    "",
    why,
    "",
    leadIn(ev, domain),
    "",
    ...items.map((b) => `- ${b}`),
    "",
    pitch("getconsentinel.com"),
    ...(shopify ? ["", store(`Shopify App Store (${SHOPIFY_LISTING})`)] : []),
    "",
    close,
    "",
    ...sig,
    "",
    optOut,
    ...(postalAddress.trim() ? [postalAddress.trim()] : []),
  ].join("\n");

  const a = (href: string, label: string): string => `<a href="${esc(href)}">${esc(label)}</a>`;
  const p = (x: string): string => `<p>${x}</p>`;
  const linked = (sentence: (slot: string) => string, href: string, label: string): string =>
    esc(sentence("\u0000")).replace("\u0000", a(href, label));
  const html = [
    p(esc(greeting)),
    ...(referral ? [p(esc(referral))] : []),
    p(linked(intro, SITE, "Consentinel")),
    p(esc(why)),
    p(esc(leadIn(ev, domain))),
    `<ul>${items.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`,
    p(linked(pitch, SITE, "getconsentinel.com")),
    ...(shopify ? [p(linked(store, SHOPIFY_LISTING, "Shopify App Store"))] : []),
    p(esc(close)),
    p(sig.map(esc).join("<br>")),
    `<p style="color:#888;font-size:12px">${esc(optOut)}${postalAddress.trim() ? `<br>${esc(postalAddress.trim())}` : ""}</p>`,
  ].join("\n");

  return { subject: subjectFor(domain), text, html };
}
