import { NextResponse } from "next/server";
import { z } from "zod";
import { setOrgBranding } from "@consentinel/db";
import { cleanText, gateFeature } from "@/lib/agency";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const httpsUrl = z
  .string()
  .max(500)
  .refine(
    (v) => v.trim() === "" || /^https:\/\/[^\s"'<>]+$/i.test(v.trim()),
    "Use an https:// link.",
  );

const body = z.object({
  brandName: z.string().max(80),
  brandLogoUrl: httpsUrl,
  brandColor: z
    .string()
    .refine(
      (v) => v.trim() === "" || /^#[0-9a-f]{6}$/i.test(v.trim()),
      "Use a hex color like #1f6feb.",
    ),
  brandWebsite: httpsUrl,
});

/** Saves the agency brand. Empty fields clear, so an agency can turn it back off. */
export async function PUT(request: Request): Promise<NextResponse> {
  const session = await requireSession();
  const gate = await gateFeature(session.orgId, "whiteLabel");
  if (!gate.ok) return gate.response;

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Check the fields and try again.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const d = parsed.data;
  await setOrgBranding(db(), session.orgId, {
    brandName: cleanText(d.brandName, 80),
    brandLogoUrl: cleanText(d.brandLogoUrl, 500),
    brandColor: cleanText(d.brandColor, 7)?.toLowerCase() ?? null,
    brandWebsite: cleanText(d.brandWebsite, 500),
  });
  return NextResponse.json({ ok: true });
}
