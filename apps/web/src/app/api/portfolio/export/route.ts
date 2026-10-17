import { listPortfolio } from "@consentinel/db";
import { NextResponse } from "next/server";
import { gateFeature } from "@/lib/agency";
import { requireSession } from "@/lib/auth";
import { displayHost } from "@/lib/format";
import { db } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Spreadsheet apps run cells starting with these as formulas. A client name
// like "=HYPERLINK(...)" must land as text.
function cell(value: string | number | null): string {
  if (value === null) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The portfolio as CSV, for the agency's own client reporting. */
export async function GET(request: Request): Promise<Response> {
  const session = await requireSession();
  const gate = await gateFeature(session.orgId, "workspaces");
  if (!gate.ok) return gate.response;

  const client = new URL(request.url).searchParams.get("client");
  const rows = (await listPortfolio(db(), session.orgId)).filter(
    (r) => client === null || r.client === client,
  );

  const header = [
    "Site",
    "Client",
    "Status",
    "Critical",
    "Warnings",
    "Change since previous scan",
    "Consent platform",
    "Last scan (UTC)",
    "Schedule",
  ];
  const lines = rows.map((r) => {
    const change =
      r.critical !== null && r.previousCritical !== null ? r.critical - r.previousCritical : null;
    return [
      displayHost(r.url),
      r.client,
      r.lastBlockedBy ? `blocked by ${r.lastBlockedBy}` : (r.lastStatus ?? "never scanned"),
      r.critical,
      r.warning,
      change,
      r.cmpName,
      r.lastFinishedAt?.toISOString() ?? null,
      r.schedule,
    ]
      .map(cell)
      .join(",");
  });

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse([header.join(","), ...lines].join("\n") + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="portfolio-${date}.csv"`,
      "cache-control": "no-store",
    },
  });
}
