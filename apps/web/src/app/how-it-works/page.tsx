import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How it works - Consentinel",
  description:
    "Consentinel loads your site twice, once refusing consent and once accepting it, and reports every tracker that ignored the difference. Every finding carries the request or cookie that proves it.",
};

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
          <h1>We do not ask your site. We watch it.</h1>
          <p className="lede">
            A consent banner records a choice. It does not prove anything was honoured. Consentinel
            loads your site twice, under two different answers, and reports every difference between
            what you promised and what actually happened.
          </p>
        </div>
      </section>

      <section className="tinted">
        <div data-reveal className="wrap">
          <h2 className="center">The two-pass scan</h2>
          <ol className="method">
            <li>
              <h3>Pass one: refuse</h3>
              <p>
                A real browser loads your page. We detect your consent platform, find the reject
                control, and click it. Then we record every network request that leaves the page and
                every cookie written to it.
              </p>
              <p className="quiet">
                Anything that fires here fired against an explicit refusal. That is the finding
                regulators act on.
              </p>
            </li>
            <li>
              <h3>Pass two: accept</h3>
              <p>
                The same page, the same browser, the opposite answer. We record the same two things
                again.
              </p>
              <p className="quiet">
                This pass is what stops us crying wolf. A tag that appears only here is behaving
                correctly, and we say so by name.
              </p>
            </li>
            <li>
              <h3>The difference is the report</h3>
              <p>
                Everything present in both passes ignored the choice. Everything present only in the
                second pass is correctly gated. The gap between them is your exposure, and it is
                measured rather than assumed.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap">
          <div className="split">
            <div>
              <h2>Every finding carries its proof.</h2>
              <p className="lede" style={{ marginTop: "1.25rem" }}>
                We do not report that something &quot;may be&quot; firing. Each line comes with the
                exact request or cookie that caused it, so the person who has to fix it can verify
                the claim in their own devtools in under a minute.
              </p>
              <p style={{ marginTop: "1.25rem" }}>
                That matters when the report leaves your desk. Evidence survives being forwarded to
                a developer, an agency, a lawyer, or an auditor. An opinion does not.
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

      <section className="tinted">
        <div data-reveal className="wrap">
          <h2 className="center">What we grade, and how</h2>
          <p className="lede center" style={{ marginTop: "1.25rem", marginInline: "auto" }}>
            Every non-essential tag that fires before consent is a violation. They are not equally
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
                before consent. Flagging them would be crying wolf, so we recognise them and stay
                quiet.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap">
          <h2 className="center">What we do not do</h2>
          <p className="lede center" style={{ marginTop: "1.25rem", marginInline: "auto" }}>
            Every tool in this category publishes what it catches. Here is what ours misses, because
            you should know before you rely on it.
          </p>
          <ul className="limits">
            <li>
              <strong>We cannot always find your reject button.</strong> If your consent platform is
              custom or unusual, we may not be able to click refuse. When that happens the scan runs
              in the banner&apos;s default state instead, and the report says so, because
              &quot;before any choice was made&quot; is weaker evidence than &quot;after
              refusing&quot; and should not be presented as the same thing.
            </li>
            <li>
              <strong>Some sites refuse us.</strong> Enterprise bot management can reject an
              automated browser outright. We would rather fail loudly than return a clean report we
              did not earn.
            </li>
            <li>
              <strong>We cannot attribute every cookie.</strong> Real sites set cookies we do not
              recognise. We list them separately as evidence rather than counting them as findings,
              because we cannot prove they are non-essential and guessing would waste your time.
            </li>
            <li>
              <strong>A scan is a moment, not a guarantee.</strong> A clean scan today says nothing
              about the tag someone adds on Thursday. That is what monitoring is for.
            </li>
          </ul>
        </div>
      </section>

      <section className="tinted">
        <div data-reveal className="wrap center">
          <h2>Point it at a page you own.</h2>
          <p className="lede" style={{ marginTop: "1.25rem", marginInline: "auto" }}>
            The free scan takes about a minute and needs no account. If the report is useful, the
            paid audit runs the same method across your whole site.
          </p>
          <p style={{ marginTop: "1.75rem" }}>
            <Link className="tier-cta primary" href="/">
              Scan a site
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
