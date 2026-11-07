import { NextResponse } from "next/server";
import { can, getBillingState, getTeamsWebhook } from "@consentinel/db";
import { teamsPayload } from "@consentinel/notify";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";

/** Re-sends a test message to the saved webhook, so a customer can check it still works. */
export async function POST(request: Request) {
  const session = await requireSession();
  if (!can(await getBillingState(db(), session.orgId), "teams")) {
    return NextResponse.json({ error: "Teams alerts are on Growth and Agency." }, { status: 402 });
  }
  const url = await getTeamsWebhook(db(), session.orgId);
  if (!url) return NextResponse.json({ error: "Teams isn't connected." }, { status: 400 });
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    redirect: "error",
    body: JSON.stringify(
      teamsPayload({
        text: "Test from Consentinel. Alerts for new critical findings post here.",
        link: { url: new URL("/app/alerts", request.url).toString(), label: "Alert settings" },
      }),
    ),
  }).catch(() => null);
  if (!res?.ok) {
    return NextResponse.json(
      {
        error:
          "Teams didn't accept the test. The workflow may have been deleted or turned off. Reconnect with a new one.",
      },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
