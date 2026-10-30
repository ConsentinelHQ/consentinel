import { NextResponse } from "next/server";
import { applyShopifyPlan, deleteShopifyOrg, findShopifyOrg } from "@consentinel/db";
import { db } from "@/lib/server";
import {
  isShopDomain,
  shopOrgKey,
  shopifyConfig,
  toPlanStatusFromShopify,
  verifyWebhookHmac,
} from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One endpoint for every topic. HMAC first, always: Shopify's review sends
 * unsigned requests and expects a 401.
 *
 * We store no customer data (we scan the storefront, not orders), so the
 * customer compliance topics only need an acknowledgement.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const config = shopifyConfig();
  if (!config) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const raw = await request.text();
  if (!verifyWebhookHmac(raw, request.headers.get("x-shopify-hmac-sha256"), config.apiSecret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const topic = request.headers.get("x-shopify-topic") ?? "";
  const shop = request.headers.get("x-shopify-shop-domain");
  if (!isShopDomain(shop)) return NextResponse.json({ ok: true });
  const key = shopOrgKey(shop);
  const database = db();

  try {
    switch (topic) {
      case "app/uninstalled": {
        const org = await findShopifyOrg(database, key);
        // Uninstalling cancels the charge on Shopify's side. Stop scans now;
        // the data goes when shop/redact arrives 48 hours later.
        if (org)
          await applyShopifyPlan(database, org.orgId, {
            status: "canceled",
            currentPeriodEnd: null,
          });
        break;
      }
      case "app_subscriptions/update": {
        const body = JSON.parse(raw) as {
          app_subscription?: { name?: string; status?: string; current_period_end?: string | null };
        };
        const sub = body.app_subscription;
        const status = sub?.status ? toPlanStatusFromShopify(sub.status) : null;
        const org = await findShopifyOrg(database, key);
        if (org && status) {
          await applyShopifyPlan(database, org.orgId, {
            status,
            currentPeriodEnd: sub?.current_period_end ? new Date(sub.current_period_end) : null,
          });
        }
        break;
      }
      case "shop/redact":
        await deleteShopifyOrg(database, key);
        break;
      case "customers/data_request":
      case "customers/redact":
        break;
      default:
        break;
    }
  } catch (error) {
    console.error("shopify webhook failed", { topic, shop, error });
    // 500 makes Shopify retry, which is what we want for a transient DB error.
    return NextResponse.json({ error: "Retry." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
