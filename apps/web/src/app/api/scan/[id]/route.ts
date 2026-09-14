import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq, getScan, orgMembers, orgs, sites, users } from "@consentinel/db";
import { db } from "@/lib/server";
import { toFreeReport, toFullReport } from "@/lib/free-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  const scan = await getScan(db(), id);
  if (!scan) return NextResponse.json({ error: "Scan not found." }, { status: 404 });

  if (scan.status === "failed") {
    return NextResponse.json({
      status: "failed",
      url: scan.url,
      error: scan.error ?? "The scan could not be completed.",
    });
  }

  if (scan.status !== "complete" || !scan.result) {
    return NextResponse.json({ status: scan.status, url: scan.url });
  }

  /**
   * Redaction is for the anonymous funnel. A signed-in member of the org that
   * owns this scan has already paid for it, so gating their own report behind an
   * email capture is both pointless and insulting.
   */
  const owns = await callerOwnsScan(scan.siteId);
  return NextResponse.json({
    status: "complete",
    report: owns ? toFullReport(scan.result) : toFreeReport(scan.result),
  });
}

/** True when the caller is a member of the org that owns the scanned site. */
async function callerOwnsScan(siteId: string | null): Promise<boolean> {
  if (!siteId) return false; // anonymous public scan, nobody owns it
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return false;

  const database = db();
  const rows = await database
    .select({ siteId: sites.id })
    .from(sites)
    .innerJoin(orgs, eq(orgs.id, sites.orgId))
    .innerJoin(orgMembers, eq(orgMembers.orgId, orgs.id))
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(200);

  return rows.some((r) => r.siteId === siteId);
}
