import { NextResponse } from "next/server";
import {
  getBillingState,
  getInFlightScanForSite,
  getSiteByDeployHookToken,
  isEntitled,
} from "@consentinel/db";
import { enqueueScan } from "@consentinel/queue";
import { rateLimit } from "@/lib/rate-limit";
import { db, scanQueue } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scan after deploy. Public by design: the token in the path is the credential.
 * POST only, so a link pasted into Slack cannot trigger a scan through its preview.
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

  // A deploy pipeline retrying, or several deploys in a row, should not stack scans.
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
    return NextResponse.json({ error: `Cannot scan: ${result.reason}.` }, { status: 422 });
  }
  return NextResponse.json({ status: "queued", scanId: result.scan.id }, { status: 202 });
}
