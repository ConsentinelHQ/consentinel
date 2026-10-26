import { NextResponse } from "next/server";
import { listReportViews } from "@consentinel/db";
import { internalAuthorized as authorized } from "@/lib/internal-auth";
import { db } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Outreach only: share links opened since `since`. Same key as the other internal routes. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!authorized(request)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const raw = new URL(request.url).searchParams.get("since") ?? "";
  const since = new Date(raw);
  if (Number.isNaN(since.getTime())) {
    return NextResponse.json({ error: "since must be an ISO date." }, { status: 400 });
  }
  return NextResponse.json({ views: await listReportViews(db(), since) });
}
