import type { Metadata } from "next";
import Link from "next/link";
import { BarList } from "@/components/bar-list";
import { ScanForm } from "@/components/scan-form";
import { OTHER_VENDORS, POPULATION, REPORT, SEGMENTS, VENDORS, pct } from "@/lib/research";

export const metadata: Metadata = {
  title: "Who keeps tracking after visitors opt out: 313 e-commerce brands",
  description:
    "Consentinel's 2026 opt-out report. Across 313 US e-commerce brands where trackers kept firing after a visitor opted out, Meta ran on 47%, Google Ads on 45% and TikTok on 36%. 86% were caught with Global Privacy Control.",
  alternates: { canonical: `/research/${REPORT.slug}` },
};

const vendorRows = [
  ...VENDORS.map((v) => ({
    name: v.name,
    value: v.share,
    display: `${String(v.share)}%`,
    href: `/vendors/${v.slug}`,
    title: `${v.name}: ${String(v.sites)} of ${String(REPORT.sites)} brands`,
  })),
  ...OTHER_VENDORS.map((v) => ({
    name: v.name,
    value: v.share,
    display: `${String(v.share)}%`,
    title: `${v.name}: ${String(v.sites)} of ${String(REPORT.sites)} brands`,
  })),
];

const segmentRows = SEGMENTS.map((s) => ({
  name: s.segment,
  value: s.sites,
  display: `${String(s.sites)} brands`,
  title: `${s.segment}: ${String(s.sites)} brands (${String(pct(s.sites))}%)`,
}));

const CITE = `Consentinel, "${REPORT.title}" (${REPORT.asOf}), https://www.getconsentinel.com/research/${REPORT.slug}`;

const LD = {
  "@context": "https://schema.org",
  "@type": "Dataset",
  name: `${REPORT.title}: ${String(REPORT.sites)} US e-commerce brands`,
  description: POPULATION,
  url: `https://www.getconsentinel.com/research/${REPORT.slug}`,
  creator: { "@type": "Organization", name: "Consentinel", url: "https://www.getconsentinel.com" },
  dateModified: "2026-10-26",
  license: "https://creativecommons.org/licenses/by/4.0/",
  distribution: {
    "@type": "DataDownload",
    encodingFormat: "text/csv",
    contentUrl: `https://www.getconsentinel.com/research/${REPORT.slug}/data.csv`,
  },
};

export default function OptOutReport() {
  const gpcShare = pct(REPORT.underGpc);
  return (
    <main>
      <section className="hero center">
        <div className="wrap">
          <p className="eyebrow">Consentinel research · {REPORT.asOf}</p>
          <h1>Who keeps tracking after visitors opt out.</h1>
          <p className="lede">
            We tested {REPORT.sites} US e-commerce brands whose trackers kept running after a
            visitor said no. Meta ran on {VENDORS[0]?.share}% of them. Most were caught by the
            browser opt-out signal every browser has to offer from January 1, 2027.
          </p>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap">
          <div className="research-stats">
            <div className="research-stat">
              <p className="stat">{REPORT.sites}</p>
              <p className="quiet">brands with trackers firing after an opt-out</p>
            </div>
            <div className="research-stat">
              <p className="stat">{gpcShare}%</p>
              <p className="quiet">
                caught with Global Privacy Control on ({REPORT.underGpc} brands). The other{" "}
                {REPORT.afterReject} kept tracking after a reject click.
              </p>
            </div>
            <div className="research-stat">
              <p className="stat">{REPORT.medianCritical}</p>
              <p className="quiet">critical findings on the median brand</p>
            </div>
          </div>
          <p className="quiet" style={{ marginTop: "1rem" }}>
            {POPULATION}
          </p>
        </div>
      </section>

      <section className="tinted">
        <div data-reveal className="wrap">
          <h2>Which trackers ignore the opt-out</h2>
          <p className="lede" style={{ marginTop: "1rem" }}>
            Share of the {REPORT.sites} brands where each vendor was among the tags still firing. A
            brand usually has several, so the shares add up to more than 100%.
          </p>
          <BarList
            label="Share of brands by vendor firing after an opt-out"
            max={50}
            rows={vendorRows}
          />
        </div>
      </section>

      <section>
        <div data-reveal className="wrap">
          <h2>What we found</h2>
          <ul className="limits">
            <li>
              <strong>The biggest ad platforms lead.</strong> Meta ({VENDORS[0]?.share}%), Google
              Ads ({VENDORS[1]?.share}%) and TikTok ({VENDORS[2]?.share}%) were the most common
              trackers still running after an opt-out. These are the tags that matter most for ad
              targeting, and the ones regulators and plaintiffs name.
            </li>
            <li>
              <strong>Most had no reject button to click.</strong> On {gpcShare}% of the brands
              there was no reject control we could use, so we tested the Global Privacy Control
              signal instead. That&apos;s how most US visitors will opt out once Chrome, Edge and
              Safari have to offer it.
            </li>
            <li>
              <strong>Marketing tools count too.</strong> Klaviyo ({VENDORS[3]?.share}%) and
              Attentive ({VENDORS[6]?.share}%) power signup forms, so stores treat them as part of
              the site. They also track browsing for email and SMS marketing.
            </li>
            <li>
              <strong>A working banner isn&apos;t enough.</strong> On many of these sites the
              consent platform worked. Tags wired outside it kept running anyway, the same gap
              behind California&apos;s $1.55 million Healthline settlement.{" "}
              <Link href="/gpc">More on that</Link>
            </li>
          </ul>
        </div>
      </section>

      <section className="tinted">
        <div data-reveal className="wrap">
          <h2>By category</h2>
          <p className="lede" style={{ marginTop: "1rem" }}>
            Number of brands in the data by category. This reflects which brands we tested, not
            which categories leak more.
          </p>
          <BarList label="Brands in the data by category" max={90} rows={segmentRows} />
        </div>
      </section>

      <section>
        <div data-reveal className="wrap">
          <h2 id="method">How we tested</h2>
          <ul className="limits">
            <li>
              <strong>Clean browsers, real opt-outs.</strong> Each homepage was loaded in fresh
              Chromium browsers: once clicking the consent banner&apos;s reject button where one
              existed, once accepting, and once with Global Privacy Control on and no click.
            </li>
            <li>
              <strong>Two scans had to agree.</strong> A vendor counts only if it fired after the
              opt-out in two separate scans and never waited for consent in either.
            </li>
            <li>
              <strong>Fixed signatures, no guessing.</strong> Requests and cookies were matched
              against a fixed library of ad and analytics vendors. Store platforms and consent tools
              are left out.
            </li>
            <li>
              <strong>What this data can&apos;t say.</strong> Brands that passed aren&apos;t in it,
              so it doesn&apos;t show what share of all stores leak, and brands aren&apos;t named.
              Scans ran through {REPORT.asOf}.
            </li>
          </ul>
          <p style={{ marginTop: "1.25rem" }}>
            <a download href={`/research/${REPORT.slug}/data.csv`}>
              Download the data (CSV)
            </a>
          </p>
          <p className="quiet" style={{ marginTop: "1rem" }}>
            Free to cite and republish with a link (CC BY 4.0). Cite as: {CITE}
          </p>
        </div>
      </section>

      <section className="tinted">
        <div data-reveal className="wrap center">
          <h2>Is your store in the next report?</h2>
          <p className="lede" style={{ marginTop: "1rem", marginInline: "auto" }}>
            Run the same test on your site. Free, about a minute, and it lists every tag that ran
            after the opt-out, with the request that proves it.
          </p>
          <div style={{ marginTop: "1.5rem" }}>
            <ScanForm />
          </div>
        </div>
      </section>
      <script
        // Static, server-built JSON. No user input reaches it.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(LD) }}
        type="application/ld+json"
      />
    </main>
  );
}
