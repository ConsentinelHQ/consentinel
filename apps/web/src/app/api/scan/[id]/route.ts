import { NextResponse } from "next/server";
import { getScan } from "@consentinel/db";
import { db } from "@/lib/server";
import { toFreeReport } from "@/lib/free-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  const scan = await getScan(db(), id);
  if (!scan) return NextResponse.json({ error: "Scan not found." }, { status: 404 });

  if (scan.status === "failed") {
    return NextResponse.json({
      status: "failed",
      url: scan.url,
      error: scan.error ?? "The scan could not be completed.",
    });
  }

  if (scan.status !== "complete" || !scan.result) {
    return NextResponse.json({ status: scan.status, url: scan.url });
  }

  return NextResponse.json({ status: "complete", report: toFreeReport(scan.result) });
}
