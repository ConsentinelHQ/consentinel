import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueScan } from "@consentinel/queue";
import { db, scanQueue } from "@/lib/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ url: z.string().min(1).max(2048) });

const SCANS_PER_HOUR = 5;
const CACHE_MAX_AGE_MS = 15 * 60 * 1000;

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a website address to scan." }, { status: 400 });
  }

  const limit = await rateLimit(`scan:${clientKey(request.headers)}`, SCANS_PER_HOUR, 3600);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `You've used your ${SCANS_PER_HOUR} free scans for this hour. Try again later, or create an account to scan more.`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const result = await enqueueScan(db(), scanQueue(), normalize(parsed.data.url), {
    trigger: "public",
    cacheMaxAgeMs: CACHE_MAX_AGE_MS,
    // Local fixtures only. Must be unset in production - it disables the SSRF guard.
    allowPrivate: process.env["ALLOW_PRIVATE_SCAN_TARGETS"] === "true",
  });

  if (result.status === "refused") {
    return NextResponse.json(
      { error: `That address can't be scanned: ${result.reason}.` },
      { status: 422 },
    );
  }

  return NextResponse.json(
    { scanId: result.scan.id, cached: result.status === "cached" },
    { status: 202 },
  );
}

/** People type "acme.com", not "https://acme.com". Accept what they actually type. */
function normalize(input: string): string {
  const trimmed = input.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
