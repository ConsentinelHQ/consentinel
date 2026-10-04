import type { Metadata } from "next";
import Link from "next/link";
import { ScanForm } from "@/components/scan-form";
import { StripeGradient } from "@/components/stripe-gradient";

export const metadata: Metadata = {
  title: "How it works - Consentinel",
  description:
    "Consentinel loads your site twice, once refusing consent and once accepting it, and reports every tracker that ignored the difference. Every finding carries the request or cookie that proves it.",
};

const BRAND = ["#7038FF", "#6EC3F4", "#FFFFFF", "#EF008F", "#FFBA27", "#00D68F"];

// Anonymized from a real store: one ad tag pulled in eight more through cookie syncs.
const CHAIN = [
  "BidSwitch",
  "Neustar (TransUnion)",
  "Nielsen eXelate",
  "NinthDecimal",
  "Digital Audience",
  "Taboola",
  "Xandr (AppNexus)",
  "Comscore",
];

// The two-pass diff, row by row. Fired in both = ignored the refusal.
const DIFF = [
  { name: "Meta Pixel", refused: true },
  { name: "Amazon Ads", refused: true },
  { name: "Klaviyo", refused: true },
  { name: "TikTok Pixel", refused: false },
  { name: "Pinterest Tag", refused: false },
];

// Real evidence, not an illustration. The method is the product's credibility.
const EVIDENCE = [
  {
    severity: "critical",
    title: "Meta Pixel fires under default consent",
    proof: "GET https://connect.facebook.net/en_US/fbevents.js",
  },
  {
    severity: "critical",
    title: 'Google Ads set an advertising cookie "_gcl_au" under default consent',
    proof: "Cookie _gcl_au on .example.com (first-party)",
  },
  {
    severity: "warning",
    title: "Google gtag.js fires under default consent",
    proof: "GET https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX",
  },
];

export default function HowItWorks() {
  return (
    <main>
      <section className="hero center">
        <div className="wrap">
          <h1>We don’t ask your site. We watch it.</h1>
          <p className="lede">
            A consent banner records a choice. It doesn’t prove anything was honored. Consentinel
            loads your site twice, under two different answers, and reports every difference between
            what you promised and what actually happened.
          </p>
        </div>
      </section>

      <section className="tinted">
        <div data-reveal className="wrap">
          <div className="method-split">
            <div className="method-steps">
              <h2>The two-pass scan</h2>
              <p className="lede" style={{ marginTop: "1rem" }}>
                Your banner records a choice. We check whether anything listened.
              </p>
              <ol className="steps">
                <li>
                  <span className="step-num">1</span>
                  <div>
                    <h3>Refuse</h3>
                    <p>
                      A real browser loads your page, clicks reject, and records every request and
                      cookie.
                    </p>
                  </div>
                </li>
                <li>
                  <span className="step-num">2</span>
                  <div>
                    <h3>Accept</h3>
                    <p>Same page, same browser, the opposite answer. Recorded again.</p>
                  </div>
                </li>
                <li>
                  <span className="step-num">3</span>
                  <div>
                    <h3>Compare</h3>
                    <p>
                      Firing both times means it ignored the refusal. Firing only after accepting
                      means it waited, and we say so by name.
                    </p>
                  </div>
                </li>
              </ol>
            </div>

            <div className="diff" aria-hidden="true">
              <div className="diff-head">
                <span>Tracker</span>
                <span>Refused</span>
                <span>Accepted</span>
                <span>Verdict</span>
              </div>
              {DIFF.map((row, i) => (
                <div
                  className="diff-row"
                  data-s={row.refused ? "bad" : "ok"}
                  key={row.name}
                  style={{ animationDelay: `${String(i * 110)}ms` }}
                >
                  <span className="diff-name">{row.name}</span>
                  <span className={`diff-dot${row.refused ? " on" : ""}`} />
                  <span className="diff-dot on" />
                  <span className="diff-verdict">
                    {row.refused ? "Ignored your refusal" : "Waited for consent"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap">
          <div className="split">
            <div>
              <h2>Every finding carries its proof.</h2>
              <p className="lede" style={{ marginTop: "1.25rem" }}>
                We don’t report that something &quot;may be&quot; firing. Each line comes with the
                exact request or cookie that caused it, so the person who has to fix it can verify
                the claim in their own devtools in under a minute.
              </p>
              <p style={{ marginTop: "1.25rem" }}>
                That matters when the report leaves your desk. Evidence survives being forwarded to
                a developer, an agency, a lawyer, or an auditor. An opinion doesn’t.
              </p>
            </div>
            <div className="specimen" aria-hidden="true">
              <div className="specimen-head">
                <span className="specimen-url">evidence</span>
                <span className="verdict">2 critical, 1 to clean up</span>
              </div>
              <ul className="ledger">
                {EVIDENCE.map((row) => (
                  <li className="row evidence-row" data-severity={row.severity} key={row.title}>
                    <span className="gutter" />
                    <span className="row-title">
                      {row.title}
                      <span className="proof">{row.proof}</span>
                    </span>
                    <span className="row-vendor">{row.severity}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap">
          <div className="split">
            <div>
              <h2>One tag can bring eight more.</h2>
              <p className="lede" style={{ marginTop: "1.25rem" }}>
                Ad tags rarely travel alone. One pixel loads a sync frame, the frame calls a dozen
                partners, and each partner sets its own cookies. Fix them one at a time and you will
                be chasing symptoms.
              </p>
              <p style={{ marginTop: "1.25rem" }}>
                Consentinel traces every tracker back to the tag that loaded it. On one real store,
                a single advertising tag was responsible for nine findings, so the report puts that
                one fix first.
              </p>
            </div>
            <div className="specimen" aria-hidden="true">
              <div className="specimen-head">
                <span className="specimen-url">one tag, 9 findings</span>
                <span className="verdict">fix this first</span>
              </div>
              <ul className="ledger">
                <li className="row" data-severity="critical">
                  <span className="gutter" />
                  <span className="row-title">Amazon Advertising fires before consent</span>
                  <span className="row-vendor">root</span>
                </li>
                {CHAIN.map((vendor) => (
                  <li className="row is-child" data-severity="critical" key={vendor}>
                    <span className="gutter" />
                    <span className="row-title">{vendor}</span>
                    <span className="row-vendor">via amazon</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="tinted">
        <div data-reveal className="wrap">
          <h2 className="center">What we grade, and how</h2>
          <p className="lede center" style={{ marginTop: "1.25rem", marginInline: "auto" }}>
            Every non-essential tag that fires before consent is a violation. They’re not equally
            urgent. If everything is critical, nothing is, and the report stops helping you decide
            what to fix first.
          </p>
          <div className="grades">
            <div className="grade" data-severity="critical">
              <h3>Critical</h3>
              <p>
                Advertising and session recording. Data leaves for profiling, cross-site targeting,
                and resale. Personal data sent to a tracker in plaintext. A tag that saw a denied
                consent signal and fired anyway.
              </p>
            </div>
            <div className="grade" data-severity="warning">
              <h3>Warning</h3>
              <p>
                Analytics, tag managers, and social embeds. Still unlawful before consent, lower
                exposure, and usually a one-line Consent Mode fix rather than a rebuild.
              </p>
            </div>
            <div className="grade" data-severity="ok">
              <h3>Never flagged</h3>
              <p>
                Payment processors, bot protection, and strictly necessary cookies. These are lawful
                before consent. Flagging them would be crying wolf, so we recognize them and stay
                quiet.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap center">
          <h2>Scans that follow your releases.</h2>
          <p className="lede" style={{ marginTop: "1.25rem" }}>
            Most consent breaks ship with a release: a new tag, a theme update, an app install.
            Every monitored site gets a private URL that runs a scan the moment you deploy. If a
            release breaks consent, you get the alert within minutes, not at the next scheduled
            scan.
          </p>
          <div className="allowlist-code" style={{ marginTop: "1.75rem", textAlign: "left" }}>
            <pre>{`- name: Consent scan after deploy\n  run: curl -fsS -X POST "\${{ secrets.CONSENTINEL_DEPLOY_HOOK }}"`}</pre>
          </div>
          <p className="quiet" style={{ marginTop: "1rem" }}>
            One step after your deploy in GitHub Actions. Works the same from any CI system, Shopify
            Flow, or Zapier: it’s a single HTTP POST.
          </p>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap">
          <h2 className="center">What we don’t do</h2>
          <p className="lede center" style={{ marginTop: "1.25rem", marginInline: "auto" }}>
            Every tool in this category publishes what it catches. Here is what ours misses, because
            you should know before you rely on it.
          </p>
          <ul className="limits">
            <li>
              <strong>We can’t always find your reject button.</strong> If your consent platform is
              custom or unusual, we may not be able to click refuse. When that happens the scan runs
              in the banner&apos;s default state instead, and the report says so, because
              &quot;before any choice was made&quot; is weaker evidence than &quot;after
              refusing&quot; and shouldn’t be presented as the same thing.
            </li>
            <li>
              <strong>Some sites refuse us.</strong> Enterprise bot management can reject an
              automated browser outright. We would rather fail loudly than return a clean report we
              didn’t earn.
            </li>
            <li>
              <strong>We can’t attribute every cookie.</strong> Real sites set cookies we don’t
              recognize. We list them separately as evidence rather than counting them as findings,
              because we can’t prove they’re non-essential and guessing would waste your time.
            </li>
            <li>
              <strong>A scan is a moment, not a guarantee.</strong> A clean scan today says nothing
              about the tag someone adds on Thursday. That’s what monitoring is for.
            </li>
          </ul>
        </div>
      </section>

      <section className="cta-section">
        <div data-reveal className="wrap">
          <div className="cta-panel">
            <StripeGradient colors={BRAND} />
            <div className="cta-card">
              <h2>Point it at a page you own.</h2>
              <p className="lede" style={{ marginTop: "1rem", marginInline: "auto" }}>
                The free scan takes about a minute and needs no account.
              </p>
              <div style={{ marginTop: "1.5rem" }}>
                <ScanForm />
              </div>
              <p className="quiet" style={{ marginTop: "1rem" }}>
                Monitoring and audits run the same method across your whole site.{" "}
                <Link href="/pricing">See pricing</Link>
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
