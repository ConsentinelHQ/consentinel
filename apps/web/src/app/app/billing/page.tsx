import { BillingCycle } from "@/components/billing-cycle";
import type { Metadata } from "next";
import {
  ANNUAL_PRICES,
  PLANS,
  activePlan,
  countOrgSites,
  getBillingState,
  isEntitled,
  siteLimit,
} from "@consentinel/db";
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
        <p className="quiet">Pick the plan that fits. Scanning on demand stays free.</p>
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
            {state.stripeSubscriptionId && !comped ? (
              <BillingCycle
                subscriptionId={state.stripeSubscriptionId}
                perSite={plan?.perSite ?? true}
              />
            ) : null}
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
          <div className="plan-grid">
            {Object.values(PLANS).map((p) => {
              const sites = Math.max(1, siteCount);
              return (
                <div className="plan-card" key={p.id}>
                  <h2>{p.name}</h2>
                  <p className="plan-price">
                    ${p.price}
                    <span>/mo{p.perSite ? " per site" : ""}</span>
                  </p>
                  {ANNUAL_PRICES[p.id] ? (
                    <p className="tier-annual plan-annual">
                      or ${ANNUAL_PRICES[p.id]?.toLocaleString("en-US")}/year
                      {p.perSite ? " per site" : ""}, 2 months free
                    </p>
                  ) : null}
                  <ul>
                    <li>
                      {p.perSite
                        ? `${String(sites)} site${sites === 1 ? "" : "s"} today, billed per site`
                        : `Up to ${String(p.includedSites)} sites`}
                    </li>
                    <li>Daily scans and new-issue alerts</li>
                    <li>Scan after every deploy</li>
                    {p.pagesPerScan > 1 ? (
                      <li>
                        Product, cart and checkout pages <em>Coming soon</em>
                      </li>
                    ) : (
                      <li>Homepage scanned</li>
                    )}
                    <li>
                      {p.historyDays === 365 ? "12 months" : `${String(p.historyDays)} days`} of
                      history
                    </li>
                    {p.slack ? (
                      <>
                        <li>Slack alerts</li>
                        <li>
                          PDF evidence <em>Coming soon</em>
                        </li>
                      </>
                    ) : null}
                    {p.workspaces ? (
                      <li>
                        Client workspaces, white-label reports, API <em>Coming soon</em>
                      </li>
                    ) : null}
                  </ul>
                  {p.id === "agency" || p.id === "growth" ? (
                    <span aria-disabled="true" className="tier-cta is-disabled">
                      Coming soon
                    </span>
                  ) : (
                    <>
                      <BillingActions action="checkout" label="Pay monthly" plan={p.id} />
                      {ANNUAL_PRICES[p.id] ? (
                        <BillingActions
                          action="checkout"
                          interval="year"
                          label="Pay annually · 2 months free"
                          plan={p.id}
                        />
                      ) : null}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
