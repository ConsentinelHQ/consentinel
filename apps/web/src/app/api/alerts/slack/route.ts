import { NextResponse } from "next/server";
import { can, getBillingState, setSlackWebhook } from "@consentinel/db";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";

const SLACK = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/;

export async function POST(request: Request) {
  const session = await requireSession();
  if (!can(await getBillingState(db(), session.orgId), "slack")) {
    return NextResponse.json(
      { error: "Slack alerts are on the Growth and Agency plans." },
      { status: 402 },
    );
  }
  const data: unknown = await request.json().catch(() => null);
  const url =
    typeof data === "object" && data !== null ? (data as { url?: unknown }).url : undefined;
  if (typeof url !== "string" || !SLACK.test(url.trim())) {
    return NextResponse.json(
      { error: "That isn't a Slack webhook URL. It starts with https://hooks.slack.com/services/" },
      { status: 400 },
    );
  }
  // Prove it works now, not the first time a real alert needs it.
  const test = await fetch(url.trim(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: "Consentinel is connected. New critical findings will post here.",
    }),
  }).catch(() => null);
  if (!test?.ok) {
    return NextResponse.json(
      { error: "Slack didn't accept that webhook. Check the URL and try again." },
      { status: 400 },
    );
  }
  await setSlackWebhook(db(), session.orgId, url.trim());
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await requireSession();
  await setSlackWebhook(db(), session.orgId, null);
  return NextResponse.json({ ok: true });
}
