import Link from "next/link";
import { CountUp } from "@/components/count-up";
import { ScanForm } from "@/components/scan-form";
import { Parallax } from "@/components/parallax";
import { StripeGradient } from "@/components/stripe-gradient";

// The hero object is a real finding set, not an illustration. What the product
// produces is the most persuasive thing it has.
const SPECIMEN = [
  { severity: "critical", title: "Meta Pixel fired before consent was given", vendor: "meta" },
  {
    severity: "critical",
    title: "Email address sent to Google Analytics in plain text",
    vendor: "ga4",
  },
  {
    severity: "critical",
    title: "Google Analytics ignored a denied consent signal",
    vendor: "ga4",
  },
  { severity: "warning", title: "Cookie _fbp written before consent", vendor: "cookie" },
  { severity: "ok", title: "TikTok Pixel waited for consent", vendor: "tiktok" },
] as const;

// Real enforcement, not hypotheticals. Keep these to cases we can cite.
const RISKS = [
  {
    to: 5000,
    decimals: 0,
    suffix: "",
    body: "Statutory damages per violation under California’s wiretap law (CIPA). The plaintiff doesn’t have to prove harm.",
  },
  {
    to: 1.2,
    decimals: 1,
    suffix: "M",
    body: "Sephora’s fine from California’s Attorney General for ignoring Global Privacy Control opt-outs.",
  },
  {
    to: 1.55,
    decimals: 2,
    suffix: "M",
    body: "Healthline’s fine for trackers that kept firing after visitors opted out.",
  },
] as const;

export default function Home() {
  return (
    <main>
      <section className="hero hero-split">
        <div aria-hidden="true" className="hero-gradient">
          <StripeGradient
            amplitude={280}
            colors={["#7038FF", "#6EC3F4", "#FFFFFF", "#EF008F", "#FFBA27", "#00D68F"]}
          />
        </div>

        <div className="wrap hero-grid">
          <div className="hero-copy">
            <Link className="hero-badge" href="/gpc">
              12 states now require Global Privacy Control <span aria-hidden="true">&rarr;</span>
            </Link>
            <h1>
              Your site is sending data your{" "}
              <span className="gradient-text">visitors said no to.</span>
            </h1>
            <p className="lede">
              Law firms are suing retailers under California’s wiretap law for exactly this, at up
              to $5,000 per violation. Consentinel loads your site twice, once refusing consent and
              once accepting it, and shows you every tracker that ignored the difference.
            </p>
            <ScanForm />
          </div>

          <div className="hero-visual">
            <Parallax speed={0.1}>
              <div className="specimen" aria-hidden="true">
                <div className="specimen-head">
                  <span className="specimen-url">northvaleoutfitters.com</span>
                  <span className="verdict">3 critical issues found</span>
                </div>
                <ul className="ledger">
                  {SPECIMEN.map((row) => (
                    <li className="row" data-severity={row.severity} key={row.title}>
                      <span className="gutter" />
                      <span className="row-title">{row.title}</span>
                      <span className="row-vendor">{row.vendor}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Parallax>
          </div>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap">
          <h2>A cookie banner isn’t compliance.</h2>
          <p className="lede" style={{ marginTop: "1.25rem" }}>
            Most sites that get sued have a banner. The banner isn’t the problem. The tags behind it
            are.
          </p>

          <div className="tiles">
            {RISKS.map((risk) => (
              <div className="tile" key={risk.body}>
                <p className="stat">
                  <CountUp to={risk.to} decimals={risk.decimals} prefix="$" suffix={risk.suffix} />
                </p>
                <p>{risk.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="tinted">
        <div data-reveal className="wrap">
          <div className="split">
            <div>
              <h2>Evidence your counsel can use.</h2>
              <p className="lede" style={{ marginTop: "1.25rem" }}>
                Every finding carries the exact request or cookie that proves it. Fix it before a
                demand letter shows up, or show you already did.
              </p>
            </div>
            <div>
              <p className="stat">2</p>
              <p className="lede" style={{ marginTop: "0.5rem" }}>
                page loads per scan. One refusing consent, one accepting it. The difference between
                them is the entire finding.
              </p>
            </div>
          </div>

          <div className="tiles">
            <div className="tile">
              <h3>Trackers that ignore consent</h3>
              <p>
                Tags that load and send data while consent is refused, including ones that read the
                denied signal and fire anyway. This is the core of most wiretap claims.
              </p>
            </div>
            <div className="tile">
              <h3>Personal data in plain sight</h3>
              <p>
                Email addresses and other identifiers passed to ad and analytics platforms in query
                strings. That’s a data leak, not a tracking setting.
              </p>
            </div>
            <div className="tile">
              <h3>Scripts nobody approved</h3>
              <p>
                Third-party scripts on payment pages with no record of why they’re there. PCI DSS
                4.0.1 requires an inventory of every one, and a missing script can fail your audit.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap center">
          <h2>Clean today. Broken next week.</h2>
          <p className="lede" style={{ marginTop: "1.25rem" }}>
            Your marketing team adds tags all the time, and each one can break consent again.
            Monitor rescans your site daily and emails you the moment something new starts firing.
            $99/month per site, less than an hour of outside counsel.
          </p>
          <p style={{ marginTop: "1.25rem" }}>
            <Link href="/pricing">See pricing &rarr;</Link>
          </p>
        </div>
      </section>

      <section className="cta-section">
        <div data-reveal className="wrap">
          <div className="cta-panel">
            <StripeGradient
              colors={["#7038FF", "#6EC3F4", "#FFFFFF", "#EF008F", "#FFBA27", "#00D68F"]}
            />
            <div className="cta-card">
              <h2>See what your site is sharing.</h2>
              <p className="lede" style={{ marginTop: "1rem", marginInline: "auto" }}>
                Scan any page you own. You’ll get the headline immediately and the full report by
                email.
              </p>
              <div style={{ marginTop: "1.5rem" }}>
                <ScanForm />
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div data-reveal className="wrap center">
          Consentinel. Scan only sites you’re authorized to test.
        </div>
      </footer>
    </main>
  );
}
