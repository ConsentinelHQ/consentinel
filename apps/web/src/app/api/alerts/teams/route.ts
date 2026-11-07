import { NextResponse } from "next/server";
import { can, getBillingState, setTeamsWebhook } from "@consentinel/db";
import { isTeamsWebhookUrl, teamsPayload } from "@consentinel/notify";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";

export async function POST(request: Request) {
  const session = await requireSession();
  if (!can(await getBillingState(db(), session.orgId), "teams")) {
    return NextResponse.json(
      { error: "Teams alerts are on the Growth and Agency plans." },
      { status: 402 },
    );
  }
  const data: unknown = await request.json().catch(() => null);
  const raw =
    typeof data === "object" && data !== null ? (data as { url?: unknown }).url : undefined;
  const url = typeof raw === "string" ? raw.trim() : "";
  if (!isTeamsWebhookUrl(url)) {
    return NextResponse.json(
      {
        error:
          "That isn't a Teams Workflows webhook URL. Copy it from the channel's Workflows menu, using the \"Send webhook alerts to a channel\" template.",
      },
      { status: 400 },
    );
  }
  // Prove it works now, not the first time a real alert needs it.
  const test = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    redirect: "error",
    body: JSON.stringify(
      teamsPayload({
        text: "Consentinel is connected. New critical findings will post here.",
        link: { url: new URL("/app/alerts", request.url).toString(), label: "Alert settings" },
      }),
    ),
  }).catch(() => null);
  if (!test?.ok) {
    return NextResponse.json(
      { error: "Teams didn't accept that webhook. Check the URL and try again." },
      { status: 400 },
    );
  }
  await setTeamsWebhook(db(), session.orgId, url);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await requireSession();
  await setTeamsWebhook(db(), session.orgId, null);
  return NextResponse.json({ ok: true });
}
