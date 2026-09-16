/**
 * Bot-management detection.
 *
 * A blocked scan must never be graded. "0 findings" on a site whose WAF refused
 * us is the single most damaging output this engine can produce: it reads as a
 * clean bill of health for a site nobody actually looked at.
 *
 * Detection is deliberately conservative. A false "blocked" costs a retry; a
 * false "clean" costs a customer.
 */

export type BotVendor = "cloudflare" | "akamai" | "datadome" | "perimeterx" | "imperva" | "unknown";

export interface BlockEvidence {
  vendor: BotVendor;
  /** What gave it away, shown to the user so the claim is checkable. */
  signal: string;
  status?: number;
}

/** Statuses a WAF returns when it intervenes. 503 is Cloudflare's classic challenge. */
const CHALLENGE_STATUSES = new Set([401, 403, 405, 429, 503]);

/**
 * Header markers. Matched case-insensitively against the main document response.
 * Value is the vendor; presence of the header alone is not enough for every one,
 * which is why `detectBlock` also requires a challenge status for the ambiguous ones.
 */
const HEADER_MARKERS: Array<{ header: string; vendor: BotVendor; conclusive: boolean }> = [
  { header: "cf-mitigated", vendor: "cloudflare", conclusive: true },
  { header: "x-datadome", vendor: "datadome", conclusive: true },
  { header: "x-datadome-cid", vendor: "datadome", conclusive: true },
  { header: "x-iinfo", vendor: "imperva", conclusive: false },
  { header: "x-px-block", vendor: "perimeterx", conclusive: true },
  // Akamai sets this on normal traffic too, so it only counts alongside a challenge.
  { header: "akamai-grn", vendor: "akamai", conclusive: false },
];

/** Cookies a WAF drops when it challenges. Presence plus a bad status is conclusive. */
const COOKIE_MARKERS: Array<{ name: string; vendor: BotVendor }> = [
  { name: "_abck", vendor: "akamai" },
  { name: "bm_sz", vendor: "akamai" },
  { name: "ak_bmsc", vendor: "akamai" },
  { name: "datadome", vendor: "datadome" },
  { name: "_px", vendor: "perimeterx" },
  { name: "incap_ses", vendor: "imperva" },
  { name: "visid_incap", vendor: "imperva" },
];

export interface BlockInput {
  /** Status of the main document response. */
  status: number;
  /** Response headers of the main document, lowercased keys. */
  headers: Record<string, string>;
  /** Cookie names present after the navigation. */
  cookieNames: readonly string[];
  /** Page title, if any. Challenge pages announce themselves. */
  title?: string;
}

export function detectBlock(input: BlockInput): BlockEvidence | null {
  const challenged = CHALLENGE_STATUSES.has(input.status);

  for (const marker of HEADER_MARKERS) {
    const value = input.headers[marker.header];
    if (value === undefined) continue;
    if (marker.conclusive) {
      return {
        vendor: marker.vendor,
        signal: `response header ${marker.header}`,
        status: input.status,
      };
    }
    if (challenged) {
      return {
        vendor: marker.vendor,
        signal: `HTTP ${String(input.status)} with ${marker.header}`,
        status: input.status,
      };
    }
  }

  if (challenged) {
    for (const marker of COOKIE_MARKERS) {
      if (input.cookieNames.some((n) => n === marker.name || n.startsWith(marker.name))) {
        return {
          vendor: marker.vendor,
          signal: `HTTP ${String(input.status)} with ${marker.name} cookie`,
          status: input.status,
        };
      }
    }
  }

  // Challenge pages name themselves in the title. Cheap, and catches vendors
  // whose headers we do not know yet.
  const title = input.title?.toLowerCase() ?? "";
  if (
    title.includes("just a moment") ||
    title.includes("attention required") ||
    title.includes("access denied") ||
    title.includes("are you a robot") ||
    title.includes("pardon our interruption")
  ) {
    return {
      vendor: title.includes("just a moment") ? "cloudflare" : "unknown",
      signal: `challenge page titled "${input.title ?? ""}"`,
      status: input.status,
    };
  }

  // A bare challenge status with no other marker. Real, but we cannot name who.
  if (challenged) {
    return { vendor: "unknown", signal: `HTTP ${String(input.status)}`, status: input.status };
  }

  return null;
}

/** Human-readable vendor name for report copy. */
export function vendorLabel(vendor: BotVendor): string {
  switch (vendor) {
    case "cloudflare":
      return "Cloudflare";
    case "akamai":
      return "Akamai";
    case "datadome":
      return "DataDome";
    case "perimeterx":
      return "HUMAN (PerimeterX)";
    case "imperva":
      return "Imperva";
    default:
      return "bot protection";
  }
}
