import { NextResponse } from "next/server";
import {
  getBillingState,
  getInFlightScanForSite,
  getScan,
  getSiteByDeployHookToken,
  isEntitled,
  newCriticalFindings,
} from "@consentinel/db";
import { canonicalVendor } from "@consentinel/shared";
import { enqueueScan } from "@consentinel/queue";
import { rateLimit } from "@/lib/rate-limit";
import { db, scanQueue } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scan after deploy. Public by design: the token in the path is the credential.
 * POST only, so a link pasted into Slack can’t trigger a scan through its preview.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return NextResponse.json({ error: "Unknown deploy hook." }, { status: 404 });
  }

  const site = await getSiteByDeployHookToken(db(), token);
  if (!site) return NextResponse.json({ error: "Unknown deploy hook." }, { status: 404 });

  if (!isEntitled(await getBillingState(db(), site.orgId))) {
    return NextResponse.json(
      { error: "Scan after deploy needs a monitoring plan." },
      { status: 402 },
    );
  }

  // A deploy pipeline retrying, or several deploys in a row, shouldn’t stack scans.
  const inFlight = await getInFlightScanForSite(db(), site.id);
  if (inFlight) {
    return NextResponse.json({ status: "already_running", scanId: inFlight }, { status: 202 });
  }

  // Generous for real deploys, a hard stop for a CI loop.
  const limit = await rateLimit(`deploy-hook:${site.id}`, 20, 3600);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many deploy scans for this site in the last hour." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const result = await enqueueScan(db(), scanQueue(), site.url, {
    siteId: site.id,
    trigger: "deploy",
  });
  if (result.status === "refused") {
    return NextResponse.json({ error: `Can’t scan: ${result.reason}.` }, { status: 422 });
  }
  return NextResponse.json({ status: "queued", scanId: result.scan.id }, { status: 202 });
}

/**
 * The deploy check's verdict, polled by CI after the POST. Read-only, so GET is
 * safe; the token in the path is still the credential.
 *
 * verdict: "pass" (no new critical findings), "fail" (new ones since the last
 * scans), or "baseline" (nothing comparable yet, so nothing to regress from).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return NextResponse.json({ error: "Unknown deploy hook." }, { status: 404 });
  }
  const site = await getSiteByDeployHookToken(db(), token);
  if (!site) return NextResponse.json({ error: "Unknown deploy hook." }, { status: 404 });

  const url = new URL(request.url);
  const scanId = url.searchParams.get("scan") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(scanId)) {
    return NextResponse.json(
      { error: "Add ?scan=<scanId> from the POST response." },
      { status: 400 },
    );
  }

  // Polling every few seconds for ten minutes is ~200 calls; this stops a runaway loop.
  const limit = await rateLimit(`deploy-check:${site.id}`, 600, 3600);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many status checks for this site in the last hour." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const scan = await getScan(db(), scanId);
  // Another site's scan reads as missing, never as "someone else's".
  if (!scan || scan.siteId !== site.id) {
    return NextResponse.json({ error: "Scan not found for this site." }, { status: 404 });
  }

  const reportUrl = `${url.origin}/app/scans/${scan.id}`;
  if (scan.status === "queued" || scan.status === "running") {
    return NextResponse.json({ status: scan.status, scanId: scan.id, reportUrl });
  }
  if (scan.status === "failed") {
    return NextResponse.json({
      status: "failed",
      scanId: scan.id,
      reportUrl,
      error: scan.error ?? "The scan failed.",
    });
  }

  const added = await newCriticalFindings(db(), scan);
  const findings = scan.result?.findings ?? [];
  const newCritical = (added ?? []).map((d) => {
    const match = findings.find(
      (f) => canonicalVendor(f.vendor) === canonicalVendor(d.vendor) && f.title === d.title,
    );
    return {
      vendor: d.vendor,
      title: d.title,
      fix: d.remediation,
      ...(match?.gtm?.length ? { gtm: match.gtm.map((g) => g.fix) } : {}),
    };
  });

  return NextResponse.json({
    status: "complete",
    scanId: scan.id,
    reportUrl,
    verdict: added === null ? "baseline" : newCritical.length > 0 ? "fail" : "pass",
    critical: scan.criticalCount,
    warning: scan.warningCount,
    headline: scan.headline,
    newCritical,
  });
}
