import { NextResponse } from "next/server";
import { setAlertsEnabled } from "@consentinel/db";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";

export async function POST(request: Request) {
  const session = await requireSession();
  const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be true or false" }, { status: 400 });
  }
  await setAlertsEnabled(db(), session.orgId, session.userId, body.enabled);
  return NextResponse.json({ ok: true });
}
