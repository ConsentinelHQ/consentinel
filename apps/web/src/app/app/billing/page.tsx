import type { Metadata } from "next";
import { activePlan, countOrgSites, getBillingState, isEntitled, siteLimit } from "@consentinel/db";
import { BillingActions } from "@/components/billing-actions";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("en-GB", { dateStyle: "long" });

export default async function Billing({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { checkout } = await searchParams;
  const session = await requireSession();
  const database = db();

  const state = await getBillingState(database, session.orgId);
  const siteCount = await countOrgSites(database, session.orgId);
  const active = isEntitled(state);
  const plan = activePlan(state);
  const limit = siteLimit(state);
  // Comped orgs have a plan but no Stripe customer, so there's no portal to open.
  const comped = active && !state?.stripeCustomerId;

  // Webhooks land in a second or two, so a fresh return can still read as unpaid.
  const pending = checkout === "success" && !active;

  return (
    <div className="wrap app-content">
      <div className="app-head">
        <h1>Billing</h1>
        <p className="quiet">
          Monitoring is $99 per site each month. Scanning on demand stays free.
        </p>
      </div>

      {pending ? (
        <div className="empty">
          <h2>Payment received.</h2>
          <p className="quiet">
            Stripe is still confirming. Refresh in a moment and this page will show the plan.
          </p>
        </div>
      ) : null}

      {checkout === "cancelled" ? (
        <p className="quiet">Checkout was cancelled. Nothing was charged.</p>
      ) : null}

      {active && state ? (
        <>
          <dl className="billing-rows">
            <div>
              <dt>Plan</dt>
              <dd>
                {plan?.name ?? "Monitor"}, {limit} site{limit === 1 ? "" : "s"}
                {comped ? " (complimentary)" : ""}
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{state.planStatus}</dd>
            </div>
            {state.currentPeriodEnd && !comped ? (
              <div>
                <dt>Renews</dt>
                <dd>{DATE.format(state.currentPeriodEnd)}</dd>
              </div>
            ) : null}
          </dl>

          {siteCount > limit ? (
            <p className="quiet billing-note">
              You have {siteCount} sites but your plan covers {limit}. Only the paid number can be
              scheduled.
            </p>
          ) : null}

          {comped ? (
            <p className="quiet billing-note">
              This plan is complimentary, so there&apos;s no card or invoice to manage.
            </p>
          ) : (
            <BillingActions action="portal" label="Manage billing" />
          )}
        </>
      ) : !pending ? (
        <>
          <div className="empty">
            <h2>No monitoring plan.</h2>
            <p className="quiet">
              Scheduled scans and regression alerts need a plan. You will be charged for{" "}
              {Math.max(1, siteCount)} site{Math.max(1, siteCount) === 1 ? "" : "s"}.
            </p>
          </div>
          <BillingActions action="checkout" label="Start monitoring" />
        </>
      ) : null}
    </div>
  );
}
