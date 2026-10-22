import { NextResponse } from "next/server";
import { desc, eq, gt, inquiries, leads, scans, users } from "@consentinel/db";
import { canonicalVendor, type ScanResult } from "@consentinel/shared";
import { internalAuthorized } from "@/lib/internal-auth";
import { db } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Outreach only: new contact-form inquiries, and free-scan leads who ticked the
 * contact box. Leads without consent are counted, never listed. Leads who
 * already have an account are left out.
 */

const MAX_DAYS = 30;

/** Critical vendors, most findings first. */
function criticalVendors(result: ScanResult | null): string[] {
  if (!result) return [];
  const counts = new Map<string, number>();
  for (const f of result.findings) {
    if (f.severity !== "critical") continue;
    const v = canonicalVendor(f.vendor);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!internalAuthorized(request))
    return NextResponse.json({ error: "Not found." }, { status: 404 });

  const floor = Date.now() - MAX_DAYS * 86_400_000;
  const asked = Date.parse(new URL(request.url).searchParams.get("since") ?? "");
  const since = new Date(Number.isFinite(asked) ? Math.max(asked, floor) : floor);
  const database = db();

  const leadRows = await database
    .select({
      email: leads.email,
      consent: leads.contactConsent,
      createdAt: leads.createdAt,
      scanUrl: scans.url,
      critical: scans.criticalCount,
      result: scans.result,
    })
    .from(leads)
    .leftJoin(scans, eq(scans.id, leads.scanId))
    .where(gt(leads.createdAt, since))
    .orderBy(desc(leads.createdAt))
    .limit(500);

  const accountEmails = new Set(
    (await database.select({ email: users.email }).from(users)).map((u) => u.email.toLowerCase()),
  );

  const seen = new Set<string>();
  const consented = [];
  let withoutConsent = 0;
  for (const l of leadRows) {
    const email = l.email.trim().toLowerCase();
    if (!l.consent) {
      withoutConsent++;
      continue;
    }
    if (accountEmails.has(email) || seen.has(email)) continue;
    seen.add(email);
    consented.push({
      email,
      createdAt: l.createdAt.toISOString(),
      url: l.scanUrl,
      critical: l.critical ?? 0,
      vendors: criticalVendors(l.result).slice(0, 8),
    });
  }

  const inquiryRows = await database
    .select()
    .from(inquiries)
    .where(gt(inquiries.createdAt, since))
    .orderBy(desc(inquiries.createdAt))
    .limit(100);

  return NextResponse.json({
    since: since.toISOString(),
    leads: consented,
    leadsWithoutConsent: withoutConsent,
    inquiries: inquiryRows.map((i) => ({
      email: i.email,
      name: i.name,
      company: i.company,
      topic: i.topic,
      message: i.message.slice(0, 1500),
      createdAt: i.createdAt.toISOString(),
    })),
  });
}
