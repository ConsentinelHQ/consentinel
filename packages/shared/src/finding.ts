/**
 * Consentinel — shared finding schema.
 *
 * This is the contract every part of the system speaks: the scanner PRODUCES it,
 * the API STORES it, the dashboard RENDERS it, and the evidence export SERIALISES it.
 *
 * It is VERSIONED on purpose (roadmap Epic 1.6): bump SCHEMA_VERSION on any breaking
 * change so historical scans stay comparable as the engine evolves.
 *
 * Two fields exist from v1 even though they aren't populated yet — `compliance` and
 * the PCI/jurisdiction types. That is deliberate: multi-jurisdiction (Phase 6) and the
 * PCI 6.4.3 wedge must be a data-fill later, never a schema migration.
 */

export const FINDING_SCHEMA_VERSION = "1.0.0" as const;

export type Severity = "critical" | "warning" | "info";

/** The consent state the page was in when an observation was made. */
/**
 * "gpc": no reject control was clicked, but the visitor sent Global Privacy
 * Control. Under California's CCPA regulations that signal is a valid opt-out
 * of sale and sharing, so advertising that fires anyway is a finding.
 */
export type ConsentState = "default" | "rejected" | "granted" | "gpc";

export type VendorCategory =
  | "analytics"
  | "advertising"
  | "session-recording"
  | "tag-manager"
  | "social"
  | "essential"
  | "unknown";

/**
 * Versioned finding types. Adding a member is non-breaking; changing the meaning
 * of an existing one requires a SCHEMA_VERSION bump.
 */
export type FindingType =
  | "tracker-fires-pre-consent"
  | "consent-signal-ignored" // tag saw gcs=denied and fired anyway
  | "pii-leak-to-tracker"
  | "cookie-set-pre-consent"
  | "exposed-credential" // plaintext token in a GTM Constant / inline script
  | "uninventoried-script" // PCI DSS 6.4.3: script with no documented justification
  | "payment-page-tamper" // PCI DSS 11.6.1: change detected on a payment page
  | "dead-tag"
  | "duplicate-tag"
  /** CMP is installed but showed no banner - often geo-targeting that exempts US visitors. */
  | "consent-banner-absent";

/** Privacy/security regimes a finding can be evaluated against. */
export type Jurisdiction =
  | "EU_GDPR"
  | "UK_GDPR"
  | "US_CCPA"
  | "US_CPRA"
  | "AU_PRIVACY_ACT"
  | "IN_DPDP"
  | "SG_PDPA"
  | "PCI_DSS";

/**
 * How a finding lands under a specific regime. The same tag can be fine in one
 * jurisdiction and a violation in another — this is the premium differentiator.
 */
export interface ComplianceMapping {
  regime: Jurisdiction;
  status: "violation" | "warning" | "not-applicable" | "ok";
  /** e.g. "Art. 6 GDPR — no lawful basis pre-consent" or "PCI DSS 6.4.3". */
  reference: string;
  rationale: string;
}

/** Discriminated evidence union — every finding carries machine-readable proof. */
export type Evidence =
  | {
      kind: "request";
      url: string;
      method: string;
      resourceType: string;
      matched?: string;
    }
  | {
      kind: "cookie";
      name: string;
      domain: string;
      firstParty: boolean;
      expires?: number;
    }
  | { kind: "script"; src: string; documented: boolean; integrity?: string }
  | { kind: "credential"; location: string; tokenPreview: string }
  /** The consent platform's own observed behaviour, rather than a request or cookie. */
  | { kind: "cmp"; platform: string; bannerShown: boolean; detail: string };

/** Google Consent Mode state observed on the proving request, if any. */
export interface ConsentSignal {
  gcs: string; // e.g. "G100"
  state: "denied" | "granted" | "unknown";
}

export interface Finding {
  id: string;
  schemaVersion: typeof FINDING_SCHEMA_VERSION;
  type: FindingType;
  severity: Severity;
  vendor: string;
  category: VendorCategory;
  title: string;
  detail: string;
  /** Which consent pass surfaced this — the heart of the comparison. */
  observedUnder: ConsentState;
  evidence: Evidence;
  consentSignal?: ConsentSignal;
  /**
   * Per-regime evaluation. Empty until a jurisdiction is selected, but the field
   * exists from v1 so Phase 6 multi-jurisdiction is a data-fill, not a migration.
   */
  compliance: ComplianceMapping[];
  remediation: string;
  firstSeenAt: string; // ISO 8601
}

/** Detected consent management platform summary. */
export interface CmpSummary {
  detected: {
    id: string;
    name: string;
    confidence: "low" | "medium" | "high";
  } | null;
  consentMode: { present: boolean; defaultState: "denied" | "granted" | null };
}

/** The full result of one scan — what the API stores and the report renders. */
export interface ScanResult {
  scanId: string;
  url: string;
  scannedAt: string; // ISO 8601
  engineVersion: string;
  signatureLibraryVersion: string;
  cmpRegistryVersion: string;
  cmp: CmpSummary;
  headline: string;
  counts: Record<Severity, number>;
  findings: Finding[];
  /** Tags that fired ONLY after consent — proof the engine does not cry wolf. */
  correctlyGated: Array<{ vendor: string; category: VendorCategory }>;
  /**
   * Why the denied pass observed what it did.
   *
   * Without this, a "default" observation is unreadable: a CMP that showed no
   * banner (often geo-targeting) and a banner whose reject control we could not
   * click are completely different problems, one theirs and one ours.
   */
  consentAttempt?: {
    performed: boolean;
    bannerPresent?: boolean;
    /** Banner shown with no decline control. A finding about them, not a tooling miss. */
    noRejectOffered?: boolean;
    reason?: string;
    selector?: string;
  };
}
