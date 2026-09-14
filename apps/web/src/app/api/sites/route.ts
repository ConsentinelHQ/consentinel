import { NextResponse } from "next/server";
import { z } from "zod";
import { addSite } from "@consentinel/db";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";
import { assertScannableUrl } from "@consentinel/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  url: z.string().url(),
  label: z.string().max(200).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const session = await requireSession();

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That does not look like a URL." }, { status: 400 });
  }

  // Same SSRF guard the public scanner uses. An authenticated user is still not
  // allowed to point the worker at internal infrastructure.
  const check = await assertScannableUrl(parsed.data.url);
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 400 });
  }

  const siteId = await addSite(db(), session.orgId, check.url, parsed.data.label);
  return NextResponse.json({ siteId });
}
