import { NextResponse } from "next/server";
import { z } from "zod";
import { inquiries } from "@consentinel/db";
import { db } from "@/lib/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  email: z.string().email(),
  name: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  topic: z.enum(["audit", "monitoring", "general"]).default("general"),
  message: z.string().min(1).max(5000),
});

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the form and try again." }, { status: 400 });
  }

  const limit = await rateLimit(`contact:${clientKey(request.headers)}`, 5, 3600);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many messages. Try again later." }, { status: 429 });
  }

  // Stored before anything else. An enquiry we cannot email is still an enquiry.
  await db()
    .insert(inquiries)
    .values({
      email: parsed.data.email,
      name: parsed.data.name ?? null,
      company: parsed.data.company ?? null,
      topic: parsed.data.topic,
      message: parsed.data.message,
    });

  return NextResponse.json({ ok: true });
}
