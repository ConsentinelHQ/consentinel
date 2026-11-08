import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { deleteOrg, deleteUserRow, listUserOrgs } from "@consentinel/db";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";
import { stripe } from "@/lib/stripe";

/**
 * Permanently deletes the signed-in user.
 *
 * Orgs where they're the only member go with them: subscription canceled now (no
 * further charges), then the org row, which cascades to sites, scans, findings,
 * alerts and integrations. Orgs with other members keep everything; the user is
 * just removed. Billing goes first so a failure later can't leave someone paying
 * for an account that's half gone.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await requireSession();
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const data = (await request.json().catch(() => ({}))) as { confirm?: unknown };
  if (data.confirm !== "DELETE") {
    return NextResponse.json({ error: "Type DELETE to confirm." }, { status: 400 });
  }

  const owned = (await listUserOrgs(db(), session.userId)).filter((o) => o.memberCount <= 1);

  for (const org of owned) {
    if (!org.stripeSubscriptionId) continue;
    try {
      await stripe().subscriptions.cancel(org.stripeSubscriptionId);
    } catch (error) {
      const code = (error as { code?: string }).code;
      // Already canceled or gone is fine. Anything else stops the delete.
      if (code !== "resource_missing") {
        console.error("delete: stripe cancel failed", { orgId: org.orgId, error });
        return NextResponse.json(
          { error: "Couldn't cancel the subscription, so nothing was deleted. Try again." },
          { status: 502 },
        );
      }
    }
  }

  const clerk = await clerkClient();
  for (const org of owned) {
    await deleteOrg(db(), org.orgId);
    // Personal orgs and Shopify installs aren't Clerk organizations.
    if (org.clerkOrgId.startsWith("org_")) {
      await clerk.organizations.deleteOrganization(org.clerkOrgId).catch((error: unknown) => {
        console.error("delete: clerk org not removed", { clerkOrgId: org.clerkOrgId, error });
      });
    }
  }
  await deleteUserRow(db(), session.userId);

  try {
    await clerk.users.deleteUser(clerkUserId);
  } catch (error) {
    console.error("delete: clerk user not removed", { error });
    return NextResponse.json(
      { error: "Your data was deleted but the sign-in couldn't be removed. Contact us." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
