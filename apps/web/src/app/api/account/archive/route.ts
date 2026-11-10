import { NextResponse } from "next/server";
import { getBillingState, setOrgArchived } from "@consentinel/db";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";
import { stripe } from "@/lib/stripe";

const canManage = (role: string): boolean => role === "owner" || role === "org:admin";

/**
 * Archive or restore the current organization.
 *
 * Archive: scheduled scans, alerts and integrations stop (entitlement checks fail
 * for archived orgs) and the subscription cancels at the end of the period, so
 * nobody is billed for a paused account. Sites and history are kept.
 * Restore: undoes both, as long as the subscription hasn't ended yet.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await requireSession();
  if (!canManage(session.role)) {
    return NextResponse.json(
      { error: "Only an owner or admin can archive the account." },
      { status: 403 },
    );
  }
  const data = (await request.json().catch(() => ({}))) as { action?: unknown };
  const archive = data.action === "archive";
  if (!archive && data.action !== "restore") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const billing = await getBillingState(db(), session.orgId);
  if (billing?.stripeSubscriptionId) {
    try {
      await stripe().subscriptions.update(billing.stripeSubscriptionId, {
        cancel_at_period_end: archive,
      });
    } catch (error) {
      // A subscription that already ended can't be resumed. Restore still unpauses;
      // the billing page will offer a new plan.
      if (archive) {
        console.error("archive: stripe update failed", { orgId: session.orgId, error });
        return NextResponse.json(
          { error: "Couldn't update billing. Nothing was changed. Try again." },
          { status: 502 },
        );
      }
    }
  }

  await setOrgArchived(db(), session.orgId, archive);
  return NextResponse.json({ ok: true, archived: archive });
}
