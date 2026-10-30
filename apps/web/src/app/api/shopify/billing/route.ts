import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import {
  adminAppUrl,
  errorDetail,
  createSubscription,
  exchangeToken,
  fetchShopInfo,
} from "@/lib/shopify";
import { authenticate } from "@/lib/shopify-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Matches the "7 days free" line on the app page. */
const TRIAL_DAYS = 7;

/**
 * Starts the Monitor charge. Returns Shopify's approval URL; the page opens it at
 * the top level. Approval sends the merchant back into the app, where the next
 * session load (and the webhook) turns on daily scans.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const ctx = authenticate(request);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const accessToken = await exchangeToken(ctx.session, ctx.config);
    // Development stores can't be charged; Shopify needs test charges there.
    const info = await fetchShopInfo(ctx.session.shop, accessToken);
    const confirmationUrl = await createSubscription(ctx.session.shop, accessToken, {
      returnUrl: adminAppUrl(ctx.session.shop, ctx.config.appHandle),
      test: info.devStore || process.env["SHOPIFY_BILLING_TEST"] === "true",
      trialDays: TRIAL_DAYS,
    });
    return NextResponse.json({ confirmationUrl });
  } catch (error) {
    console.error("shopify billing failed", { shop: ctx.session.shop, error });
    Sentry.captureException(error, {
      tags: { area: "shopify", op: "billing" },
      extra: { shop: ctx.session.shop },
    });
    return NextResponse.json(
      { error: "Shopify didn't accept the charge.", detail: errorDetail(error) },
      { status: 502 },
    );
  }
}
