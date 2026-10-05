import type { Metadata } from "next";
import Link from "next/link";
import { PLANS } from "@consentinel/db";

export const metadata: Metadata = {
  title: "Pricing - Consentinel",
  description:
    "A free scan of any page. Monitoring from $99 a month per site, with plans for growing brands and agencies.",
};

const { monitoring, growth, agency } = PLANS;

export default function Pricing() {
  return (
    <main>
      <section className="hero center pricing-hero">
        <div className="wrap">
          <h1>Priced to be read, not quoted.</h1>
          <p className="lede">
            Audit tools in this category hide their pricing behind a sales call. Ours is on this
            page. Scan anything free, and pay only when you want it watched.
          </p>
        </div>
      </section>

      <section className="pricing-tiers">
        <div data-reveal className="wrap tiers tiers-4">
          <div className="tier">
            <h2>Free scan</h2>
            <p className="tier-price">$0</p>
            <p className="tier-note">No account needed</p>
            <ul className="tier-list">
              <li>Any single page, any site you’re authorized to test</li>
              <li>Two-pass scan: once refusing consent, once accepting</li>
              <li>Every tracker firing before consent, graded by risk</li>
              <li>Full findings by email</li>
            </ul>
            <Link className="tier-cta" href="/#scan">
              Scan a site
            </Link>
          </div>

          <div className="tier featured">
            <h2>{monitoring.name}</h2>
            <p className="tier-price">
              ${monitoring.price}
              <span className="tier-per">/month per site</span>
            </p>
            <p className="tier-note">For a single store</p>
            <ul className="tier-list">
              <li>Scheduled scans daily, weekly, or monthly</li>
              <li>A scan after every deploy, from your CI pipeline or a Zapier step</li>
              <li>An email the moment a new tracker fires before consent</li>
              <li>Every finding carries the request or cookie that proves it, and the fix</li>
              <li>Shareable report links for whoever has to make the change</li>
              <li>{monitoring.historyDays} days of scan history</li>
            </ul>
            {/* Signed-out visitors go through sign-up and land on the plan picker. */}
            <Link className="tier-cta primary" href="/app/billing">
              Start monitoring
            </Link>
          </div>

          <div className="tier">
            <h2>{growth.name}</h2>
            <p className="tier-price">
              ${growth.price}
              <span className="tier-per">/month</span>
            </p>
            <p className="tier-note">For growing brands</p>
            <ul className="tier-list">
              <li>Up to {growth.includedSites} sites</li>
              <li>Everything in {monitoring.name}</li>
              <li>12 months of scan history</li>
              <li>
                Product, cart and checkout pages scanned <span className="soon">Coming soon</span>
              </li>
              <li>Slack alerts</li>
              <li>
                PDF evidence exports <span className="soon">Coming soon</span>
              </li>
            </ul>
            <Link className="tier-cta" href="/app/billing">
              Choose {growth.name}
            </Link>
          </div>

          <div className="tier">
            <h2>{agency.name}</h2>
            <p className="tier-price">
              ${agency.price}
              <span className="tier-per">/month</span>
            </p>
            <p className="tier-note">For agencies managing client stores</p>
            <ul className="tier-list">
              <li>Up to {agency.includedSites} sites</li>
              <li>Everything in {growth.name}</li>
              <li>
                A workspace per client <span className="soon">Coming soon</span>
              </li>
              <li>
                White-label reports under your brand <span className="soon">Coming soon</span>
              </li>
              <li>
                API access <span className="soon">Coming soon</span>
              </li>
            </ul>
            <Link className="tier-cta" href="/app/billing">
              Choose {agency.name}
            </Link>
          </div>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap center">
          <h2>More than one site?</h2>
          <p className="lede" style={{ marginTop: "1.25rem", marginInline: "auto" }}>
            {monitoring.name} is ${monitoring.price} per site. From the fourth site, {growth.name}{" "}
            costs less and covers up to {growth.includedSites}. Agencies get {agency.includedSites}{" "}
            sites for ${agency.price}. Switch plans any time from your billing page. No sales call,
            no quote.
          </p>
        </div>
      </section>
    </main>
  );
}
