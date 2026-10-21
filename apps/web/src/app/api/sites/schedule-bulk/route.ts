import { NextResponse } from "next/server";
import { z } from "zod";
import { getBillingState, isEntitled } from "@consentinel/db";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";
import { fillSchedules } from "@/lib/site-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  siteIds: z.array(z.string().uuid()).min(1).max(200),
  schedule: z.enum(["daily", "weekly"]),
});

/**
 * Turns on monitoring for a batch, up to the plan's free slots. Called when a
 * customer comes back from checkout, so 402 means "webhook not landed yet".
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await requireSession();
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const database = db();
  const billing = await getBillingState(database, session.orgId);
  if (!isEntitled(billing)) {
    return NextResponse.json({ error: "No active plan yet." }, { status: 402 });
  }

  const { scheduled, overflow } = await fillSchedules(
    database,
    session.orgId,
    billing,
    parsed.data.siteIds,
    parsed.data.schedule,
  );
  return NextResponse.json({ scheduled: scheduled.length, overLimit: overflow.length });
}
