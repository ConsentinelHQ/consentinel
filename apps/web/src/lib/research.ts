/**
 * Published research figures. A snapshot of `outreach stats`, so the numbers on
 * the site don't move when the outreach sheet does. Re-run and update together.
 */

export const REPORT = {
  slug: "opt-out-report-2026",
  title: "Who keeps tracking after visitors opt out",
  asOf: "October 26, 2026",
  sites: 313,
  afterReject: 43,
  underGpc: 270,
  medianCritical: 17,
} as const;

/** The honest frame for every figure. Never claim a share of all sites. */
export const POPULATION =
  "US e-commerce brands where Consentinel found trackers still firing after a visitor opted out, by clicking reject or sending Global Privacy Control. Sites that passed aren't in this data, so these figures describe brands that leak, not all brands.";

export interface VendorStat {
  slug: string;
  name: string;
  sites: number;
  share: number;
  /** What it is, in one line. */
  what: string;
  /** How it usually ends up running after an opt-out. */
  how: string;
  /** The fix, consistent with the advice in scan reports. */
  fix: string;
}

export const VENDORS: VendorStat[] = [
  {
    slug: "meta-pixel",
    name: "Meta",
    sites: 148,
    share: 47,
    what: "The Meta Pixel reports page views and purchases to Facebook and Instagram for ad targeting and measurement.",
    how: "It's usually added directly to the theme or by an app, outside the tag manager where consent rules live, so it loads whatever the visitor chose.",
    fix: "Gate the Meta Pixel behind consent so it can't load, send data or set cookies until the visitor opts in, using your consent app's script blocking. If you also send events through Meta's Conversions API, the opt-out has to reach that server-side path too: blocking the browser pixel doesn't stop it.",
  },
  {
    slug: "google-ads",
    name: "Google Ads",
    sites: 142,
    share: 45,
    what: "Google Ads conversion and remarketing tags report visits and purchases back to Google's ad platform.",
    how: "Tags fire from Google Tag Manager or the Google tag without consent checks, or Consent Mode is left with defaults that don't start denied.",
    fix: "Set Google Consent Mode defaults to denied so tags wait for an opt-in, and add consent checks to each marketing tag in your container. In Consent Mode's advanced setup Google tags still send cookieless pings while consent is denied; whether that fits an opt-out of sale or sharing is a question for counsel.",
  },
  {
    slug: "tiktok-pixel",
    name: "TikTok",
    sites: 113,
    share: 36,
    what: "The TikTok Pixel reports page views and conversions to TikTok for ad targeting and measurement.",
    how: "It's often added by an app or directly in the theme, outside the tag manager, so consent rules never apply to it.",
    fix: "Gate the TikTok Pixel behind consent so it can't load, send data or set cookies until the visitor opts in, using your consent app's script blocking.",
  },
  {
    slug: "klaviyo",
    name: "Klaviyo",
    sites: 89,
    share: 28,
    what: "Klaviyo's onsite script powers signup forms and tracks browsing for email and SMS marketing.",
    how: "Stores install it for signup forms and treat it as essential, so it loads before any consent choice and keeps running after an opt-out.",
    fix: "Delay Klaviyo's onsite script until marketing consent, using your consent app's script blocking or Klaviyo's consent settings.",
  },
  {
    slug: "pinterest-tag",
    name: "Pinterest",
    sites: 48,
    share: 15,
    what: "The Pinterest Tag reports visits and conversions to Pinterest for ad targeting and measurement.",
    how: "Commonly added by the Pinterest app or in the theme, outside consent controls.",
    fix: "Gate the Pinterest Tag behind consent so it can't load, send data or set cookies until the visitor opts in, using your consent app's script blocking.",
  },
  {
    slug: "microsoft-ads",
    name: "Microsoft Ads",
    sites: 42,
    share: 13,
    what: "Microsoft's UET tag reports visits and conversions to Microsoft Advertising (Bing) for targeting and measurement.",
    how: "Often added once for a campaign and forgotten, firing on every page without a consent check.",
    fix: "Gate the UET tag behind consent, or use Microsoft's consent mode for UET so it waits for an opt-in before storing or sending ad data.",
  },
  {
    slug: "attentive",
    name: "Attentive",
    sites: 38,
    share: 12,
    what: "Attentive's tag powers SMS signup forms and tracks browsing for text message marketing.",
    how: "Like other signup tools, it's treated as part of the site and loads regardless of the visitor's choice.",
    fix: "Gate Attentive behind consent so it can't load, send data or set cookies until the visitor opts in, using your consent app's script blocking.",
  },
  {
    slug: "snap-pixel",
    name: "Snap",
    sites: 27,
    share: 9,
    what: "The Snap Pixel reports visits and conversions to Snapchat for ad targeting and measurement.",
    how: "Usually added for a campaign directly in the theme or by an app, outside consent controls.",
    fix: "Gate the Snap Pixel behind consent so it can't load, send data or set cookies until the visitor opts in, using your consent app's script blocking.",
  },
];

/** Vendors shown in the report chart but without their own page. */
export const OTHER_VENDORS = [
  { name: "The Trade Desk", sites: 23, share: 7 },
  { name: "LiveRamp", sites: 18, share: 6 },
];

export const SEGMENTS: { segment: string; sites: number }[] = [
  { segment: "Apparel", sites: 84 },
  { segment: "Home", sites: 58 },
  { segment: "Beauty", sites: 40 },
  { segment: "Beverage", sites: 28 },
  { segment: "Food", sites: 18 },
  { segment: "Wellness", sites: 17 },
  { segment: "Baby", sites: 13 },
  { segment: "Accessories", sites: 11 },
  { segment: "Pet", sites: 9 },
  { segment: "Tech", sites: 9 },
  { segment: "Personal care", sites: 8 },
  { segment: "Jewelry", sites: 6 },
  { segment: "Travel", sites: 5 },
];

export const pct = (n: number): number => Math.round((n / REPORT.sites) * 100);
