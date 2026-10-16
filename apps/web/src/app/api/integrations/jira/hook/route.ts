import { NextResponse } from "next/server";
import { rotateJiraHookToken } from "@consentinel/db";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Regenerate the inbound Jira hook URL. The old one stops working immediately. */
export async function POST(): Promise<NextResponse> {
  const session = await requireSession();
  const token = await rotateJiraHookToken(db(), session.orgId);
  if (!token) return NextResponse.json({ error: "Jira isn't connected." }, { status: 404 });
  return NextResponse.json({ token });
}
