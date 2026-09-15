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

/**
 * An organisation owns sites and carries the subscription. Sites belong to orgs
 * rather than users from day one: an agency managing ten client stores is the
 * customer worth having when pricing is per site, and retrofitting orgs later
 * means a data migration plus an auth rewrite.
 *
 * A solo merchant simply gets a one-member org created at signup.
 */
export const orgs = pgTable(
  "orgs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Clerk owns org identity; this is the local mirror.
    clerkOrgId: text("clerk_org_id").notNull(),
    name: text("name").notNull(),
    /** Stripe customer, created on first subscription. Null until they pay. */
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    /** "none" until a subscription is active. Gates scheduling, not scanning. */
    plan: text("plan").$type<OrgPlan>().notNull().default("none"),
    /** Subscription item, needed to update quantity when sites are added. */
    stripeSubscriptionItemId: text("stripe_subscription_item_id"),
    /** Raw Stripe status. Only "active" and "trialing" grant access. */
    planStatus: text("plan_status").$type<PlanStatus>(),
    /** Sites paid for. Scheduling gated on site count <= this. */
    planQuantity: integer("plan_quantity").notNull().default(0),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("orgs_clerk_org_id_idx").on(t.clerkOrgId),
    index("orgs_stripe_customer_idx").on(t.stripeCustomerId),
  ],
);

export const orgMembers = pgTable(
  "org_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<OrgRole>().notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("org_members_unique_idx").on(t.orgId, t.userId),
    index("org_members_user_idx").on(t.userId),
  ],
);

export const sites = pgTable(
  "sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    label: text("label"),
    /** How often to scan automatically. "off" means manual only. */
    schedule: text("schedule").$type<ScanSchedule>().notNull().default("off"),
    /** Set by the scheduler after each run, so a query can find what is due. */
    lastScheduledAt: timestamp("last_scheduled_at", { withTimezone: true }),
    // Baseline for regression alerting (Epic 4.3). Nullable until one is approved.
    baselineScanId: uuid("baseline_scan_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sites_org_url_idx").on(t.orgId, t.url),
    index("sites_org_idx").on(t.orgId),
    // The scheduler queries "what is due" across all orgs, so this index carries
    // the hot path for every cron tick.
    index("sites_schedule_idx").on(t.schedule, t.lastScheduledAt),
  ],
);

export type OrgRole = "owner" | "admin" | "member";
/** "none" gates scheduling and alerting. Manual scans stay free forever. */
export type OrgPlan = "none" | "monitoring";
export type PlanStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";
export type ScanSchedule = "off" | "daily" | "weekly" | "monthly";

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
    /** Random token granting full-report access without a session. Null until shared. */
    shareToken: text("share_token"),
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
    // A share link resolves by token alone, so it must hit an index and be unique.
    uniqueIndex("scans_share_token_idx").on(t.shareToken),
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
