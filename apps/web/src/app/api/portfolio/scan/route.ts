import { NextResponse } from "next/server";
import { z } from "zod";
import { getInFlightScanForSite, listLiveSiteIds } from "@consentinel/db";
import { enqueueScan } from "@consentinel/queue";
import { gateFeature, mapLimit } from "@/lib/agency";
import { requireSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { db, scanQueue } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_SITES = 100;

const body = z.object({ client: z.string().max(120).optional() });

/** Rescans every live site, or one client's. Sites already scanning are skipped. */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await requireSession();
  const gate = await gateFeature(session.orgId, "workspaces");
  if (!gate.ok) return gate.response;

  const parsed = body.safeParse(await request.json().catch(() => ({})));
  const client = parsed.success ? parsed.data.client : undefined;

  // A browser run per site: one bulk rescan per scope every 10 minutes is plenty.
  const limit = await rateLimit(`portfolio-scan:${session.orgId}:${client ?? "*"}`, 1, 600);
  if (!limit.allowed) {
    const mins = Math.ceil(limit.retryAfterSeconds / 60);
    return NextResponse.json(
      { error: `A rescan is already underway. Try again in ${String(mins)} min.` },
      { status: 429 },
    );
  }

  const database = db();
  const queue = scanQueue();
  const targets = (await listLiveSiteIds(database, session.orgId, client)).slice(0, MAX_SITES);

  const outcomes = await mapLimit(targets, 6, async (site) => {
    if (await getInFlightScanForSite(database, site.id)) return "running" as const;
    const r = await enqueueScan(database, queue, site.url, { siteId: site.id, trigger: "manual" });
    return r.status === "refused" ? ("refused" as const) : ("queued" as const);
  });

  return NextResponse.json({
    queued: outcomes.filter((o) => o === "queued").length,
    alreadyRunning: outcomes.filter((o) => o === "running").length,
    refused: outcomes.filter((o) => o === "refused").length,
  });
}
