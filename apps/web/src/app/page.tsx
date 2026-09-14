import { ScanForm } from "@/components/scan-form";
import { Parallax } from "@/components/parallax";

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

export default function Home() {
  return (
    <main>
      <section className="hero center">
        <div className="wrap">
          <h1>Your tags are firing before anyone said yes.</h1>
          <p className="lede">
            Consentinel loads your site twice, once refusing consent and once accepting it, and
            shows you every tracker that ignored the difference.
          </p>
          <ScanForm />
        </div>

        <Parallax speed={0.1}>
          <div className="specimen" aria-hidden="true">
            <div className="specimen-head">
              <span className="specimen-url">northvaleoutfitters.com</span>
              <span className="verdict">3 trackers firing before consent</span>
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
      </section>

      <section className="tinted">
        <div data-reveal className="wrap">
          <div className="split">
            <div>
              <h2>Proof, not opinions.</h2>
              <p className="lede" style={{ marginTop: "1.25rem" }}>
                Every finding carries the request or cookie that proves it. You can hand the report
                to an engineer and they will know exactly what to change, or to a regulator and it
                will hold up.
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
                denied signal and fire anyway.
              </p>
            </div>
            <div className="tile">
              <h3>Personal data in plain sight</h3>
              <p>
                Email addresses and other identifiers passed to ad and analytics platforms in query
                strings where anyone can read them.
              </p>
            </div>
            <div className="tile">
              <h3>Scripts nobody approved</h3>
              <p>
                Third-party scripts running on payment pages with no record of why they are there,
                which PCI DSS now requires you to account for.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap center">
          <h2>Find out in a minute.</h2>
          <p className="lede" style={{ marginTop: "1.25rem" }}>
            Scan any page you own. You will get the headline immediately and the full report by
            email.
          </p>
          <ScanForm />
        </div>
      </section>

      <footer>
        <div data-reveal className="wrap center">
          Consentinel. Scan only sites you are authorised to test.
        </div>
      </footer>
    </main>
  );
}
