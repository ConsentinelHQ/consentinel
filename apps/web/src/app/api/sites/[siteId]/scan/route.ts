import { NextResponse } from "next/server";
import { getInFlightScanForSite, getSiteForOrg } from "@consentinel/db";
import { enqueueScan } from "@consentinel/queue";
import { requireSession } from "@/lib/auth";
import { db, scanQueue } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ siteId: string }> },
): Promise<NextResponse> {
  const { siteId } = await params;
  const session = await requireSession();

  // Org-scoped read: a guessed UUID from another org returns nothing.
  const site = await getSiteForOrg(db(), siteId, session.orgId);
  if (!site) return NextResponse.json({ error: "Site not found." }, { status: 404 });
  if (site.archivedAt !== null) {
    return NextResponse.json({ error: "Restore this site to scan it." }, { status: 409 });
  }

  // One scan at a time per site. A double click shouldn’t burn two browser runs.
  const inFlight = await getInFlightScanForSite(db(), site.id);
  if (inFlight) {
    return NextResponse.json(
      { error: "A scan is already running for this site.", scanId: inFlight },
      { status: 409 },
    );
  }

  const result = await enqueueScan(db(), scanQueue(), site.url, {
    siteId: site.id,
    trigger: "manual",
  });
  return NextResponse.json(result);
}
