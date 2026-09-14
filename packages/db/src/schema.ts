import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  ComplianceMapping,
  ConsentSignal,
  ConsentState,
  Evidence,
  FindingType,
  ScanResult,
  Severity,
  VendorCategory,
} from "@consentinel/shared";

/**
 * Consentinel data layer.
 *
 * Design rules, chosen deliberately:
 *
 * 1. Enum-ish columns are TEXT with a $type<> cast, not Postgres enums. Adding a
 *    finding type or a vendor category must be a code change, not a migration -
 *    the signature library grows with every scan and must never be gated on DDL.
 * 2. Every scan keeps the full ScanResult as immutable JSONB alongside normalized
 *    rows. The rows make it queryable; the blob makes the audit trail defensible
 *    (Epic 6.2 needs the exact artifact, not a reconstruction).
 * 3. Findings are time series keyed by scan, not mutable per-site state. Diffs
 *    (Epic 3.3) compare two scans; nothing is ever updated in place.
 */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Clerk owns identity; this is the local mirror.
    clerkUserId: text("clerk_user_id").notNull(),
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_clerk_user_id_idx").on(t.clerkUserId)],
);

export const sites = pgTable(
  "sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    label: text("label"),
    // Baseline for regression alerting (Epic 4.3). Nullable until one is approved.
    baselineScanId: uuid("baseline_scan_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sites_user_url_idx").on(t.userId, t.url),
    index("sites_user_idx").on(t.userId),
  ],
);

export type ScanStatus = "queued" | "running" | "complete" | "failed";
export type ScanTrigger = "public" | "manual" | "scheduled";

export const scans = pgTable(
  "scans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Null for anonymous free-tier scans - the funnel mouth has no account yet.
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    status: text("status").$type<ScanStatus>().notNull().default("queued"),
    trigger: text("trigger").$type<ScanTrigger>().notNull().default("public"),
    engineVersion: text("engine_version"),
    signatureLibraryVersion: text("signature_library_version"),
    cmpRegistryVersion: text("cmp_registry_version"),
    cmpId: text("cmp_id"),
    cmpName: text("cmp_name"),
    consentModePresent: boolean("consent_mode_present"),
    headline: text("headline"),
    criticalCount: integer("critical_count").notNull().default(0),
    warningCount: integer("warning_count").notNull().default(0),
    infoCount: integer("info_count").notNull().default(0),
    /** The exact engine artifact. Immutable evidence for the audit trail. */
    result: jsonb("result").$type<ScanResult>(),
    error: text("error"),
    queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    // Scan history per site, newest first - the dashboard's main read.
    index("scans_site_finished_idx").on(t.siteId, t.finishedAt),
    // Free-tier per-domain cache lookup and rate limiting (Epic 2.4).
    index("scans_url_finished_idx").on(t.url, t.finishedAt),
    index("scans_status_idx").on(t.status),
  ],
);

export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scanId: uuid("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),
    /** Engine-local id within the scan, e.g. "preconsent-001". */
    localId: text("local_id").notNull(),
    schemaVersion: text("schema_version").notNull(),
    type: text("type").$type<FindingType>().notNull(),
    severity: text("severity").$type<Severity>().notNull(),
    vendor: text("vendor").notNull(),
    category: text("category").$type<VendorCategory>().notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    observedUnder: text("observed_under").$type<ConsentState>().notNull(),
    evidence: jsonb("evidence").$type<Evidence>().notNull(),
    consentSignal: jsonb("consent_signal").$type<ConsentSignal>(),
    compliance: jsonb("compliance").$type<ComplianceMapping[]>().notNull().default([]),
    remediation: text("remediation").notNull(),
    /**
     * Stable identity across scans: same violation, same key. This is what makes
     * "new / fixed / regressed" diffing possible without fuzzy matching.
     */
    fingerprint: text("fingerprint").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("findings_scan_idx").on(t.scanId),
    index("findings_scan_severity_idx").on(t.scanId, t.severity),
    // Diffing joins two scans on fingerprint.
    index("findings_fingerprint_idx").on(t.fingerprint),
    uniqueIndex("findings_scan_local_idx").on(t.scanId, t.localId),
  ],
);

/**
 * Email leads from the free scanner gate (Epic 2.3). Separate from users:
 * a lead is not an account, and we record consent because we of all products
 * must get our own consent right.
 */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    scanId: uuid("scan_id").references(() => scans.id, { onDelete: "set null" }),
    contactConsent: boolean("contact_consent").notNull().default(false),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("leads_email_idx").on(t.email)],
);

/**
 * Contact form submissions. Stored first, emailed second - if delivery fails we
 * still have the enquiry, which is the whole point of not using a mailto link.
 */
export const inquiries = pgTable(
  "inquiries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    company: text("company"),
    /** Which tier or page they came from: "audit", "monitoring", "general". */
    topic: text("topic").notNull().default("general"),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("inquiries_created_idx").on(t.createdAt)],
);

export type UserRow = typeof users.$inferSelect;
export type SiteRow = typeof sites.$inferSelect;
export type ScanRow = typeof scans.$inferSelect;
export type FindingRow = typeof findings.$inferSelect;
export type LeadRow = typeof leads.$inferSelect;
export type InquiryRow = typeof inquiries.$inferSelect;
