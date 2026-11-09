import { NextResponse } from "next/server";
import { and, desc, gt, inArray, scans, sites, sql } from "@consentinel/db";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";
import { displayHost } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scans in the current org that finished after `since`, plus how many are still
 * running. Polled by the desktop notifier while the app is open.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const session = await requireSession();
  // Taken before the queries, so a scan finishing mid-request shows up next poll.
  const now = new Date();
  const raw = new URL(request.url).searchParams.get("since") ?? "";
  const asked = Date.parse(raw);
  // Never look back more than an hour: a stale tab shouldn't replay old scans.
  const floor = Date.now() - 3_600_000;
  const since = new Date(Number.isFinite(asked) ? Math.max(asked, floor) : Date.now());

  const orgSites = sql`(select ${sites.id} from ${sites} where ${sites.orgId} = ${session.orgId})`;
  const [finished, [active]] = await Promise.all([
    db()
      .select({
        id: scans.id,
        url: scans.url,
        status: scans.status,
        critical: scans.criticalCount,
        warning: scans.warningCount,
        error: scans.error,
        finishedAt: scans.finishedAt,
      })
      .from(scans)
      .where(
        and(
          sql`${scans.siteId} in ${orgSites}`,
          inArray(scans.status, ["complete", "failed"]),
          gt(scans.finishedAt, since),
        ),
      )
      .orderBy(desc(scans.finishedAt))
      .limit(10),
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(scans)
      .where(
        and(sql`${scans.siteId} in ${orgSites}`, inArray(scans.status, ["queued", "running"])),
      ),
  ]);

  return NextResponse.json({
    now: now.toISOString(),
    active: active?.n ?? 0,
    finished: finished.map((s) => ({
      id: s.id,
      host: displayHost(s.url),
      status: s.status,
      critical: s.critical,
      warning: s.warning,
      error: s.status === "failed" ? (s.error ?? "The scan failed.").slice(0, 140) : null,
      finishedAt: s.finishedAt?.toISOString() ?? null,
    })),
  });
}
