import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { getScan, leads } from "@consentinel/db";
import { db } from "@/lib/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { sendReportEmail } from "@/lib/email";

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

  // Delivery must not gate the unlock: losing the lead AND the report because an
  // email API was down is the worst outcome available.
  const delivery = await sendReportEmail(parsed.data.email, scan.result);
  if (!delivery.sent) {
    console.error("report email not sent", { scanId: parsed.data.scanId, reason: delivery.reason });
    // The lead is captured but never received what they asked for.
    Sentry.captureMessage("report email not sent", {
      level: "error",
      tags: { area: "email" },
      extra: { scanId: parsed.data.scanId, reason: delivery.reason },
    });
  }

  return NextResponse.json({ report: scan.result, emailed: delivery.sent });
}
