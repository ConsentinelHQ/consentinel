import "server-only";
import { NextResponse } from "next/server";
import {
  addExternalRecipient,
  applyShopifyPlan,
  addSite,
  createShopifyOrg,
  and,
  asc,
  desc,
  eq,
  findShopifyOrg,
  getOrCreateShareToken,
  scans,
  type ShopifyOrg,
} from "@consentinel/db";
import { assertScannableUrl, enqueueScan } from "@consentinel/queue";
import { toFullReport } from "@/lib/free-report";
import { db, scanQueue } from "@/lib/server";
import {
  bearer,
  exchangeToken,
  reviewMoment,
  fetchActiveSubscription,
  fetchShopInfo,
  shopOrgKey,
  shopifyConfig,
  toPlanStatusFromShopify,
  verifySessionToken,
  type SessionToken,
  type ShopifyConfig,
} from "@/lib/shopify";

export interface ShopifyContext {
  config: ShopifyConfig;
  session: SessionToken;
}

/** Authenticates an embedded-app API call, or returns the response to send. */
export function authenticate(request: Request): ShopifyContext | NextResponse {
  const config = shopifyConfig();
  if (!config) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const token = bearer(request);
  const session = token ? verifySessionToken(token, config) : null;
  if (!session) {
    // App Bridge retries with a fresh token when it sees this header.
    return NextResponse.json(
      { error: "Session expired. Reload the app." },
      { status: 401, headers: { "X-Shopify-Retry-Invalid-Session-Request": "1" } },
    );
  }
  return { config, session };
}

/**
 * First load does the install work: org, site for the primary domain, the store
 * email as alert recipient, and the first scan. Later loads only re-sync billing.
 */
export async function ensureInstalled(ctx: ShopifyContext): Promise<{
  org: ShopifyOrg;
  accessToken: string;
}> {
  const database = db();
  const key = shopOrgKey(ctx.session.shop);
  const accessToken = await exchangeToken(ctx.session, ctx.config);
  let org = await findShopifyOrg(database, key);

  if (!org || !org.siteId) {
    const info = await fetchShopInfo(ctx.session.shop, accessToken);
    const orgId = org?.orgId ?? (await createShopifyOrg(database, key, info.name));
    const check = await assertScannableUrl(info.primaryUrl);
    // Fall back to the myshopify domain if the custom domain can't be scanned.
    const url = check.ok ? check.url : `https://${ctx.session.shop}`;
    const siteId = await addSite(database, orgId, url, info.name);
    if (info.email) await addExternalRecipient(database, orgId, info.email.toLowerCase());
    await enqueueScan(database, scanQueue(), url, { siteId, trigger: "manual" });
    org = await findShopifyOrg(database, key);
    if (!org) throw new Error("shopify org missing after install");
  }

  await syncPlan(org, ctx.session.shop, accessToken);
  return { org: (await findShopifyOrg(database, key)) ?? org, accessToken };
}

/** Shopify is the source of truth. Webhooks also do this; doing it on load closes races. */
async function syncPlan(org: ShopifyOrg, shop: string, accessToken: string): Promise<void> {
  const sub = await fetchActiveSubscription(shop, accessToken);
  const status = sub ? toPlanStatusFromShopify(sub.status) : "canceled";
  if (!status) return;
  const hadPlan = org.plan !== "none" || org.planStatus !== null;
  // Never-paid stores stay at planStatus null rather than "canceled".
  if (!sub && !hadPlan) return;
  const plan = sub?.plan ?? null;
  const samePlan = status === "active" ? org.plan === plan : org.plan === "none";
  if (status === org.planStatus && samePlan) return;
  await applyShopifyPlan(db(), org.orgId, {
    status,
    ...(plan ? { plan } : {}),
    currentPeriodEnd: sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null,
  });
}

export interface AppState {
  shop: string;
  siteUrl: string | null;
  monitoring: boolean;
  /** "starter", "monitoring" or null when nothing is paid. */
  plan: "starter" | "monitoring" | null;
  planStatus: string | null;
  /** True once the merchant has seen a win worth a review. Shopify throttles the ask. */
  askForReview: boolean;
  scan: {
    id: string;
    status: string;
    scannedAt: string | null;
    error: string | null;
    blockedBy: string | null;
    passwordProtected: boolean;
    headline: string | null;
    counts: { critical: number; warning: number; info: number } | null;
    cmpName: string | null;
    findings: { vendor: string; title: string; severity: string }[];
    accessibility: {
      score: number;
      counts: { critical: number; serious: number; moderate: number; minor: number };
      issues: { title: string; impact: string; instances: number }[];
      total: number;
    } | null;
    reportUrl: string | null;
  } | null;
}

const ORIGIN = (process.env["APP_URL"] ?? "https://www.getconsentinel.com").replace(/\/$/, "");

export async function appState(shop: string, org: ShopifyOrg): Promise<AppState> {
  const database = db();
  const base: AppState = {
    shop,
    siteUrl: org.siteUrl,
    monitoring: org.plan !== "none" && org.planStatus === "active",
    plan:
      org.planStatus === "active" && (org.plan === "starter" || org.plan === "monitoring")
        ? org.plan
        : null,
    planStatus: org.planStatus,
    askForReview: false,
    scan: null,
  };
  if (!org.siteId) return base;

  const [scan] = await database
    .select()
    .from(scans)
    .where(eq(scans.siteId, org.siteId))
    .orderBy(desc(scans.queuedAt))
    .limit(1);
  if (!scan) return base;

  const done = await database
    .select({ critical: scans.criticalCount })
    .from(scans)
    .where(and(eq(scans.siteId, org.siteId), eq(scans.status, "complete")))
    .orderBy(asc(scans.queuedAt));
  const askForReview = reviewMoment({
    installedAt: org.createdAt,
    now: new Date(),
    paid: base.monitoring,
    firstCritical: done[0]?.critical ?? null,
    latestCritical: done[done.length - 1]?.critical ?? null,
    completeScans: done.length,
  });

  const complete = scan.status === "complete" && scan.result;
  const report = complete && scan.result ? toFullReport(scan.result) : null;
  const token = complete ? await getOrCreateShareToken(database, scan.id) : null;
  const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };

  const a11y = report?.accessibility ?? null;
  return {
    ...base,
    askForReview,
    scan: {
      id: scan.id,
      status: scan.status,
      scannedAt: scan.finishedAt?.toISOString() ?? null,
      error: scan.status === "failed" ? (scan.error ?? "The scan couldn't be completed.") : null,
      blockedBy: scan.blockedBy ?? null,
      passwordProtected: scan.status === "failed" && (await storefrontLocked(scan.url)),
      headline: report?.headline ?? null,
      counts: report
        ? {
            critical: report.counts.critical,
            warning: report.counts.warning,
            info: report.counts.info,
          }
        : null,
      cmpName: report?.cmpName ?? null,
      findings: report
        ? report.findings
            .filter((f) => !f.causedBy && f.severity !== "info")
            .sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9))
            .slice(0, 6)
            .map((f) => ({ vendor: f.vendor, title: f.title, severity: f.severity }))
        : [],
      accessibility: a11y
        ? {
            score: a11y.score,
            counts: a11y.counts,
            issues: a11y.issues
              .slice(0, 5)
              .map((i) => ({ title: i.title, impact: i.impact, instances: i.instances })),
            total: a11y.issues.length + a11y.lockedCount,
          }
        : null,
      reportUrl: token
        ? `${ORIGIN}/shopify/report/${scan.id}?t=${encodeURIComponent(token)}`
        : null,
    },
  };
}

/**
 * Shopify sends visitors of a password-protected store to /password. Checked only
 * after a failed scan, so a locked dev store gets a clear fix instead of a bot-block guess.
 */
async function storefrontLocked(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(4000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; ConsentinelBot/1.0)" },
    });
    const location = response.headers.get("location") ?? "";
    return /\/password(\b|$|\?)/.test(location) || response.url.includes("/password");
  } catch {
    return false;
  }
}
