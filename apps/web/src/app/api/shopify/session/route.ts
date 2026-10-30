import { NextResponse } from "next/server";
import { appState, authenticate, ensureInstalled } from "@/lib/shopify-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** App home data. The first call also installs: org, site, alert email, first scan. */
export async function GET(request: Request): Promise<NextResponse> {
  const ctx = authenticate(request);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const { org } = await ensureInstalled(ctx);
    return NextResponse.json(await appState(ctx.session.shop, org));
  } catch (error) {
    console.error("shopify session failed", { shop: ctx.session.shop, error });
    return NextResponse.json(
      { error: "We couldn't load your store. Try again in a minute." },
      { status: 502 },
    );
  }
}
