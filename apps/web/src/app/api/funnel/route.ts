import { NextResponse } from "next/server";
import { z } from "zod";
import { recordFunnel } from "@/lib/funnel";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only the events the browser is allowed to report. Checkout is counted server-side.
const body = z.object({ event: z.enum(["report_view", "cta_click", "shopify_install_click"]) });

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  // Stops one script inflating the numbers, quietly.
  const limit = await rateLimit(`funnel:${clientKey(request.headers)}`, 60, 3600);
  if (limit.allowed) await recordFunnel(parsed.data.event);
  return NextResponse.json({ ok: true });
}
