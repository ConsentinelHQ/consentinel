import type { VendorCategory } from "@consentinel/shared";

// Tracker signature library. Data-driven and VERSIONED - new vendors are rows, not code.
export const SIGNATURE_LIBRARY_VERSION = "0.1.0";

export interface Signature {
  id: string;
  vendor: string;
  category: VendorCategory;
  consentRequired: boolean;
  host: string[];
  path: string[];
}

export const SIGNATURES: Signature[] = [
  {
    id: "ga4",
    vendor: "Google Analytics 4",
    category: "analytics",
    consentRequired: true,
    host: ["google-analytics.com", "analytics.google.com"],
    path: ["/g/collect", "/collect"],
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
    id: "gtm",
    vendor: "Google Tag Manager",
    category: "tag-manager",
    consentRequired: true,
    host: ["googletagmanager.com"],
    path: ["/gtm.js"],
  },
  {
    id: "google-ads",
    vendor: "Google Ads",
    category: "advertising",
    consentRequired: true,
    host: ["googleadservices.com", "google.com"],
    path: ["/pagead", "/ads"],
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
