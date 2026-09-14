import type { VendorCategory } from "@consentinel/shared";

/**
 * Tracker signature library. Data-driven and VERSIONED - new vendors are rows, not code.
 *
 * ORDER MATTERS. classify() returns the FIRST match, so the allowlist block runs
 * before anything that could shadow it (google.com/recaptcha before google.com/ads).
 *
 * consentRequired=false means "recognised, never flagged". That is a deliberate
 * anti-false-positive tool, not an oversight - see the allowlist notes below.
 */
export const SIGNATURE_LIBRARY_VERSION = "0.2.0";

export interface Signature {
  id: string;
  vendor: string;
  category: VendorCategory;
  consentRequired: boolean;
  host: string[];
  path: string[];
}

export const SIGNATURES: Signature[] = [
  // ---------------------------------------------------------------------------
  // ALLOWLIST - recognised, never flagged. Must stay first.
  // ---------------------------------------------------------------------------

  // Bot defence and payments. Strictly necessary; flagging these is crying wolf.
  {
    id: "recaptcha",
    vendor: "Google reCAPTCHA",
    category: "essential",
    consentRequired: false,
    host: ["google.com", "gstatic.com", "recaptcha.net"],
    path: ["/recaptcha"],
  },
  {
    id: "turnstile",
    vendor: "Cloudflare Turnstile",
    category: "essential",
    consentRequired: false,
    host: ["challenges.cloudflare.com"],
    path: [],
  },
  {
    id: "stripe",
    vendor: "Stripe",
    category: "essential",
    consentRequired: false,
    host: ["stripe.com", "stripe.network"],
    path: [],
  },
  {
    id: "paypal",
    vendor: "PayPal",
    category: "essential",
    consentRequired: false,
    host: ["paypal.com", "paypalobjects.com"],
    path: [],
  },
  {
    id: "klarna",
    vendor: "Klarna",
    category: "essential",
    consentRequired: false,
    host: ["klarna.com", "klarnaservices.com"],
    path: [],
  },
  {
    id: "afterpay",
    vendor: "Afterpay",
    category: "essential",
    consentRequired: false,
    host: ["afterpay.com", "clearpay.co.uk"],
    path: [],
  },
  {
    id: "shopify-cdn",
    vendor: "Shopify CDN",
    category: "essential",
    consentRequired: false,
    host: ["cdn.shopify.com", "shopifycdn.com"],
    path: [],
  },
  {
    id: "sentry",
    vendor: "Sentry",
    category: "essential",
    consentRequired: false,
    host: ["sentry.io", "sentry-cdn.com"],
    path: [],
  },
  {
    id: "algolia",
    vendor: "Algolia",
    category: "essential",
    consentRequired: false,
    host: ["algolia.net", "algolianet.com"],
    path: [],
  },
  {
    id: "youtube-nocookie",
    vendor: "YouTube (no-cookie)",
    category: "essential",
    consentRequired: false,
    host: ["youtube-nocookie.com"],
    path: [],
  },

  /**
   * Live chat and helpdesk: recognised, deliberately not flagged.
   *
   * Whether a chat widget is "strictly necessary" is genuinely contested, and a
   * request finding is hardcoded critical. A contested critical on a site that is
   * otherwise clean costs more credibility than the finding is worth. Promote these
   * the day severity supports a "review" tier.
   */
  {
    id: "intercom",
    vendor: "Intercom",
    category: "essential",
    consentRequired: false,
    host: ["intercom.io", "intercomcdn.com", "intercomassets.com"],
    path: [],
  },
  {
    id: "zendesk",
    vendor: "Zendesk",
    category: "essential",
    consentRequired: false,
    host: ["zendesk.com", "zdassets.com"],
    path: [],
  },
  {
    id: "gorgias",
    vendor: "Gorgias",
    category: "essential",
    consentRequired: false,
    host: ["gorgias.chat", "gorgias.com"],
    path: [],
  },
  {
    id: "drift",
    vendor: "Drift",
    category: "essential",
    consentRequired: false,
    host: ["drift.com", "driftt.com"],
    path: [],
  },

  // ---------------------------------------------------------------------------
  // TAG MANAGERS
  // ---------------------------------------------------------------------------
  {
    id: "gtm",
    vendor: "Google Tag Manager",
    category: "tag-manager",
    consentRequired: true,
    host: ["googletagmanager.com"],
    path: ["/gtm.js"],
  },
  {
    id: "gtag-js",
    vendor: "Google gtag.js",
    category: "tag-manager",
    consentRequired: true,
    host: ["googletagmanager.com"],
    path: ["/gtag/js"],
  },
  {
    id: "gtag-destination",
    vendor: "Google Ads (gtag destination)",
    category: "advertising",
    consentRequired: true,
    host: ["googletagmanager.com"],
    path: ["/gtag/destination"],
  },
  {
    id: "tealium",
    vendor: "Tealium iQ",
    category: "tag-manager",
    consentRequired: true,
    host: ["tiqcdn.com", "tealiumiq.com"],
    path: [],
  },
  {
    id: "adobe-launch",
    vendor: "Adobe Experience Platform Launch",
    category: "tag-manager",
    consentRequired: true,
    host: ["adobedtm.com"],
    path: [],
  },
  {
    id: "segment",
    vendor: "Segment",
    category: "tag-manager",
    consentRequired: true,
    host: ["segment.com", "segment.io", "segmentapis.com"],
    path: [],
  },
  {
    id: "mparticle",
    vendor: "mParticle",
    category: "tag-manager",
    consentRequired: true,
    host: ["mparticle.com"],
    path: [],
  },

  // ---------------------------------------------------------------------------
  // ANALYTICS
  // ---------------------------------------------------------------------------
  {
    id: "ga4",
    vendor: "Google Analytics 4",
    category: "analytics",
    consentRequired: true,
    host: ["google-analytics.com", "analytics.google.com"],
    path: ["/g/collect", "/collect"],
  },
  {
    id: "adobe-analytics",
    vendor: "Adobe Analytics",
    category: "analytics",
    consentRequired: true,
    host: ["omtrdc.net", "2o7.net"],
    path: [],
  },
  {
    id: "matomo",
    vendor: "Matomo",
    category: "analytics",
    consentRequired: true,
    host: ["matomo.cloud", "matomo.org"],
    path: [],
  },
  {
    id: "plausible",
    vendor: "Plausible",
    category: "analytics",
    consentRequired: true,
    host: ["plausible.io"],
    path: [],
  },
  {
    id: "fathom",
    vendor: "Fathom Analytics",
    category: "analytics",
    consentRequired: true,
    host: ["usefathom.com"],
    path: [],
  },
  {
    id: "mixpanel",
    vendor: "Mixpanel",
    category: "analytics",
    consentRequired: true,
    host: ["mixpanel.com", "mxpnl.com"],
    path: [],
  },
  {
    id: "amplitude",
    vendor: "Amplitude",
    category: "analytics",
    consentRequired: true,
    host: ["amplitude.com"],
    path: [],
  },
  {
    id: "heap",
    vendor: "Heap",
    category: "analytics",
    consentRequired: true,
    host: ["heap.io", "heapanalytics.com"],
    path: [],
  },
  {
    id: "comscore",
    vendor: "Comscore",
    category: "analytics",
    consentRequired: true,
    host: ["scorecardresearch.com"],
    path: [],
  },
  {
    id: "cloudflare-insights",
    vendor: "Cloudflare Web Analytics",
    category: "analytics",
    consentRequired: true,
    host: ["cloudflareinsights.com"],
    path: [],
  },
  {
    id: "vercel-analytics",
    vendor: "Vercel Analytics",
    category: "analytics",
    consentRequired: true,
    host: ["vercel-insights.com", "vercel-scripts.com"],
    path: [],
  },
  {
    id: "new-relic",
    vendor: "New Relic",
    category: "analytics",
    consentRequired: true,
    host: ["nr-data.net", "newrelic.com"],
    path: [],
  },
  {
    id: "datadog-rum",
    vendor: "Datadog RUM",
    category: "analytics",
    consentRequired: true,
    host: ["browser-intake-datadoghq.com", "datadoghq-browser-agent.com"],
    path: [],
  },
  // Shopify's own storefront analytics beacon. Present on nearly every Shopify site.
  {
    id: "shopify-monorail",
    vendor: "Shopify Analytics",
    category: "analytics",
    consentRequired: true,
    host: ["monorail-edge.shopifysvc.com"],
    path: [],
  },
  {
    id: "hubspot",
    vendor: "HubSpot",
    category: "analytics",
    consentRequired: true,
    host: ["hs-analytics.net", "hs-scripts.com", "hsforms.net", "hsadspixel.net", "hubspot.com"],
    path: [],
  },
  {
    id: "optimizely",
    vendor: "Optimizely",
    category: "analytics",
    consentRequired: true,
    host: ["optimizely.com"],
    path: [],
  },
  {
    id: "vwo",
    vendor: "VWO",
    category: "analytics",
    consentRequired: true,
    host: ["visualwebsiteoptimizer.com"],
    path: [],
  },
  {
    id: "abtasty",
    vendor: "AB Tasty",
    category: "analytics",
    consentRequired: true,
    host: ["abtasty.com"],
    path: [],
  },

  // ---------------------------------------------------------------------------
  // SESSION RECORDING - highest risk tier. Records keystrokes and form input.
  // ---------------------------------------------------------------------------
  {
    id: "hotjar",
    vendor: "Hotjar",
    category: "session-recording",
    consentRequired: true,
    host: ["hotjar.com", "hotjar.io"],
    path: [],
  },
  {
    id: "clarity",
    vendor: "Microsoft Clarity",
    category: "session-recording",
    consentRequired: true,
    host: ["clarity.ms"],
    path: [],
  },
  {
    id: "fullstory",
    vendor: "FullStory",
    category: "session-recording",
    consentRequired: true,
    host: ["fullstory.com", "fullstory.org"],
    path: [],
  },
  {
    id: "logrocket",
    vendor: "LogRocket",
    category: "session-recording",
    consentRequired: true,
    host: ["logrocket.com", "logrocket.io", "lr-ingest.io", "logr-ingest.com"],
    path: [],
  },
  {
    id: "mouseflow",
    vendor: "Mouseflow",
    category: "session-recording",
    consentRequired: true,
    host: ["mouseflow.com"],
    path: [],
  },
  {
    id: "smartlook",
    vendor: "Smartlook",
    category: "session-recording",
    consentRequired: true,
    host: ["smartlook.com", "smartlook.cloud"],
    path: [],
  },
  {
    id: "luckyorange",
    vendor: "Lucky Orange",
    category: "session-recording",
    consentRequired: true,
    host: ["luckyorange.com", "luckyorange.net"],
    path: [],
  },
  {
    id: "crazyegg",
    vendor: "Crazy Egg",
    category: "session-recording",
    consentRequired: true,
    host: ["crazyegg.com"],
    path: [],
  },
  {
    id: "inspectlet",
    vendor: "Inspectlet",
    category: "session-recording",
    consentRequired: true,
    host: ["inspectlet.com"],
    path: [],
  },
  {
    id: "contentsquare",
    vendor: "Contentsquare",
    category: "session-recording",
    consentRequired: true,
    host: ["contentsquare.net", "content-square.net"],
    path: [],
  },
  {
    id: "quantum-metric",
    vendor: "Quantum Metric",
    category: "session-recording",
    consentRequired: true,
    host: ["quantummetric.com"],
    path: [],
  },
  {
    id: "glassbox",
    vendor: "Glassbox",
    category: "session-recording",
    consentRequired: true,
    host: ["glassboxdigital.io"],
    path: [],
  },

  // ---------------------------------------------------------------------------
  // ADVERTISING - the tier regulators fine
  // ---------------------------------------------------------------------------
  {
    id: "google-ads",
    vendor: "Google Ads",
    category: "advertising",
    consentRequired: true,
    host: ["googleadservices.com", "google.com"],
    path: ["/pagead", "/ads"],
  },
  {
    id: "doubleclick",
    vendor: "Google DoubleClick",
    category: "advertising",
    consentRequired: true,
    host: ["doubleclick.net"],
    path: [],
  },
  {
    id: "meta-pixel",
    vendor: "Meta Pixel",
    category: "advertising",
    consentRequired: true,
    host: ["connect.facebook.net", "facebook.com"],
    path: ["/tr", "/fbevents.js"],
  },
  {
    id: "tiktok",
    vendor: "TikTok Pixel",
    category: "advertising",
    consentRequired: true,
    host: ["analytics.tiktok.com"],
    path: [],
  },
  {
    id: "snapchat",
    vendor: "Snap Pixel",
    category: "advertising",
    consentRequired: true,
    host: ["sc-static.net", "tr.snapchat.com"],
    path: [],
  },
  {
    id: "pinterest",
    vendor: "Pinterest Tag",
    category: "advertising",
    consentRequired: true,
    host: ["ct.pinterest.com", "s.pinimg.com"],
    path: [],
  },
  {
    id: "twitter-x",
    vendor: "X (Twitter) Pixel",
    category: "advertising",
    consentRequired: true,
    host: ["ads-twitter.com", "analytics.twitter.com", "t.co"],
    path: [],
  },
  {
    id: "reddit",
    vendor: "Reddit Pixel",
    category: "advertising",
    consentRequired: true,
    host: ["redditstatic.com", "reddit.com"],
    path: ["/ads"],
  },
  {
    id: "linkedin",
    vendor: "LinkedIn Insight",
    category: "advertising",
    consentRequired: true,
    host: ["snap.licdn.com", "px.ads.linkedin.com"],
    path: [],
  },
  {
    id: "bing-uet",
    vendor: "Microsoft Advertising UET",
    category: "advertising",
    consentRequired: true,
    host: ["bat.bing.com"],
    path: [],
  },
  {
    id: "criteo",
    vendor: "Criteo",
    category: "advertising",
    consentRequired: true,
    host: ["criteo.com", "criteo.net"],
    path: [],
  },
  {
    id: "taboola",
    vendor: "Taboola",
    category: "advertising",
    consentRequired: true,
    host: ["taboola.com"],
    path: [],
  },
  {
    id: "outbrain",
    vendor: "Outbrain",
    category: "advertising",
    consentRequired: true,
    host: ["outbrain.com"],
    path: [],
  },
  {
    id: "amazon-ads",
    vendor: "Amazon Advertising",
    category: "advertising",
    consentRequired: true,
    host: ["amazon-adsystem.com"],
    path: [],
  },
  {
    id: "trade-desk",
    vendor: "The Trade Desk",
    category: "advertising",
    consentRequired: true,
    host: ["adsrvr.org"],
    path: [],
  },
  {
    id: "adroll",
    vendor: "AdRoll",
    category: "advertising",
    consentRequired: true,
    host: ["adroll.com", "adroll.net"],
    path: [],
  },
  {
    id: "xandr",
    vendor: "Xandr (AppNexus)",
    category: "advertising",
    consentRequired: true,
    host: ["adnxs.com"],
    path: [],
  },
  {
    id: "magnite",
    vendor: "Magnite (Rubicon)",
    category: "advertising",
    consentRequired: true,
    host: ["rubiconproject.com"],
    path: [],
  },
  {
    id: "pubmatic",
    vendor: "PubMatic",
    category: "advertising",
    consentRequired: true,
    host: ["pubmatic.com"],
    path: [],
  },
  {
    id: "rtb-house",
    vendor: "RTB House",
    category: "advertising",
    consentRequired: true,
    host: ["creativecdn.com"],
    path: [],
  },
  {
    id: "teads",
    vendor: "Teads",
    category: "advertising",
    consentRequired: true,
    host: ["teads.tv"],
    path: [],
  },
  {
    id: "yahoo-dot",
    vendor: "Yahoo Dot",
    category: "advertising",
    consentRequired: true,
    host: ["analytics.yahoo.com", "ads.yahoo.com"],
    path: [],
  },
  {
    id: "quantcast",
    vendor: "Quantcast",
    category: "advertising",
    consentRequired: true,
    host: ["quantserve.com", "quantcount.com"],
    path: [],
  },
  {
    id: "dynamic-yield",
    vendor: "Dynamic Yield",
    category: "advertising",
    consentRequired: true,
    host: ["dynamicyield.com"],
    path: [],
  },

  // Affiliate networks. Drop a click identifier the moment the page loads.
  {
    id: "awin",
    vendor: "Awin",
    category: "advertising",
    consentRequired: true,
    host: ["awin1.com", "dwin1.com"],
    path: [],
  },
  {
    id: "shareasale",
    vendor: "ShareASale",
    category: "advertising",
    consentRequired: true,
    host: ["shareasale.com"],
    path: [],
  },
  {
    id: "impact",
    vendor: "Impact",
    category: "advertising",
    consentRequired: true,
    host: ["impactradius-event.com", "impact.com"],
    path: [],
  },
  {
    id: "rakuten-advertising",
    vendor: "Rakuten Advertising",
    category: "advertising",
    consentRequired: true,
    host: ["linksynergy.com"],
    path: [],
  },
  {
    id: "cj-affiliate",
    vendor: "CJ Affiliate",
    category: "advertising",
    consentRequired: true,
    host: ["emjcd.com", "anrdoezrs.net", "dpbolvw.net"],
    path: [],
  },

  // Email and SMS marketing. The mid-market e-commerce stack, and the most
  // commonly ungated vendors on a Shopify storefront.
  {
    id: "klaviyo",
    vendor: "Klaviyo",
    category: "advertising",
    consentRequired: true,
    host: ["klaviyo.com"],
    path: [],
  },
  {
    id: "attentive",
    vendor: "Attentive",
    category: "advertising",
    consentRequired: true,
    host: ["attn.tv", "attentivemobile.com"],
    path: [],
  },
  {
    id: "postscript",
    vendor: "Postscript",
    category: "advertising",
    consentRequired: true,
    host: ["postscript.io"],
    path: [],
  },
  {
    id: "omnisend",
    vendor: "Omnisend",
    category: "advertising",
    consentRequired: true,
    host: ["omnisend.com", "omnisendapi.com"],
    path: [],
  },
  {
    id: "mailchimp",
    vendor: "Mailchimp",
    category: "advertising",
    consentRequired: true,
    host: ["chimpstatic.com", "list-manage.com", "mailchimp.com"],
    path: [],
  },
  {
    id: "braze",
    vendor: "Braze",
    category: "advertising",
    consentRequired: true,
    host: ["braze.com", "braze.eu", "appboycdn.com"],
    path: [],
  },
  {
    id: "iterable",
    vendor: "Iterable",
    category: "advertising",
    consentRequired: true,
    host: ["iterable.com"],
    path: [],
  },
  {
    id: "marketo",
    vendor: "Marketo",
    category: "advertising",
    consentRequired: true,
    host: ["marketo.net", "mktoresp.com"],
    path: [],
  },
  {
    id: "pardot",
    vendor: "Salesforce Pardot",
    category: "advertising",
    consentRequired: true,
    host: ["pardot.com"],
    path: [],
  },
  {
    id: "justuno",
    vendor: "Justuno",
    category: "advertising",
    consentRequired: true,
    host: ["justuno.com"],
    path: [],
  },
  {
    id: "privy",
    vendor: "Privy",
    category: "advertising",
    consentRequired: true,
    host: ["privy.com"],
    path: [],
  },

  // ---------------------------------------------------------------------------
  // SOCIAL AND EMBEDS - usually nobody's decision, which is why they leak
  // ---------------------------------------------------------------------------
  {
    id: "youtube",
    vendor: "YouTube",
    category: "social",
    consentRequired: true,
    host: ["youtube.com", "ytimg.com"],
    path: [],
  },
  {
    id: "vimeo",
    vendor: "Vimeo",
    category: "social",
    consentRequired: true,
    host: ["vimeo.com", "vimeocdn.com"],
    path: [],
  },
  {
    id: "wistia",
    vendor: "Wistia",
    category: "social",
    consentRequired: true,
    host: ["wistia.com", "wistia.net"],
    path: [],
  },
  {
    id: "instagram",
    vendor: "Instagram",
    category: "social",
    consentRequired: true,
    host: ["instagram.com", "cdninstagram.com"],
    path: [],
  },
  {
    id: "addthis",
    vendor: "AddThis",
    category: "social",
    consentRequired: true,
    host: ["addthis.com"],
    path: [],
  },
  {
    id: "sharethis",
    vendor: "ShareThis",
    category: "social",
    consentRequired: true,
    host: ["sharethis.com"],
    path: [],
  },
  {
    id: "disqus",
    vendor: "Disqus",
    category: "social",
    consentRequired: true,
    host: ["disqus.com", "disquscdn.com"],
    path: [],
  },
];

/** Classify a single request URL. Returns the matched signature or null. */
export function classify(urlString: string): Signature | null {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  for (const sig of SIGNATURES) {
    const hostMatch = sig.host.some((h) => host === h || host.endsWith("." + h));
    if (!hostMatch) continue;
    if (sig.path.length === 0) return sig;
    if (sig.path.some((p) => u.pathname.includes(p))) return sig;
  }
  return null;
}

export interface ParsedConsentSignal {
  gcs: string;
  state: "denied" | "granted" | "unknown";
}

/** Extract Google Consent Mode state (gcs) from a request URL, if present. */
export function extractConsentSignal(urlString: string): ParsedConsentSignal | null {
  try {
    const gcs = new URL(urlString).searchParams.get("gcs");
    if (!gcs) return null;
    const state = gcs === "G100" ? "denied" : gcs === "G111" ? "granted" : "unknown";
    return { gcs, state };
  } catch {
    return null;
  }
}
