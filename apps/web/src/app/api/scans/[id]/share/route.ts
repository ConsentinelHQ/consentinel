import { NextResponse } from "next/server";
import {
  eq,
  getOrCreateShareToken,
  getScan,
  orgMembers,
  orgs,
  revokeShareToken,
  sites,
  users,
} from "@consentinel/db";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Only a member of the org owning the scanned site may share or revoke. */
async function callerOwnsScan(siteId: string | null, userId: string): Promise<boolean> {
  if (!siteId) return false; // anonymous public scan, nobody owns it
  const rows = await db()
    .select({ siteId: sites.id })
    .from(sites)
    .innerJoin(orgs, eq(orgs.id, sites.orgId))
    .innerJoin(orgMembers, eq(orgMembers.orgId, orgs.id))
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(eq(users.id, userId))
    .limit(200);
  return rows.some((r) => r.siteId === siteId);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const session = await requireSession();

  const scan = await getScan(db(), id);
  if (!scan) return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  if (!(await callerOwnsScan(scan.siteId, session.userId))) {
    // 404 rather than 403: do not confirm the scan exists to a stranger.
    return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  }
  if (scan.status !== "complete") {
    return NextResponse.json({ error: "That scan isn't finished yet." }, { status: 409 });
  }

  const token = await getOrCreateShareToken(db(), id);
  if (!token) return NextResponse.json({ error: "Could not create a link." }, { status: 500 });

  const origin = new URL(request.url).origin;
  return NextResponse.json({ url: `${origin}/report/${id}?t=${token}` });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const session = await requireSession();

  const scan = await getScan(db(), id);
  if (!scan) return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  if (!(await callerOwnsScan(scan.siteId, session.userId))) {
    return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  }

  await revokeShareToken(db(), id);
  return NextResponse.json({ ok: true });
}
