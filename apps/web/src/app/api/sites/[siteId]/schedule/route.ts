import { NextResponse } from "next/server";
import { z } from "zod";
import { getSiteForOrg, setSiteSchedule } from "@consentinel/db";
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

  await setSiteSchedule(db(), site.id, session.orgId, parsed.data.schedule);
  return NextResponse.json({ ok: true });
}
