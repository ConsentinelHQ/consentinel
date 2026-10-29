import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using Consentinel's scans, monitoring and reports.",
  alternates: { canonical: "/terms" },
};

const UPDATED = "October 29, 2026";

export default function Terms() {
  return (
    <main>
      <section className="hero">
        <div className="wrap">
          <div className="legal">
            <h1 style={{ marginInline: 0 }}>Terms of Service</h1>
            <p className="legal-meta" style={{ marginTop: "1rem" }}>
              Last updated {UPDATED}
            </p>

            <p style={{ marginTop: "2rem" }}>
              These terms are an agreement between you and Buckley Web Systems LLC, doing business
              as Consentinel (&quot;we&quot;). By using Consentinel, including the free scan, you
              agree to them. If you use it for a company, you agree for that company and confirm you
              can.
            </p>

            <h2>The service</h2>
            <p>
              Consentinel loads websites in an automated browser, records the requests and cookies
              they produce under different consent choices, and reports what it finds. Paid plans
              add scheduled rescans, alerts, integrations and shareable reports.
            </p>

            <h2>Scan only sites you&apos;re allowed to test</h2>
            <p>
              Only scan websites you own or are authorized to test. Don&apos;t use Consentinel to
              overload, attack, or get around access controls on any site. You&apos;re responsible
              for having permission for the sites you add.
            </p>

            <h2>Acceptable use</h2>
            <ul>
              <li>Don&apos;t try to break, overload or reverse engineer the service.</li>
              <li>Don&apos;t automate free scans to get around rate limits.</li>
              <li>Don&apos;t use reports to mislead anyone about what a scan found.</li>
              <li>Don&apos;t use Consentinel for anything unlawful.</li>
            </ul>
            <p>We can suspend accounts that break these rules.</p>

            <h2>Accounts</h2>
            <p>
              Keep your sign-in secure. You&apos;re responsible for activity under your account and
              for the people you invite or send alerts to.
            </p>

            <h2>Plans and billing</h2>
            <p>
              Paid plans are billed in advance, monthly or yearly, per site, at the prices shown on
              the <Link href="/pricing">pricing page</Link>. Payments run through Stripe. Plans
              renew automatically until you cancel. You can cancel any time from the billing page,
              and you keep access until the end of the period you&apos;ve paid for. We don&apos;t
              refund partial periods. If we change prices, we&apos;ll tell you before your next
              renewal.
            </p>

            <h2>Not legal advice</h2>
            <p>
              Consentinel reports technical evidence: what a page did when we loaded it. It
              doesn&apos;t tell you whether you comply with any law, and it isn&apos;t legal advice.
              A scan is a snapshot. Sites change, tags load differently from visit to visit, and a
              scan can miss things. Talk to a lawyer about your obligations.
            </p>

            <h2>Your data and ours</h2>
            <p>
              Your sites, settings and reports are yours. You let us process them to run the
              service. Consentinel itself, including the scanner, its vendor signatures and the
              report design, belongs to us. If you send us feedback, we can use it without owing you
              anything. Anyone with a report link you share can view that report, so share links
              carefully.
            </p>

            <h2>Availability</h2>
            <p>
              We work to keep Consentinel running, but scans, alerts and integrations can be delayed
              or fail. We may change or retire features. If we shut down a paid feature, we&apos;ll
              give notice and refund any prepaid time you can&apos;t use.
            </p>

            <h2>Warranty disclaimer</h2>
            <p>
              Consentinel is provided &quot;as is&quot; and &quot;as available.&quot; To the extent
              the law allows, we disclaim all warranties, including merchantability, fitness for a
              particular purpose and non-infringement, and we don&apos;t promise that scans will
              find every issue.
            </p>

            <h2>Limitation of liability</h2>
            <p>
              To the extent the law allows, we aren&apos;t liable for indirect, incidental, special,
              consequential or punitive damages, or for lost profits, revenue, data, or fines and
              claims against you. Our total liability for any claim is limited to what you paid us
              in the 12 months before it, or $100 if you&apos;re on the free scan.
            </p>

            <h2>Indemnity</h2>
            <p>
              If someone makes a claim against us because you scanned a site you weren&apos;t
              authorized to test, or otherwise broke these terms, you&apos;ll cover our reasonable
              costs of dealing with it.
            </p>

            <h2>Ending the agreement</h2>
            <p>
              You can stop using Consentinel and close your account any time. We can end or suspend
              access if you break these terms. The sections on liability, indemnity and ownership
              survive.
            </p>

            <h2>Governing law</h2>
            <p>
              These terms are governed by the laws of the State of New Jersey, and disputes go to
              the state or federal courts in New Jersey.
            </p>

            <h2>Changes</h2>
            <p>
              We may update these terms. We&apos;ll update the date above and email account holders
              about significant changes. Using Consentinel after a change means you accept it.
            </p>

            <h2>Contact</h2>
            <p>
              <a href="mailto:charlie@consentinelhq.com">charlie@consentinelhq.com</a>. See also our{" "}
              <Link href="/privacy">Privacy Policy</Link>.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
