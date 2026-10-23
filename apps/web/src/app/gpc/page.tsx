import type { Metadata } from "next";
import { CountUp } from "@/components/count-up";
import { DeadlineCountdown } from "@/components/deadline-countdown";
import { ScanForm } from "@/components/scan-form";
import { StatCard } from "@/components/stat-card";
import { StripeGradient } from "@/components/stripe-gradient";

export const metadata: Metadata = {
  title: "Global Privacy Control in 2027: AB 566 and every state law",
  description:
    "From January 1, 2027, California's Opt Me Out Act (AB 566) requires every browser to offer Global Privacy Control. Which states require sites to honor it, which browsers send it today, the enforcement record, and how to check your tags.",
  alternates: { canonical: "/gpc" },
};

const REVIEWED = "October 23, 2026";

type Browser = { name: string; today: "native" | "extension" | "none"; note: string };

// Status as of the review date. Sources linked under the grid.
const BROWSERS: Browser[] = [
  { name: "Firefox", today: "native", note: "Setting in Privacy & Security" },
  { name: "Brave", today: "native", note: "On by default" },
  { name: "DuckDuckGo", today: "native", note: "On by default" },
  { name: "Chrome", today: "extension", note: "Extension only today" },
  { name: "Edge", today: "extension", note: "Extension only today" },
  { name: "Safari", today: "none", note: "No built-in setting today" },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "What does the Opt Me Out Act (AB 566) require?",
    a: "From January 1, 2027, any business that develops or maintains a browser must include an easy-to-find setting that sends an opt-out preference signal, such as Global Privacy Control, to every site the visitor uses. It amends the CCPA and was signed on October 8, 2025.",
  },
  {
    q: "Does AB 566 put new obligations on my website?",
    a: "No new ones. California already requires businesses that sell or share personal information to treat the signal as a valid opt-out. What changes is volume: once Chrome, Edge, and Safari offer the setting, far more visitors will send it.",
  },
  {
    q: "Do I have to show that I honored the signal?",
    a: 'Yes, in California. Regulations effective January 1, 2026 require displaying whether the opt-out preference signal was processed. The California Privacy Protection Agency cites an "Opt-Out Request Honored" message as a compliant way to do it.',
  },
  {
    q: "Does SB 690 change any of this?",
    a: "No. SB 690, signed September 30, 2026, ends private lawsuits under CIPA's pen register provision from January 1, 2027. It doesn't change the duty to honor Global Privacy Control, and it leaves CIPA's wiretap provision, the basis of most website tracking suits, untouched.",
  },
  {
    q: "How do I check whether my site honors it?",
    a: "Load the page with Global Privacy Control on, don't touch the banner, and watch which advertising tags still load or set cookies. Consentinel does this on every scan and lists each vendor that ignored the signal, with the request that proves it.",
  },
];

const FAQ_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};
const BRAND = ["#7038FF", "#6EC3F4", "#FFFFFF", "#EF008F", "#FFBA27", "#00D68F"];

type Row = {
  state: string;
  law: string;
  since: string;
  source?: { label: string; url: string };
  note?: string;
};

// Chronological. Dates verified against official state sources where linked.
const STATES: Row[] = [
  {
    state: "California",
    law: "California Consumer Privacy Act, as amended by the CPRA",
    since: "Recognized since 2021",
    source: { label: "California Attorney General", url: "https://oag.ca.gov/privacy/ccpa/gpc" },
  },
  {
    state: "Colorado",
    law: "Colorado Privacy Act",
    since: "July 1, 2024",
    source: { label: "Colorado Attorney General", url: "https://coag.gov/opt-out/" },
  },
  {
    state: "Connecticut",
    law: "Connecticut Data Privacy Act",
    since: "January 1, 2025",
    source: {
      label: "Connecticut Attorney General",
      url: "https://portal.ct.gov/ag/sections/privacy/the-connecticut-data-privacy-act",
    },
  },
  { state: "Montana", law: "Montana Consumer Data Privacy Act", since: "January 1, 2025" },
  { state: "New Hampshire", law: "New Hampshire Privacy Act, RSA 507-H", since: "January 1, 2025" },
  { state: "Texas", law: "Texas Data Privacy and Security Act", since: "January 1, 2025" },
  {
    state: "Nebraska",
    law: "Nebraska Data Privacy Act",
    since: "2025",
    note: "Narrower than other states. Check the statute for how it applies to you.",
  },
  {
    state: "New Jersey",
    law: "New Jersey Data Privacy Act",
    since: "July 15, 2025",
    source: {
      label: "NJ Division of Consumer Affairs",
      url: "https://www.njconsumeraffairs.gov/ocp/Pages/NJ-Data-Privacy-Law-FAQ.aspx",
    },
  },
  { state: "Minnesota", law: "Minnesota Consumer Data Privacy Act", since: "July 31, 2025" },
  {
    state: "Delaware",
    law: "Delaware Personal Data Privacy Act",
    since: "January 1, 2026",
    source: {
      label: "Delaware Department of Justice",
      url: "https://attorneygeneral.delaware.gov/fraud/personal-data-privacy-portal/frequently-asked-questions/",
    },
  },
  {
    state: "Oregon",
    law: "Oregon Consumer Privacy Act",
    since: "January 1, 2026",
    source: {
      label: "Oregon Department of Justice",
      url: "https://www.doj.state.or.us/consumer-protection/id-theft-data-breaches/privacy/",
    },
  },
  {
    state: "Maryland",
    law: "Maryland Online Data Privacy Act",
    since: "April 1, 2026",
    note: "Applies to processing from April 1, 2026. Some practitioners read the signal requirement as less explicit than other states'.",
  },
];

export default function GpcPage() {
  return (
    <main>
      <section className="hero center gpc-hero">
        <div aria-hidden="true" className="gpc-hero-bg">
          <StripeGradient amplitude={200} colors={BRAND} />
        </div>
        <div className="wrap">
          <h1>Global Privacy Control: which states require it.</h1>
          <p className="lede">
            At least twelve US states now require websites to treat the Global Privacy Control
            signal as a valid opt-out of sale and targeted advertising. From January 1, 2027, every
            browser has to offer it. Here is each state, the browser deadline, and what honoring the
            signal actually takes.
          </p>
          <div className="gpc-stats">
            <StatCard
              jump={{ label: "See every state, date, and source", href: "#states" }}
              label="states require sites to honor it"
              sources={[
                {
                  label: "Baker Data Counsel, State Privacy in Brief, Q1 2026",
                  url: "https://www.bakerdatacounsel.com/blogs/state-privacy-in-brief-q1-2026/",
                },
              ]}
              title="Twelve states now make it a legal requirement"
              value={<CountUp to={12} />}
            >
              <p>
                California, Colorado, Connecticut, Montana, New Hampshire, Texas, Nebraska, New
                Jersey, Minnesota, Delaware, Oregon, and Maryland. Colorado was the first to write
                it into statute in 2024. Five more turned it on in 2025, and three more in 2026.
              </p>
              <p>
                In each, a visitor whose browser sends the signal has opted out of the sale of their
                data and targeted advertising, with no click required.
              </p>
            </StatCard>
            <StatCard
              label="of sites that must honor it actually do"
              sources={[
                {
                  label: "Hausladen et al., Wesleyan and Princeton, USENIX Security 2025",
                  url: "https://www.usenix.org/conference/usenixsecurity25/presentation/hausladen",
                },
              ]}
              title="Fewer than half of sites comply"
              value={<CountUp suffix="%" to={45} />}
            >
              <p>
                Researchers at Wesleyan and Princeton crawled 11,708 US websites and checked whether
                sites legally required to honor Global Privacy Control actually stopped sharing data
                when it was on. 45% did.
              </p>
              <p>
                The usual cause isn’t a missing banner. It’s tags that never hear the visitor&apos;s
                choice.
              </p>
            </StatCard>
            <StatCard
              label="Healthline settlement, 2025"
              sources={[
                {
                  label: "California Attorney General press release, July 1, 2025",
                  url: "https://oag.ca.gov/node/604800",
                },
                {
                  label: "Covington, Inside Privacy",
                  url: "https://www.insideprivacy.com/ccpa/california-attorney-general-announces-1-55m-ccpa-settlement-with-healthline-com/",
                },
              ]}
              title="The largest CCPA settlement at the time"
              value={<CountUp decimals={2} prefix="$" suffix="M" to={1.55} />}
            >
              <p>
                California&apos;s Attorney General tested Healthline.com&apos;s opt-out and found
                trackers kept running after visitors said no. Healthline paid $1.55 million and
                agreed to three years of compliance reporting.
              </p>
              <p>
                Its own explanation: its privacy compliance vendor &quot;may not have properly
                identified and blocked all relevant online trackers&quot; after a visitor opted out.
                The banner worked. The trackers didn’t listen.
              </p>
            </StatCard>
          </div>
          <p className="quiet" style={{ marginTop: "1.5rem" }}>
            Last reviewed {REVIEWED}. This is a reference, not legal advice.
          </p>
        </div>
      </section>

      <section className="deadline">
        <div data-reveal className="wrap">
          <div className="deadline-head">
            <div>
              <span className="deadline-kicker">California Opt Me Out Act, AB 566</span>
              <h2 id="browsers">Every browser has to offer it by January 1, 2027.</h2>
            </div>
            <DeadlineCountdown />
          </div>
          <p className="lede" style={{ marginTop: "1rem" }}>
            Until now, honoring the signal was easy to get wrong without anyone noticing, because
            few visitors sent it. Most browsers didn&apos;t offer it. California&apos;s new law
            changes that: browsers must include an easy-to-find setting that sends an opt-out signal
            to every site. Chrome, Edge, and Safari together carry most US traffic, and none of them
            sends the signal natively today.
          </p>

          <ul className="browser-grid">
            {BROWSERS.map((b, i) => (
              <li
                className={`browser-card ${b.today}`}
                key={b.name}
                style={{ animationDelay: `${String(i * 80)}ms` }}
              >
                <span className="browser-name">{b.name}</span>
                <span className="browser-status">
                  <span aria-hidden="true" className="browser-dot" />
                  {b.today === "native" ? "Sends it today" : "Required by Jan 1"}
                </span>
                <span className="browser-note">{b.note}</span>
              </li>
            ))}
          </ul>
          <p className="quiet" style={{ marginTop: "1rem" }}>
            Sources:{" "}
            <a
              href="https://calmatters.digitaldemocracy.org/bills/ca_202520260ab566"
              rel="noopener noreferrer"
              target="_blank"
            >
              AB 566 bill text and status
            </a>
            ,{" "}
            <a
              href="https://iapp.org/news/a/california-governor-signs-new-law-requiring-in-browser-opt-out-preference-signal"
              rel="noopener noreferrer"
              target="_blank"
            >
              IAPP
            </a>
            ,{" "}
            <a
              href="https://www.cookiebot.com/en/global-privacy-control/"
              rel="noopener noreferrer"
              target="_blank"
            >
              browser support, July 2026
            </a>
            . Browser support changes; check each vendor&apos;s release notes.
          </p>

          <ul className="limits">
            <li>
              <strong>Opt-outs stop being rare.</strong> A tag that ignores the signal today affects
              a few privacy-minded visitors. In 2027 it could affect a large share of your traffic.
            </li>
            <li>
              <strong>The failure is silent.</strong> Your banner can work perfectly and still let
              ad tags run, because the signal arrives without anyone clicking anything.
            </li>
            <li>
              <strong>You have to show it worked.</strong> California requires sites to display
              whether they processed the signal, for example &quot;Opt-Out Request Honored&quot;.
            </li>
          </ul>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap">
          <h2 id="states">The states</h2>
          <div className="law-table-wrap">
            <table className="law-table">
              <thead>
                <tr>
                  <th>State</th>
                  <th>Law</th>
                  <th>Required since</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {STATES.map((row) => (
                  <tr key={row.state}>
                    <td className="law-state">{row.state}</td>
                    <td>
                      {row.law}
                      {row.note && <span className="law-note">{row.note}</span>}
                    </td>
                    <td className="law-date">{row.since}</td>
                    <td>
                      {row.source ? (
                        <a href={row.source.url} rel="noopener noreferrer" target="_blank">
                          {row.source.label}
                        </a>
                      ) : (
                        <span className="quiet">State statute</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="quiet" style={{ marginTop: "1rem" }}>
            States with a comprehensive privacy law but no signal requirement yet include Virginia,
            Utah, Iowa, Indiana, Tennessee, and Kentucky. Laws change; confirm against the current
            statute before relying on a date.
          </p>
        </div>
      </section>

      <section className="tinted">
        <div data-reveal className="wrap">
          <h2>The enforcement record</h2>
          <ul className="limits">
            <li>
              <strong>Sephora paid $1.2 million in 2022</strong> to settle California&apos;s claim
              that it failed to process opt-outs sent through Global Privacy Control, the first
              enforcement action built on the signal.{" "}
              <a
                href="https://oag.ca.gov/news/press-releases/attorney-general-bonta-announces-settlement-sephora-part-ongoing-enforcement"
                rel="noopener noreferrer"
                target="_blank"
              >
                California Attorney General
              </a>
            </li>
            <li>
              <strong>Healthline paid $1.55 million in 2025</strong>, at the time the largest CCPA
              settlement, after trackers kept running for visitors who had opted out.{" "}
              <a href="https://oag.ca.gov/node/604800" rel="noopener noreferrer" target="_blank">
                California Attorney General
              </a>
            </li>
            <li>
              <strong>
                California, Colorado, and Connecticut ran a joint sweep in September 2025
              </strong>{" "}
              targeting businesses that don’t honor Global Privacy Control.{" "}
              <a
                href="https://cppa.ca.gov/announcements/2025/20250909.html"
                rel="noopener noreferrer"
                target="_blank"
              >
                California Privacy Protection Agency
              </a>
            </li>
            <li>
              <strong>Fewer than half of sites that must honor it actually do.</strong> A Wesleyan
              and Princeton study of 11,708 US sites found 45% compliance.{" "}
              <a
                href="https://www.usenix.org/conference/usenixsecurity25/presentation/hausladen"
                rel="noopener noreferrer"
                target="_blank"
              >
                USENIX Security 2025
              </a>
            </li>
          </ul>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap">
          <h2>What honoring it actually takes</h2>
          <p className="lede" style={{ marginTop: "1rem" }}>
            Most sites that fail aren’t ignoring the law. Their consent platform reads the signal
            correctly, and some tags never hear about it.
          </p>
          <ul className="limits">
            <li>
              <strong>Tags wired outside the consent gate.</strong> A pixel added straight to the
              theme or a tag manager without a consent check fires no matter what the banner
              decided.
            </li>
            <li>
              <strong>Tags loaded by other tags.</strong> One ad tag can trigger cookie syncs with a
              dozen partners. Gating the partners does nothing if the tag that loads them still
              runs.
            </li>
            <li>
              <strong>Platform signals that never get passed along.</strong> On Shopify, the consent
              app has to tell Shopify&apos;s Customer Privacy API the visitor opted out, or Shopify
              sets its own marketing cookies anyway.
            </li>
          </ul>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap">
          <h2 id="faq">Questions</h2>
          <div className="faq">
            {FAQ.map(({ q, a }) => (
              <details className="faq-item" key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
          <p className="quiet" style={{ marginTop: "1rem" }}>
            Last reviewed {REVIEWED}. This is a reference, not legal advice.
          </p>
        </div>
      </section>

      <section className="tinted">
        <div data-reveal className="wrap center">
          <h2>Check your site before January 1.</h2>
          <p className="lede" style={{ marginTop: "1rem", marginInline: "auto" }}>
            Consentinel loads your page with Global Privacy Control on, without touching the banner,
            and lists every ad vendor that ran anyway, with the request that proves it. It also
            checks whether your site confirms the opt-out.
          </p>
          <div style={{ marginTop: "1.5rem" }}>
            <ScanForm />
          </div>
        </div>
      </section>
      <script
        // Static, server-built JSON. No user input reaches it.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_LD) }}
        type="application/ld+json"
      />
    </main>
  );
}
