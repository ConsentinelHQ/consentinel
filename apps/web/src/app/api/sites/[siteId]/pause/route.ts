import { NextResponse } from "next/server";
import { z } from "zod";
import { getBillingState, getSiteForOrg, isEntitled, setSitePaused } from "@consentinel/db";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ paused: z.boolean() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> },
): Promise<NextResponse> {
  const { siteId } = await params;
  const session = await requireSession();

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const site = await getSiteForOrg(db(), siteId, session.orgId);
  if (!site) return NextResponse.json({ error: "Site not found." }, { status: 404 });

  // Pausing never needs a plan. Resuming starts scheduled scans again, so it does.
  if (!parsed.data.paused) {
    if (!isEntitled(await getBillingState(db(), session.orgId))) {
      return NextResponse.json(
        { error: "Scheduled scans need a monitoring plan." },
        { status: 402 },
      );
    }
  }

  await setSitePaused(db(), site.id, session.orgId, parsed.data.paused);
  return NextResponse.json({ ok: true });
}
