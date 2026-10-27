import { NextResponse } from "next/server";
import { z } from "zod";
import {
  completeScan,
  createScan,
  getOrCreateShareToken,
  getScan,
  markScanRunning,
} from "@consentinel/db";
import type { ScanResult } from "@consentinel/shared";
import { enqueueScan } from "@consentinel/queue";
import { internalAuthorized as authorized } from "@/lib/internal-auth";
import { rateLimit } from "@/lib/rate-limit";
import { db, scanQueue } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Outreach only: scan a prospect's site and hand back a share link to the full
 * report. Authenticated by OUTREACH_API_KEY; with the key unset the route 404s.
 * Scans are site-less, so nothing lands in any org, dashboard or plan count.
 */

const notFound = (): NextResponse => NextResponse.json({ error: "Not found." }, { status: 404 });

const body = z.object({ url: z.string().min(1).max(2048) });

export async function POST(request: Request): Promise<NextResponse> {
  if (!authorized(request)) return notFound();
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "url is required." }, { status: 400 });

  // A leaked key should cost a few scans, not a bill.
  const limit = await rateLimit("prospect-report", 30, 3600);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many prospect scans this hour." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const raw = parsed.data.url.trim();
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const result = await enqueueScan(db(), scanQueue(), url, { trigger: "manual" });
  if (result.status === "refused") {
    return NextResponse.json({ error: `Can't scan: ${result.reason}.` }, { status: 422 });
  }
  return NextResponse.json({ scanId: result.scan.id }, { status: 202 });
}

/** A scan the outreach machine already ran. Shape-checked, not re-derived. */
const upload = z.object({
  url: z.string().min(1).max(2048),
  result: z
    .object({
      url: z.string(),
      scannedAt: z.string(),
      engineVersion: z.string(),
      signatureLibraryVersion: z.string(),
      cmpRegistryVersion: z.string(),
      headline: z.string(),
      findings: z.array(
        z.object({ id: z.string(), severity: z.string(), vendor: z.string() }).passthrough(),
      ),
      cmp: z
        .object({ consentMode: z.object({ present: z.boolean() }).passthrough() })
        .passthrough(),
      counts: z.object({}).passthrough(),
      correctlyGated: z.array(z.unknown()),
    })
    .passthrough(),
});

/**
 * Outreach only: store a scan the outreach machine ran itself and return a share
 * link. Sites behind Cloudflare often block our hosted scanner but not that
 * machine, and the link then shows exactly the evidence the email cites.
 */
export async function PUT(request: Request): Promise<NextResponse> {
  if (!authorized(request)) return notFound();
  const parsed = upload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "url and a scan result are required." }, { status: 400 });
  }
  const limit = await rateLimit("prospect-upload", 120, 3600);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many report uploads this hour." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }
  const raw = parsed.data.url.trim();
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const scan = await createScan(db(), { url, trigger: "manual" });
  await markScanRunning(db(), scan.id);
  // The row's id is the scan's id: the sealed record must say so.
  const result = { ...(parsed.data.result as unknown as ScanResult), scanId: scan.id };
  await completeScan(db(), scan.id, result);
  const token = await getOrCreateShareToken(db(), scan.id);
  if (!token) return NextResponse.json({ error: "Couldn't create a link." }, { status: 500 });
  const base = (process.env["APP_URL"] ?? "https://www.getconsentinel.com").replace(/\/$/, "");
  const stored = await getScan(db(), scan.id);
  return NextResponse.json({
    scanId: scan.id,
    reportUrl: `${base}/report/${scan.id}?t=${token}`,
    critical: stored?.criticalCount ?? null,
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<NextResponse> {
  if (!authorized(request)) return notFound();
  const scanId = new URL(request.url).searchParams.get("scanId") ?? "";
  if (!UUID.test(scanId))
    return NextResponse.json({ error: "scanId is required." }, { status: 400 });

  const scan = await getScan(db(), scanId);
  if (!scan) return notFound();
  if (scan.status === "failed") {
    return NextResponse.json({
      status: "failed",
      error: scan.error ?? "The scan couldn't be completed.",
      ...(scan.blockedBy ? { blockedBy: scan.blockedBy } : {}),
    });
  }
  if (scan.status !== "complete") return NextResponse.json({ status: scan.status });

  const token = await getOrCreateShareToken(db(), scanId);
  if (!token) return NextResponse.json({ error: "Couldn't create a link." }, { status: 500 });
  const base = (process.env["APP_URL"] ?? "https://www.getconsentinel.com").replace(/\/$/, "");
  return NextResponse.json({
    status: "complete",
    reportUrl: `${base}/report/${scanId}?t=${token}`,
    critical: scan.criticalCount,
  });
}
