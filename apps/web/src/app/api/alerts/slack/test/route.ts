import { NextResponse } from "next/server";
import { can, getBillingState, getSlackWebhook } from "@consentinel/db";
import { slackPayload } from "@consentinel/notify";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";

/** Re-sends a test message to the saved webhook, so a customer can check it still works. */
export async function POST(request: Request) {
  const session = await requireSession();
  if (!can(await getBillingState(db(), session.orgId), "slack")) {
    return NextResponse.json({ error: "Slack alerts are on Growth and Agency." }, { status: 402 });
  }
  const url = await getSlackWebhook(db(), session.orgId);
  if (!url) return NextResponse.json({ error: "Slack isn't connected." }, { status: 400 });
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    redirect: "error",
    body: JSON.stringify(
      slackPayload({
        text: "Test from Consentinel. Alerts for new critical findings post here.",
        link: { url: new URL("/app/alerts", request.url).toString(), label: "Alert settings" },
      }),
    ),
  }).catch(() => null);
  if (!res?.ok) {
    return NextResponse.json(
      {
        error:
          "Slack didn't accept the test. The webhook may have been removed. Reconnect with a new one.",
      },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
