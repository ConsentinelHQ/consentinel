import { canonicalVendor } from "./severity.js";

/**
 * Disclosure Check: does the site's privacy or cookie policy name the vendors
 * our scan saw running? Deliberately lenient. A policy that names the parent
 * company counts as naming the product, so "not named" is a claim we can stand
 * behind: no mention of the vendor or its owner anywhere in the policy text.
 */

export interface PolicyRef {
  kind: "privacy" | "cookie";
  url: string;
  /** Characters of readable text found. */
  chars: number;
  /** SHA-256 of the normalized text, to tell when a policy changes. */
  sha256: string;
}

export interface DisclosureCheck {
  /** "no-policy": no policy link found. "unreadable": found, but no usable text (often an iframe). */
  status: "checked" | "no-policy" | "unreadable";
  policies: PolicyRef[];
  /** Vendors seen running that a policy names, canonical names. */
  named: string[];
  /** Vendors seen running that no policy names. */
  notNamed: string[];
}

/** Below this, a "policy" page is a shell (a cookie-banner stub, an embed loader). */
export const MIN_POLICY_CHARS = 800;

const i = (s: string): RegExp => new RegExp(`\\b${s}\\b`, "i");

/**
 * Terms a policy uses for a vendor. Owner names count. Case-sensitive where the
 * word is common English ("Meta", "Impact", "Heap", "Segment", "Drift").
 */
const TERMS: Readonly<Record<string, readonly RegExp[]>> = {
  Meta: [/\bMeta\b/, i("facebook"), i("instagram")],
  Instagram: [/\bMeta\b/, i("facebook"), i("instagram")],
  "Google Ads": [i("google"), i("doubleclick"), i("adwords")],
  "Google DoubleClick": [i("google"), i("doubleclick")],
  "Google Analytics": [i("google")],
  "Google Tag Manager": [i("google")],
  "Google gtag.js": [i("google")],
  YouTube: [i("youtube"), i("google")],
  TikTok: [i("tiktok"), i("bytedance")],
  Snap: [i("snapchat"), i("snap inc"), /\bSnap\b/],
  Pinterest: [i("pinterest")],
  Reddit: [i("reddit")],
  LinkedIn: [i("linkedin")],
  "Microsoft Advertising": [i("microsoft"), i("bing")],
  "Microsoft Clarity": [i("microsoft"), i("clarity")],
  "X (Twitter)": [i("twitter"), /\bX Corp/],
  "Amazon Advertising": [i("amazon")],
  "Adobe Analytics": [i("adobe")],
  "Adobe Audience Manager": [i("adobe")],
  "Adobe Experience Platform Launch": [i("adobe")],
  "Xandr (AppNexus)": [i("xandr"), i("appnexus"), i("microsoft")],
  "Magnite (Rubicon)": [i("magnite"), i("rubicon")],
  "Neustar (TransUnion)": [i("neustar"), i("transunion")],
  "Nielsen eXelate": [i("nielsen"), i("exelate")],
  "Yahoo Dot": [i("yahoo")],
  "The Trade Desk": [i("trade desk"), i("tradedesk")],
  "RTB House": [i("rtb house")],
  "Rakuten Advertising": [i("rakuten")],
  "CJ Affiliate": [i("cj affiliate"), i("commission junction"), /\bCJ\b/],
  "Salesforce Pardot": [i("salesforce"), i("pardot")],
  "Datadog RUM": [i("datadog")],
  "New Relic": [i("new relic")],
  Impact: [/\bImpact(?:\.com| Radius| Tech)\b/, i("impact\\.com")],
  Heap: [/\bHeap\b/],
  Segment: [/\bSegment\b/, i("twilio")],
  Drift: [/\bDrift\b/, i("salesloft")],
  Privy: [/\bPrivy\b/],
  Shopify: [i("shopify")],
  "Shopify Analytics": [i("shopify")],
};

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Terms for a vendor: listed ones, else its own name, else its name without a product suffix. */
export function termsFor(vendor: string): readonly RegExp[] {
  const name = canonicalVendor(vendor);
  const listed = TERMS[name];
  if (listed) return listed;
  const out = [i(escape(name))];
  const bare = name.replace(/\s+(Pixel|Tag|Ads|Analytics|Advertising|Insight|RUM|iQ)$/i, "");
  if (bare !== name && bare.length >= 4) out.push(i(escape(bare)));
  return out;
}

export function normalizePolicy(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Which vendors the combined policy text names. Input vendors are deduped by canonical name. */
export function checkDisclosure(
  vendors: readonly string[],
  texts: readonly string[],
): { named: string[]; notNamed: string[] } {
  const all = normalizePolicy(texts.join(" \n "));
  const unique = [...new Set(vendors.map(canonicalVendor))].sort((a, b) => a.localeCompare(b));
  const named: string[] = [];
  const notNamed: string[] = [];
  for (const v of unique) (termsFor(v).some((re) => re.test(all)) ? named : notNamed).push(v);
  return { named, notNamed };
}
