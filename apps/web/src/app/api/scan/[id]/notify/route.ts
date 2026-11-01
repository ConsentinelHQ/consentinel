import { NextResponse } from "next/server";
import { z } from "zod";
import { getScan, leads } from "@consentinel/db";
import { db } from "@/lib/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  email: z.string().email().max(320),
  // Unticked by default, same as the report gate.
  contactConsent: z.boolean(),
});

/**
 * "Email me the results" while a scan waits. Stores a lead tied to the scan;
 * the worker emails a one-click link when it finishes.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const limit = await rateLimit(`lead:${clientKey(request.headers)}`, 10, 3600);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const scan = await getScan(db(), id);
  if (!scan) return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  // Finished while they typed. The page will show it, nothing to wait for.
  if (scan.status !== "queued" && scan.status !== "running") {
    return NextResponse.json({ status: scan.status });
  }

  await db().insert(leads).values({
    email: parsed.data.email,
    scanId: id,
    contactConsent: parsed.data.contactConsent,
  });
  return NextResponse.json({ ok: true });
}
