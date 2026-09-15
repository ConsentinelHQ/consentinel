import { NextResponse } from "next/server";
import { getBillingState } from "@consentinel/db";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const session = await requireSession();
  const state = await getBillingState(db(), session.orgId);

  if (!state?.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account yet." }, { status: 404 });
  }

  const origin = new URL(request.url).origin;
  const portal = await stripe().billingPortal.sessions.create({
    customer: state.stripeCustomerId,
    return_url: `${origin}/app/billing`,
  });

  return NextResponse.json({ url: portal.url });
}
