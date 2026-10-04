import { NextResponse } from "next/server";
import { getSiteForOrg, rotateDeployHookToken } from "@consentinel/db";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Regenerate the deploy hook URL. The old one stops working immediately. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ siteId: string }> },
): Promise<NextResponse> {
  const { siteId } = await params;
  const session = await requireSession();
  const site = await getSiteForOrg(db(), siteId, session.orgId);
  if (!site) return NextResponse.json({ error: "Site not found." }, { status: 404 });

  const token = await rotateDeployHookToken(db(), site.id, session.orgId);
  if (!token) return NextResponse.json({ error: "Couldn’t regenerate." }, { status: 500 });
  return NextResponse.json({ token });
}
