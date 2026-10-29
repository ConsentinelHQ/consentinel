import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What Consentinel collects, why, who processes it, and how to have it deleted. No ad trackers, no data sales.",
  alternates: { canonical: "/privacy" },
};

const UPDATED = "October 29, 2026";

export default function Privacy() {
  return (
    <main>
      <section className="hero">
        <div className="wrap">
          <div className="legal">
            <h1 style={{ marginInline: 0 }}>Privacy Policy</h1>
            <p className="legal-meta" style={{ marginTop: "1rem" }}>
              Last updated {UPDATED}
            </p>

            <p style={{ marginTop: "2rem" }}>
              Consentinel is operated by Buckley Web Systems LLC (&quot;Consentinel,&quot;
              &quot;we&quot;). We test whether websites keep their privacy promises, so we hold
              ourselves to the same standard: this site runs no advertising or analytics trackers,
              and we don&apos;t sell or share personal information.
            </p>

            <h2>What we collect</h2>
            <ul>
              <li>
                <strong>Free scans.</strong> The address you ask us to scan, and what our browser
                observed on that site. Your IP address is used briefly to stop abuse: we pass it to
                Cloudflare Turnstile for a bot check and count scans per address for up to an hour.
              </li>
              <li>
                <strong>Accounts.</strong> Your name, email address and sign-in details, handled by
                our authentication provider, plus the sites, schedules, alert recipients and
                integrations you set up.
              </li>
              <li>
                <strong>Billing.</strong> Payments are processed by Stripe. We never see or store
                your full card number. We keep your plan, billing status and billing email.
              </li>
              <li>
                <strong>Contact form.</strong> Your email, and any name, company and message you
                send us.
              </li>
              <li>
                <strong>Report links.</strong> When someone opens a report link, we record that it
                was opened and when, so we know whether a report we sent was seen.
              </li>
              <li>
                <strong>Business outreach.</strong> We sometimes email people at companies whose
                public websites we&apos;ve scanned, using business contact details from public
                sources and contact-data providers. You can opt out by replying or with your email
                app&apos;s unsubscribe button, and we stop when asked.
              </li>
              <li>
                <strong>Errors.</strong> When something breaks, our error monitoring receives
                technical details such as browser type and the request that failed.
              </li>
            </ul>

            <h2>Why we use it</h2>
            <p>
              To run scans and send results, provide and bill for the service, send the alerts and
              reports you ask for, answer your messages, prevent abuse, fix bugs, and contact
              businesses about issues we found on their public sites. We don&apos;t use your
              information for advertising, and we don&apos;t sell it or share it for cross-context
              behavioral advertising.
            </p>

            <h2>Cookies</h2>
            <p>
              We set only the cookies needed to keep you signed in and to run the bot check on the
              scan form. There are no advertising, analytics or social media cookies on this site.
              Because we don&apos;t sell or share personal information, there&apos;s nothing for a
              Global Privacy Control signal to opt you out of here, and we treat it as an opt-out
              anyway.
            </p>

            <h2>Who processes it for us</h2>
            <p>These service providers handle data only to run Consentinel on our behalf:</p>
            <ul>
              <li>Vercel (website hosting) and Render (scan servers)</li>
              <li>Neon (database) and our queue and rate-limit store</li>
              <li>Clerk (sign-in and accounts)</li>
              <li>Stripe (payments)</li>
              <li>Resend (product email) and Google Workspace (our email)</li>
              <li>Cloudflare (DNS and bot checks)</li>
              <li>Sentry (error monitoring)</li>
              <li>Atlassian Jira and Slack, only if you connect them</li>
            </ul>
            <p>
              We may also disclose information if the law requires it, or as part of a sale or
              reorganization of the business.
            </p>

            <h2>How long we keep it</h2>
            <p>
              Account, site and scan data stays while your account is open. Rate-limit records
              expire within an hour. Billing records are kept as long as tax and accounting rules
              require. You can ask us to delete anything else at any time.
            </p>

            <h2>Your choices and rights</h2>
            <p>
              You can ask to see, correct or delete your personal information, or to stop receiving
              our emails, by writing to{" "}
              <a href="mailto:charlie@consentinelhq.com">charlie@consentinelhq.com</a>. Depending on
              where you live, including California, Colorado, Connecticut, Virginia and other states
              with privacy laws, you may have these rights by law. We won&apos;t treat you
              differently for using them. We&apos;ll verify requests by email before acting on them.
            </p>

            <h2>Security</h2>
            <p>
              Data is encrypted in transit, access is limited to what&apos;s needed to run the
              service, and secrets are kept out of our code. No system is perfectly secure, and
              we&apos;ll tell affected users promptly if a breach affects their data.
            </p>

            <h2>Children</h2>
            <p>Consentinel is a business tool and isn&apos;t meant for anyone under 16.</p>

            <h2>Changes</h2>
            <p>
              If we change this policy, we&apos;ll update the date above, and for significant
              changes we&apos;ll email account holders.
            </p>

            <h2>Contact</h2>
            <p>
              Buckley Web Systems LLC, doing business as Consentinel.{" "}
              <a href="mailto:charlie@consentinelhq.com">charlie@consentinelhq.com</a>. See also our{" "}
              <Link href="/terms">Terms of Service</Link>.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
