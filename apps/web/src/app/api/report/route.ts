import { NextResponse } from "next/server";
import { z } from "zod";
import { getScan, leads } from "@consentinel/db";
import { db } from "@/lib/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  scanId: z.string().uuid(),
  email: z.string().email(),
  // Explicit, unticked by default. We of all products get our own consent right.
  contactConsent: z.boolean(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const limit = await rateLimit(`lead:${clientKey(request.headers)}`, 10, 3600);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const scan = await getScan(db(), parsed.data.scanId);
  if (!scan || scan.status !== "complete" || !scan.result) {
    return NextResponse.json({ error: "That scan isn't ready yet." }, { status: 404 });
  }

  await db().insert(leads).values({
    email: parsed.data.email,
    scanId: parsed.data.scanId,
    contactConsent: parsed.data.contactConsent,
  });

  // Email delivery (Resend) lands with Epic 2.3; the report unlocks in-page now.
  return NextResponse.json({ report: scan.result });
}
