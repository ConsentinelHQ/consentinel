import { NextResponse } from "next/server";
import { getScan } from "@consentinel/db";
import { assertScannableUrl } from "@consentinel/queue";
import { db } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_HOPS = 3;

/**
 * Is the scanned site a Shopify store? Drives the "Install on Shopify" CTA.
 * Dark until SHOPIFY_LISTING_URL is set, so it ships before the app is approved.
 * Only checks the URL of an existing scan, never one from the caller, and every
 * redirect hop passes the same SSRF guard the scanner uses.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const listing = process.env["SHOPIFY_LISTING_URL"];
  const { id } = await context.params;
  if (!listing || !UUID.test(id)) return NextResponse.json({ shopify: false });

  const scan = await getScan(db(), id);
  if (!scan || scan.status !== "complete") return NextResponse.json({ shopify: false });

  const shopify = await isShopifyStore(scan.url);
  return NextResponse.json(shopify ? { shopify, installUrl: listing } : { shopify }, {
    headers: { "cache-control": "private, max-age=3600" },
  });
}

async function isShopifyStore(start: string): Promise<boolean> {
  let url = start;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const check = await assertScannableUrl(url);
    if (!check.ok) return false;
    let response: Response;
    try {
      response = await fetch(check.url, {
        redirect: "manual",
        signal: AbortSignal.timeout(4000),
        headers: { "user-agent": "Mozilla/5.0 (compatible; ConsentinelBot/1.0)" },
      });
    } catch {
      return false;
    }
    // Shopify sets these on every storefront response, redirects included.
    const h = response.headers;
    if (h.get("x-shopid") || /shopify/i.test(h.get("powered-by") ?? "")) return true;
    const location = h.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      url = new URL(location, check.url).toString();
      continue;
    }
    if (!response.ok) return false;
    const html = (await response.text()).slice(0, 200_000);
    return /cdn\.shopify\.com|Shopify\.theme|myshopify\.com/i.test(html);
  }
  return false;
}
