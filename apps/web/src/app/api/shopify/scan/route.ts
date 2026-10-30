import { NextResponse } from "next/server";
import { findShopifyOrg, getInFlightScanForSite } from "@consentinel/db";
import { enqueueScan } from "@consentinel/queue";
import { rateLimit } from "@/lib/rate-limit";
import { db, scanQueue } from "@/lib/server";
import { shopOrgKey } from "@/lib/shopify";
import { authenticate } from "@/lib/shopify-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCANS_PER_HOUR = 6;

/** Manual rescan from the app. One at a time, capped per store. */
export async function POST(request: Request): Promise<NextResponse> {
  const ctx = authenticate(request);
  if (ctx instanceof NextResponse) return ctx;

  const org = await findShopifyOrg(db(), shopOrgKey(ctx.session.shop));
  if (!org?.siteId || !org.siteUrl) {
    return NextResponse.json({ error: "Reload the app to finish setup." }, { status: 409 });
  }

  const inFlight = await getInFlightScanForSite(db(), org.siteId);
  if (inFlight) return NextResponse.json({ scanId: inFlight, status: "running" });

  const limit = await rateLimit(`shopify-scan:${ctx.session.shop}`, SCANS_PER_HOUR, 3600);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "You've run a lot of scans this hour. Try again later." },
      { status: 429 },
    );
  }

  const result = await enqueueScan(db(), scanQueue(), org.siteUrl, {
    siteId: org.siteId,
    trigger: "manual",
  });
  if (result.status === "refused") {
    return NextResponse.json(
      { error: `Can't scan this store: ${result.reason}.` },
      { status: 422 },
    );
  }
  return NextResponse.json({ scanId: result.scan.id, status: "queued" });
}
