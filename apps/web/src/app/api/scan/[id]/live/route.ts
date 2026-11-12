import { NextResponse } from "next/server";
import { getScan } from "@consentinel/db";
import { markWatched, readLive } from "@consentinel/queue";
import { db, redis } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Live scan view. Each poll marks the scan as watched, which is what tells the
 * worker to take screenshots. Only while the scan runs: afterwards the report
 * is the record, and the frames expire on their own.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  const scan = await getScan(db(), id);
  if (!scan) return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  if (scan.status !== "queued" && scan.status !== "running") {
    return NextResponse.json({ status: scan.status, live: null });
  }
  try {
    await markWatched(redis(), id);
    const live = await readLive(redis(), id);
    return NextResponse.json(
      { status: scan.status, live },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ status: scan.status, live: null });
  }
}
