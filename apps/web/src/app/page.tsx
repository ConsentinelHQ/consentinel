import Link from "next/link";
import { CountUp } from "@/components/count-up";
import { Faq } from "@/components/faq";
import { FluidCursor } from "@/components/fluid-cursor";
import { JiraLoop } from "@/components/jira-loop";
import { Marquee } from "@/components/marquee";
import { ScanForm } from "@/components/scan-form";
import { Parallax } from "@/components/parallax";
import { StackCards } from "@/components/stack-cards";
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

// Names only, set as type. These are vendors the scanner classifies, not customers.
const VENDORS = [
  "Meta Pixel",
  "Google Analytics 4",
  "Google Ads",
  "TikTok Pixel",
  "Amazon Advertising",
  "Pinterest Tag",
  "Snap Pixel",
  "Microsoft Clarity",
  "Klaviyo",
  "Criteo",
  "Xandr",
  "Hotjar",
] as const;

// The banners our detection registry reads today. Keep in sync with the scanner.
const CMPS = ["OneTrust", "Cookiebot", "Osano", "Didomi", "TrustArc"] as const;

const FINDINGS = [
  {
    eyebrow: "Finding 01",
    title: "Trackers that ignore consent",
    nav: "Ignored consent",
    body: "Tags that load and send data while consent is refused, including ones that read the denied signal and fire anyway. This is the core of most wiretap claims.",
    chip: "The pattern behind CIPA suits",
    visual: (
      <div className="ev">
        <p className="ev-head">
          <span>Pass 1 · consent refused</span>
          <span className="ev-bad">fired</span>
        </p>
        <code>GET connect.facebook.net/en_US/fbevents.js</code>
        <code>POST facebook.com/tr?ev=PageView</code>
        <code>GET analytics.tiktok.com/i18n/pixel/events.js</code>
      </div>
    ),
  },
  {
    eyebrow: "Finding 02",
    title: "Personal data in plain sight",
    nav: "Leaked identifiers",
    body: "Email addresses and other identifiers passed to ad and analytics platforms in query strings. That’s a data leak, not a tracking setting.",
    chip: "Leaked identifiers, with the request",
    visual: (
      <div className="ev">
        <p className="ev-head">
          <span>Outbound request</span>
          <span className="ev-bad">PII</span>
        </p>
        <code>GET google-analytics.com/g/collect</code>
        <code>
          ?tid=G-XXXX&amp;<mark>uid=jane%40example.com</mark>
        </code>
        <code>&amp;en=page_view&amp;dl=/checkout</code>
      </div>
    ),
  },
  {
    eyebrow: "Finding 03",
    title: "Scripts nobody approved",
    nav: "Unapproved scripts",
    body: "Third-party scripts on payment pages with no record of why they’re there. PCI DSS 4.0.1 requires an inventory of every one, and a missing script can fail your audit.",
    chip: "Maps to PCI DSS 6.4.3 and 11.6.1",
    visual: (
      <div className="ev">
        <p className="ev-head">
          <span>/checkout · script inventory</span>
          <span className="ev-warn">2 new</span>
        </p>
        <code>js.stripe.com/v3 · approved</code>
        <code>
          <mark>cdn.unknown-widget.io/w.js · no record</mark>
        </code>
        <code>
          <mark>tag.adsrvr.org/up_loader.js · no record</mark>
        </code>
      </div>
    ),
  },
] as const;

const FAQ = [
  {
    q: "Do I need an account for the free scan?",
    a: "No. Enter a page you own and you’ll get the headline in about a minute, with the full report by email. An account is only for monitoring.",
  },
  {
    q: "We already have a cookie banner. Aren’t we covered?",
    a: "A banner records a choice. It doesn’t prove anything honored it. Most sites that get sued have one. The problem is the tags behind it that keep firing after a visitor says no.",
  },
  {
    q: "How does the scan work?",
    a: "A real browser loads your page twice, once refusing consent and once accepting it. Anything that fires both times ignored the refusal, and the report shows the exact request or cookie that proves it.",
  },
  {
    q: "Which consent banners do you support?",
    a: "We detect OneTrust, Cookiebot, Osano, Didomi and TrustArc automatically. If we can’t find your reject button, the report says so instead of guessing.",
  },
  {
    q: "Do I have to install anything on my site?",
    a: "No code, no tag, no plugin. We scan from the outside the same way a visitor, or a plaintiff’s firm, would. Sites behind Cloudflare bot protection can allowlist our scanner.",
  },
  {
    q: "How is this different from the scanner in my CMP?",
    a: "CMP scanners list cookies so you can categorize them. Consentinel tests whether your banner actually works, records evidence counsel can use, and rescans daily so a new tag can’t quietly break it.",
  },
] as const;

export default function Home() {
  return (
    <main>
      <section className="hero hero-split">
        <div className="wrap hero-grid">
          <div className="hero-copy" data-reveal>
            <h1>Your site is sending data your visitors said no to.</h1>
            <p className="lede">
              Law firms are suing retailers under California’s wiretap law for exactly this, at up
              to $5,000 per violation. Consentinel loads your site twice, once refusing consent and
              once accepting it, and shows you every tracker that ignored the difference.
            </p>
            <ScanForm />
          </div>

          <div className="hero-visual" data-reveal>
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

      <section className="proof">
        <div className="wrap" data-reveal>
          <Marquee items={VENDORS} label="Catches what fires on" />
          <Marquee items={CMPS} label="Reads the banner from" reverse />
        </div>
      </section>

      <section id="fluid-end">
        <div data-reveal className="wrap">
          <h2>A cookie banner isn’t compliance.</h2>
          <p className="lede" style={{ marginTop: "1.25rem" }}>
            Most sites that get sued have a banner. The banner isn’t the problem. The tags behind it
            are.
          </p>

          <div className="tiles" id="fluid-fade">
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
        </div>
        <div className="wrap">
          <StackCards cards={FINDINGS} />
        </div>
      </section>

      <section>
        <div data-reveal className="wrap">
          <div className="split">
            <div>
              <p className="eyebrow">When a demand letter arrives</p>
              <h2>The record your lawyer asks for, already kept.</h2>
            </div>
            <p className="lede">
              A letter names a date and claims tracking without consent. The defense needs three
              things: what ran on your site that day, what your privacy policy said, and when each
              changed. Consentinel keeps all three, sealed so nobody can say the record was edited.
            </p>
          </div>

          <div className="tiles">
            <div className="tile">
              <p className="eyebrow">1 · What ran</p>
              <h3>Every scan, sealed and dated</h3>
              <p>
                Daily scans record each tag that fired after a visitor opted out, with the exact
                request as proof. Each record is hashed and chained to the one before it.
              </p>
            </div>
            <div className="tile">
              <p className="eyebrow">2 · What your policy said</p>
              <h3>Every version of your policy, saved</h3>
              <p>
                We read your privacy policy on every scan, flag vendors it never mentions, and save
                each version the day it changes. Nobody keeps old policies. Now you do.
              </p>
            </div>
            <div className="tile">
              <p className="eyebrow">3 · When it changed</p>
              <h3>A response pack in one click</h3>
              <p>
                Pick the dates a letter claims. Get every scan around them, which vendors fired and
                when they stopped, and the policy in effect, as a PDF and raw data.
              </p>
            </div>
          </div>
          <p className="center" style={{ marginTop: "1.5rem" }}>
            <Link href="/pricing">Included in Growth &rarr;</Link>
          </p>
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

      <section className="tinted">
        <div data-reveal className="wrap">
          <div className="split">
            <div>
              <p className="eyebrow">Jira integration</p>
              <h2>Close the ticket. We check the fix.</h2>
            </div>
            <p className="lede">
              Every new critical finding opens a Jira ticket with the evidence and the fix. When
              someone moves it to Done, Consentinel rescans your site and posts the verdict on the
              ticket. Nothing closes on a fix that didn’t ship.
            </p>
          </div>

          <JiraLoop />

          <div className="tiles jira-points">
            <div className="tile">
              <h3>Tickets open themselves</h3>
              <p>
                A tracker that starts firing after opt-out becomes a ticket in your project, with
                the vendor, the proof and the fix. Nobody copies findings out of a report.
              </p>
            </div>
            <div className="tile">
              <h3>Done means rescanned</h3>
              <p>
                Moving any ticket to Done triggers a fresh scan. A release that breaks consent gets
                flagged on the ticket that shipped it, not weeks later.
              </p>
            </div>
            <div className="tile">
              <h3>A record that holds up</h3>
              <p>
                Each verdict is a dated comment on the ticket: what fired, when it was fixed, and
                the scan that proves it. That’s what counsel and PCI DSS 11.6.1 reviews ask for.
              </p>
            </div>
          </div>

          <p className="jira-foot center">
            Works with Jira Cloud in about two minutes. Alongside email and Slack alerts, on Growth
            and Agency. <Link href="/pricing">See plans &rarr;</Link>
          </p>
        </div>
      </section>

      <section className="faq-section">
        <div data-reveal className="wrap qa-grid">
          <div>
            <p className="eyebrow">FAQ</p>
            <h2>Questions, answered.</h2>
            <p className="lede" style={{ marginTop: "1.25rem" }}>
              Anything else, <Link href="/contact">ask us directly</Link>.
            </p>
          </div>
          <Faq items={FAQ} />
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
              <ul className="trust">
                <li>Two-pass browser scan</li>
                <li>Hashed, dated records</li>
                <li>PCI DSS 6.4.3 · 11.6.1</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
      <FluidCursor fadeFrom="fluid-fade" fadeTo="fluid-end" />
    </main>
  );
}
