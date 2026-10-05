import { NextResponse } from "next/server";
import { z } from "zod";
import {
  countMonitoredSites,
  getBillingState,
  getSiteForOrg,
  isEntitled,
  siteLimit,
  setSiteSchedule,
} from "@consentinel/db";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ schedule: z.enum(["off", "daily", "weekly", "monthly"]) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> },
): Promise<NextResponse> {
  const { siteId } = await params;
  const session = await requireSession();

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Unknown schedule." }, { status: 400 });
  }

  const site = await getSiteForOrg(db(), siteId, session.orgId);
  if (!site) return NextResponse.json({ error: "Site not found." }, { status: 404 });

  // Turning a schedule off never needs a plan. Turning one on does.
  if (parsed.data.schedule !== "off") {
    const billing = await getBillingState(db(), session.orgId);
    if (!isEntitled(billing)) {
      return NextResponse.json(
        { error: "Scheduled scans need a monitoring plan." },
        { status: 402 },
      );
    }
    // $99 is per monitored site. Changing the cadence of an already-monitored
    // site is free; adding a new one needs a free slot.
    if (site.schedule === "off" && billing) {
      const used = await countMonitoredSites(db(), session.orgId);
      if (used >= siteLimit(billing)) {
        const q = siteLimit(billing);
        return NextResponse.json(
          {
            error: `Your plan covers ${String(q)} monitored site${q === 1 ? "" : "s"}. Add sites to your plan in Billing, or switch another site to manual.`,
          },
          { status: 402 },
        );
      }
    }
  }

  await setSiteSchedule(db(), site.id, session.orgId, parsed.data.schedule);
  return NextResponse.json({ ok: true });
}
