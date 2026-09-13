import type { VendorCategory } from "@consentinel/shared";

/**
 * Cookie signature library.
 *
 * A cookie name alone is weak evidence; a cookie name attributed to a vendor is a
 * finding. "VISITOR_INFO1_LIVE set pre-consent" means nothing to a buyer - "YouTube
 * dropped an advertising cookie before consent" is the thing they act on.
 *
 * Data-driven and versioned, like the request signatures. New rows, not new code.
 */
export const COOKIE_LIBRARY_VERSION = "0.1.0";

export interface CookieSignature {
  /** Exact name, or a prefix when the vendor appends an id (e.g. `_gid`, `_ga_G-XXX`). */
  match: string;
  matchType: "exact" | "prefix";
  vendor: string;
  category: VendorCategory;
  /** False for strictly necessary cookies - those are legitimate before consent. */
  consentRequired: boolean;
}

export const COOKIE_SIGNATURES: CookieSignature[] = [
  // Google Analytics
  {
    match: "_ga",
    matchType: "prefix",
    vendor: "Google Analytics",
    category: "analytics",
    consentRequired: true,
  },
  {
    match: "_gid",
    matchType: "exact",
    vendor: "Google Analytics",
    category: "analytics",
    consentRequired: true,
  },
  {
    match: "_gat",
    matchType: "prefix",
    vendor: "Google Analytics",
    category: "analytics",
    consentRequired: true,
  },
  // Google advertising
  {
    match: "_gcl_",
    matchType: "prefix",
    vendor: "Google Ads",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "IDE",
    matchType: "exact",
    vendor: "Google DoubleClick",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "test_cookie",
    matchType: "exact",
    vendor: "Google DoubleClick",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "NID",
    matchType: "exact",
    vendor: "Google",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "__Secure-3PSID",
    matchType: "prefix",
    vendor: "Google",
    category: "advertising",
    consentRequired: true,
  },
  // YouTube embeds - the commonest silent violation on a marketing site
  {
    match: "VISITOR_INFO1_LIVE",
    matchType: "exact",
    vendor: "YouTube",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "VISITOR_PRIVACY_METADATA",
    matchType: "exact",
    vendor: "YouTube",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "YSC",
    matchType: "exact",
    vendor: "YouTube",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "__Secure-YNID",
    matchType: "exact",
    vendor: "YouTube",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "__Secure-ROLLOUT_TOKEN",
    matchType: "exact",
    vendor: "YouTube",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "PREF",
    matchType: "exact",
    vendor: "YouTube",
    category: "advertising",
    consentRequired: true,
  },
  // Meta
  {
    match: "_fbp",
    matchType: "exact",
    vendor: "Meta",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "_fbc",
    matchType: "exact",
    vendor: "Meta",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "fr",
    matchType: "exact",
    vendor: "Meta",
    category: "advertising",
    consentRequired: true,
  },
  // Other advertising
  {
    match: "_ttp",
    matchType: "exact",
    vendor: "TikTok",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "_tt_enable_cookie",
    matchType: "exact",
    vendor: "TikTok",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "li_sugr",
    matchType: "exact",
    vendor: "LinkedIn",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "bcookie",
    matchType: "exact",
    vendor: "LinkedIn",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "UserMatchHistory",
    matchType: "exact",
    vendor: "LinkedIn",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "_scid",
    matchType: "exact",
    vendor: "Snap",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "_rdt_uuid",
    matchType: "exact",
    vendor: "Reddit",
    category: "advertising",
    consentRequired: true,
  },
  // Session recording
  {
    match: "_hj",
    matchType: "prefix",
    vendor: "Hotjar",
    category: "session-recording",
    consentRequired: true,
  },
  {
    match: "_clck",
    matchType: "exact",
    vendor: "Microsoft Clarity",
    category: "session-recording",
    consentRequired: true,
  },
  {
    match: "_clsk",
    matchType: "exact",
    vendor: "Microsoft Clarity",
    category: "session-recording",
    consentRequired: true,
  },
  {
    match: "MUID",
    matchType: "exact",
    vendor: "Microsoft",
    category: "advertising",
    consentRequired: true,
  },
  // Strictly necessary - legitimate before consent, never a finding
  {
    match: "OptanonConsent",
    matchType: "exact",
    vendor: "OneTrust",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "OptanonAlertBoxClosed",
    matchType: "exact",
    vendor: "OneTrust",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "CookieConsent",
    matchType: "exact",
    vendor: "Cookiebot",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "didomi_token",
    matchType: "exact",
    vendor: "Didomi",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "euconsent-v2",
    matchType: "exact",
    vendor: "IAB TCF",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "__cf",
    matchType: "prefix",
    vendor: "Cloudflare",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "PHPSESSID",
    matchType: "exact",
    vendor: "Session",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "JSESSIONID",
    matchType: "exact",
    vendor: "Session",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "csrftoken",
    matchType: "exact",
    vendor: "Session",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "XSRF-TOKEN",
    matchType: "exact",
    vendor: "Session",
    category: "essential",
    consentRequired: false,
  },
];

export function classifyCookie(name: string): CookieSignature | null {
  for (const sig of COOKIE_SIGNATURES) {
    if (sig.matchType === "exact" ? name === sig.match : name.startsWith(sig.match)) return sig;
  }
  return null;
}
