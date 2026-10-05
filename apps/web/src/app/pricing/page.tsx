import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing - Consentinel",
  description: "A free scan of any page, and continuous monitoring for $99 a month per site.",
};

export default function Pricing() {
  return (
    <main>
      <section className="hero center">
        <div className="wrap">
          <h1>Priced to be read, not quoted.</h1>
          <p className="lede">
            Audit tools in this category hide their pricing behind a sales call. Ours is on this
            page. Scan anything free, and pay only when you want it watched.
          </p>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap tiers">
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
            <h2>Monitoring</h2>
            <p className="tier-price">
              $99<span className="tier-per">/month per site</span>
            </p>
            <p className="tier-note">Cancel any time, from your billing page</p>
            <ul className="tier-list">
              <li>Scheduled scans daily, weekly, or monthly</li>
              <li>A scan after every deploy, from one line in your CI pipeline or a Zapier step</li>
              <li>An email the moment a new tracker starts firing before consent</li>
              <li>Every finding carries the request or cookie that proves it, and the fix</li>
              <li>Shareable report links for whoever has to make the change</li>
            </ul>
            {/* Signed-out visitors get bounced through sign-up and land here ready to pay. */}
            <Link className="tier-cta primary" href="/app/billing">
              Start monitoring
            </Link>
          </div>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap center">
          <h2>More than one site?</h2>
          <p className="lede" style={{ marginTop: "1.25rem", marginInline: "auto" }}>
            Monitoring is $99 per site. Add every storefront, region, or brand from your dashboard
            and your plan updates on its own. No sales call, no quote.
          </p>
        </div>
      </section>
    </main>
  );
}
