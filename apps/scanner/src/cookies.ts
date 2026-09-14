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
export const COOKIE_LIBRARY_VERSION = "0.2.0";

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
  /**
   * Vendors surfaced by a 20-site batch run, ranked by how often they appeared.
   * These were all landing in the unattributed pile, which is where credibility
   * goes to die: the buyer sees noise instead of a vendor they recognise.
   */
  {
    match: "_shopify_s",
    matchType: "exact",
    vendor: "Shopify Analytics",
    category: "analytics",
    consentRequired: true,
  },
  {
    match: "_shopify_y",
    matchType: "exact",
    vendor: "Shopify Analytics",
    category: "analytics",
    consentRequired: true,
  },
  {
    match: "_shopify_analytics",
    matchType: "prefix",
    vendor: "Shopify Analytics",
    category: "analytics",
    consentRequired: true,
  },
  {
    match: "_shopify_marketing",
    matchType: "prefix",
    vendor: "Shopify",
    category: "advertising",
    consentRequired: true,
  },
  // Microsoft Advertising UET - 19 sites carried "MR", the most common of all.
  {
    match: "MR",
    matchType: "exact",
    vendor: "Microsoft Advertising",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "_uetsid",
    matchType: "prefix",
    vendor: "Microsoft Advertising",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "_uetvid",
    matchType: "prefix",
    vendor: "Microsoft Advertising",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "ANONCHK",
    matchType: "exact",
    vendor: "Microsoft Advertising",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "CLID",
    matchType: "exact",
    vendor: "Microsoft Clarity",
    category: "session-recording",
    consentRequired: true,
  },
  {
    match: "SRM_B",
    matchType: "exact",
    vendor: "Microsoft Advertising",
    category: "advertising",
    consentRequired: true,
  },
  // Pinterest
  {
    match: "_pin_unauth",
    matchType: "exact",
    vendor: "Pinterest",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "_pinterest_ct",
    matchType: "prefix",
    vendor: "Pinterest",
    category: "advertising",
    consentRequired: true,
  },
  // Attentive - SMS marketing, ubiquitous on Shopify storefronts
  {
    match: "__attentive",
    matchType: "prefix",
    vendor: "Attentive",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "_attn_",
    matchType: "prefix",
    vendor: "Attentive",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "__attn_",
    matchType: "prefix",
    vendor: "Attentive",
    category: "advertising",
    consentRequired: true,
  },
  // Klaviyo
  {
    match: "__kla_id",
    matchType: "exact",
    vendor: "Klaviyo",
    category: "advertising",
    consentRequired: true,
  },
  // Postscript
  {
    match: "__ps_",
    matchType: "prefix",
    vendor: "Postscript",
    category: "advertising",
    consentRequired: true,
  },
  // TikTok
  {
    match: "ttcsid",
    matchType: "prefix",
    vendor: "TikTok",
    category: "advertising",
    consentRequired: true,
  },
  // Snap
  {
    match: "_scid",
    matchType: "prefix",
    vendor: "Snap",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "_sctr",
    matchType: "exact",
    vendor: "Snap",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "sc_at",
    matchType: "exact",
    vendor: "Snap",
    category: "advertising",
    consentRequired: true,
  },
  // Impact affiliate network
  {
    match: "IR_",
    matchType: "prefix",
    vendor: "Impact",
    category: "advertising",
    consentRequired: true,
  },
  // Adobe Audience Manager
  {
    match: "demdex",
    matchType: "exact",
    vendor: "Adobe Audience Manager",
    category: "advertising",
    consentRequired: true,
  },
  // Tapad cross-device identity
  {
    match: "TapAd_",
    matchType: "prefix",
    vendor: "Tapad",
    category: "advertising",
    consentRequired: true,
  },
  // The Trade Desk
  {
    match: "TDID",
    matchType: "exact",
    vendor: "The Trade Desk",
    category: "advertising",
    consentRequired: true,
  },
  {
    match: "TDCPM",
    matchType: "exact",
    vendor: "The Trade Desk",
    category: "advertising",
    consentRequired: true,
  },
  // LiveRamp
  {
    match: "_lc2_fpi",
    matchType: "prefix",
    vendor: "LiveRamp",
    category: "advertising",
    consentRequired: true,
  },
  // Contentsquare
  {
    match: "_cs_",
    matchType: "prefix",
    vendor: "Contentsquare",
    category: "session-recording",
    consentRequired: true,
  },
  // Dynamic Yield
  {
    match: "_dy",
    matchType: "prefix",
    vendor: "Dynamic Yield",
    category: "advertising",
    consentRequired: true,
  },
  // StackAdapt
  {
    match: "sa-user-id",
    matchType: "prefix",
    vendor: "StackAdapt",
    category: "advertising",
    consentRequired: true,
  },
  // Quantcast
  {
    match: "__qca",
    matchType: "exact",
    vendor: "Quantcast",
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

  /**
   * Consent-storage cookies from CMPs beyond the five we drive. A batch run
   * against 20 real e-commerce sites surfaced every one of these as a finding.
   * They record the visitor's choice - flagging them says we do not understand
   * consent, which is the one thing this product claims to understand.
   */
  {
    match: "cookieyes-consent",
    matchType: "exact",
    vendor: "CookieYes",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "_pandectes_gdpr",
    matchType: "exact",
    vendor: "Pandectes",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "_ketch_consent",
    matchType: "prefix",
    vendor: "Ketch",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "datagrail_consent",
    matchType: "prefix",
    vendor: "DataGrail",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "ometria_consent",
    matchType: "exact",
    vendor: "Ometria",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "tcf_consent",
    matchType: "exact",
    vendor: "IAB TCF",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "GlobalE_Consent",
    matchType: "exact",
    vendor: "Global-e",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "ABTastyConsent",
    matchType: "exact",
    vendor: "AB Tasty",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "_swb_consent",
    matchType: "prefix",
    vendor: "Swan",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "usnatUUID",
    matchType: "exact",
    vendor: "IAB US Privacy",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "usprivacy",
    matchType: "prefix",
    vendor: "IAB US Privacy",
    category: "essential",
    consentRequired: false,
  },

  /**
   * Shopify storefront plumbing: cart state, currency, locale, and the platform's
   * own session cookies. Flagging a cart cookie on an e-commerce site tells the
   * buyer we do not understand e-commerce.
   *
   * Note _shopify_s / _shopify_y ARE analytics and stay flagged below - only the
   * functional ones are allowlisted here.
   */
  {
    match: "_shopify_essential",
    matchType: "exact",
    vendor: "Shopify",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "_shop_app_essential",
    matchType: "exact",
    vendor: "Shopify",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "_tracking_consent",
    matchType: "exact",
    vendor: "Shopify",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "cart",
    matchType: "prefix",
    vendor: "Shopify",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "localization",
    matchType: "exact",
    vendor: "Shopify",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "customer_location",
    matchType: "exact",
    vendor: "Shopify",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "storefront_url",
    matchType: "exact",
    vendor: "Shopify",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "secure_customer_sig",
    matchType: "exact",
    vendor: "Shopify",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "shopify_client_id",
    matchType: "exact",
    vendor: "Shopify",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "keep_alive",
    matchType: "exact",
    vendor: "Shopify",
    category: "essential",
    consentRequired: false,
  },

  // Fraud prevention and bot defence. Strictly necessary, same as payments.
  {
    match: "forterToken",
    matchType: "exact",
    vendor: "Forter",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "_cfuvid",
    matchType: "exact",
    vendor: "Cloudflare",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "thx_guid",
    matchType: "exact",
    vendor: "ThreatMetrix",
    category: "essential",
    consentRequired: false,
  },
  {
    match: "tmx_guid",
    matchType: "exact",
    vendor: "ThreatMetrix",
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
