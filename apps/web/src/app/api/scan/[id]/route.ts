import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  eq,
  estimateWaitSeconds,
  getScan,
  leadMatchesScan,
  orgMembers,
  orgs,
  recordShareView,
  shareTokenMatches,
  sites,
  scansAhead,
  typicalScanSeconds,
  users,
} from "@consentinel/db";
import { db } from "@/lib/server";
import { toFreeReport, toFullReport } from "@/lib/free-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  const query = new URL(request.url).searchParams;
  const token = query.get("t");
  const lead = query.get("lead");
  const scan = await getScan(db(), id);
  if (!scan) return NextResponse.json({ error: "Scan not found." }, { status: 404 });

  if (scan.status === "failed") {
    return NextResponse.json({
      status: "failed",
      url: scan.url,
      error: scan.error ?? "The scan couldn’t be completed.",
      // Present only when a WAF refused us. The UI turns this into an
      // allowlist instruction rather than a dead end.
      ...(scan.blockedBy ? { blockedBy: scan.blockedBy } : {}),
    });
  }

  if (scan.status !== "complete" || !scan.result) {
    return NextResponse.json({ status: scan.status, url: scan.url, ...(await queueInfo(scan)) });
  }

  /**
   * Redaction is for the anonymous funnel. A signed-in member of the org that
   * owns this scan has already paid for it, so gating their own report behind an
   * email capture is both pointless and insulting.
   */
  // A valid share token stands in for ownership: the org holder chose to hand
  // this report to someone, so redacting it would defeat the point.
  const shared = token !== null && (await shareTokenMatches(db(), id, token));
  // The lead id from a "your scan is ready" email unlocks it the same way.
  const emailed = !shared && lead !== null && (await leadUnlocks(lead, id));
  const owns = shared || emailed || (await callerOwnsScan(scan.siteId));
  // Count an open of a shared link, unless the viewer is signed in (that's us,
  // checking our own link). Link scanners in mail filters fetch the page HTML
  // but don't run its JavaScript, so they never reach this route.
  if (shared) {
    const { userId } = await auth();
    if (!userId) {
      try {
        await recordShareView(db(), id);
      } catch (error) {
        console.error("share view not recorded", { id, error });
      }
    }
  }
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

/** Worker slots across all scanner instances. Keep in step with Render. */
const SLOTS = Number(process.env["SCAN_WORKER_SLOTS"] ?? "2") || 2;

/** Honest queue position and ETA. Never fails the poll. */
async function queueInfo(scan: {
  status: string;
  queuedAt: Date;
}): Promise<{ position?: number; etaSeconds?: number }> {
  if (scan.status !== "queued" && scan.status !== "running") return {};
  try {
    const per = await typicalScanSeconds(db());
    if (scan.status === "running") {
      return { etaSeconds: estimateWaitSeconds("running", 0, SLOTS, per) };
    }
    const ahead = await scansAhead(db(), scan.queuedAt);
    return { position: ahead + 1, etaSeconds: estimateWaitSeconds("queued", ahead, SLOTS, per) };
  } catch (error) {
    console.error("queue info failed", { error });
    return {};
  }
}

async function leadUnlocks(leadId: string, scanId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) return false;
  return leadMatchesScan(db(), leadId, scanId);
}
