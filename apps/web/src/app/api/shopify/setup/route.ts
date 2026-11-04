import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { findShopifyOrg } from "@consentinel/db";
import { db } from "@/lib/server";
import { errorDetail, exchangeToken, shopOrgKey } from "@/lib/shopify";
import { appState, authenticate } from "@/lib/shopify-server";
import {
  auditTheme,
  fetchPrivacySetup,
  privacySettingsUrl,
  themeEditorUrl,
} from "@/lib/shopify-store-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Store setup card: Shopify's own privacy settings plus where each ad tag sits in
 * the live theme, matched against what the latest scan caught leaking. Each half
 * fails on its own, so a missing scope or a slow theme never blanks the other.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const ctx = authenticate(request);
  if (ctx instanceof NextResponse) return ctx;
  const shop = ctx.session.shop;
  try {
    const accessToken = await exchangeToken(ctx.session, ctx.config);
    const org = await findShopifyOrg(db(), shopOrgKey(shop));
    const leaking = new Set(
      org ? ((await appState(shop, org)).scan?.findings.map((f) => f.vendor) ?? []) : [],
    );

    const [privacy, theme] = await Promise.allSettled([
      fetchPrivacySetup(shop, accessToken),
      auditTheme(shop, accessToken),
    ]);
    for (const r of [privacy, theme]) {
      if (r.status === "rejected") {
        Sentry.captureException(r.reason, {
          tags: { area: "shopify", op: "setup" },
          extra: { shop },
        });
      }
    }

    const audit = theme.status === "fulfilled" ? theme.value : null;
    return NextResponse.json({
      privacy: privacy.status === "fulfilled" ? privacy.value : null,
      privacyUrl: privacySettingsUrl(shop),
      theme: audit
        ? {
            name: audit.themeName,
            filesChecked: audit.filesChecked,
            tags: audit.tags.map((t) => ({
              ...t,
              leaking: leaking.has(t.vendor),
              editorUrl: themeEditorUrl(shop, audit.themeId, t.filename),
            })),
          }
        : null,
    });
  } catch (error) {
    console.error("shopify setup failed", { shop, error });
    Sentry.captureException(error, { tags: { area: "shopify", op: "setup" }, extra: { shop } });
    return NextResponse.json(
      { error: "We couldn't read your store settings.", detail: errorDetail(error) },
      { status: 502 },
    );
  }
}
