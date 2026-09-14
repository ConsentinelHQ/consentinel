import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing - Consentinel",
  description:
    "A free scan of any page, a fixed-price consent audit at $1,500, and continuous monitoring from $99 a month.",
};

export default function Pricing() {
  return (
    <main>
      <section className="hero center">
        <div className="wrap">
          <h1>Priced to be read, not quoted.</h1>
          <p className="lede">
            Audit tools in this category hide their pricing behind a sales call. Ours is on this
            page. Scan anything free, and pay only when you want the evidence in a form you can hand
            to someone.
          </p>
        </div>
      </section>

      <section>
        <div className="wrap tiers">
          <div className="tier">
            <h2>Free scan</h2>
            <p className="tier-price">$0</p>
            <p className="tier-note">No account needed</p>
            <ul className="tier-list">
              <li>Any single page, any site you are authorised to test</li>
              <li>Two-pass scan: once refusing consent, once accepting</li>
              <li>Every tracker firing before consent, graded by risk</li>
              <li>Full findings by email</li>
            </ul>
            <Link className="tier-cta" href="/#scan">
              Scan a site
            </Link>
          </div>

          <div className="tier featured">
            <h2>Consent audit</h2>
            <p className="tier-price">$1,500</p>
            <p className="tier-note">One domain, up to 25 pages, delivered in 5 business days</p>
            <ul className="tier-list">
              <li>Every page scanned under both consent states</li>
              <li>Each finding carries the request or cookie that proves it</li>
              <li>Remediation written for whoever has to make the change</li>
              <li>Script inventory suitable for PCI DSS 6.4.3 evidence</li>
              <li>A re-scan after your fixes, included</li>
            </ul>
            <a className="tier-cta primary" href="/contact">
              Book an audit
            </a>
          </div>

          <div className="tier">
            <h2>Monitoring</h2>
            <p className="tier-price">
              $99<span className="tier-per">/month per site</span>
            </p>
            <p className="tier-note">In development</p>
            <ul className="tier-list">
              <li>Scheduled scans on a cadence you set</li>
              <li>Alerts when a deploy introduces a new ungated tag</li>
              <li>Diffs between any two scans: new, fixed, regressed</li>
              <li>Evidence history you can hand to an auditor</li>
            </ul>
            <Link className="tier-cta" href="/contact">
              Join the list
            </Link>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap center">
          <h2>Bigger than 25 pages?</h2>
          <p className="lede" style={{ marginTop: "1.25rem" }}>
            Multi-domain estates, staging environments, and authenticated journeys are all things we
            scan. Tell us the shape of it and we will quote against the number above, not against
            your company size.
          </p>
          <p style={{ marginTop: "1.75rem" }}>
            <Link className="tier-cta" href="/contact">
              Get in touch
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
