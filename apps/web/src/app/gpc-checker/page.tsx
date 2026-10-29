import type { Metadata } from "next";
import Link from "next/link";
import { BrowserGpcCheck } from "@/components/browser-gpc-check";
import { ScanForm } from "@/components/scan-form";

export const metadata: Metadata = {
  title: "GPC checker: test your browser and your site for Global Privacy Control",
  description:
    "Free GPC checker. See instantly whether your browser sends Global Privacy Control, then test whether your site obeys it, with every ad tag that kept running and the request that proves it.",
  alternates: { canonical: "/gpc-checker" },
};

const FAQ: { q: string; a: string }[] = [
  {
    q: "Is the GPC check free?",
    a: "Yes. Scan any page on a site you're authorized to test. No account, no install.",
  },
  {
    q: "How do I check if my browser sends GPC?",
    a: "Open this page. The live check reads both places a site can see the signal: the Sec-GPC request header and navigator.globalPrivacyControl in page scripts.",
  },
  {
    q: "How is this different from a GPC browser extension?",
    a: "An extension shows that your browser sent the signal. It can't tell you whether the site's tags obeyed it. We record every request the page makes with the signal on and name each ad vendor that ran anyway.",
  },
  {
    q: "My consent platform says GPC is supported. Isn't that enough?",
    a: "It means the platform reads the signal. Tags wired outside it, or loaded by other tags, still fire. That gap is what California found at Healthline, which paid $1.55 million after trackers kept running for visitors who opted out.",
  },
  {
    q: "Which states require sites to honor GPC?",
    a: "At least twelve, including California, Colorado, Connecticut, Texas and New Jersey. From January 1, 2027, every browser has to offer the setting.",
  },
  {
    q: "Do I have to show visitors the signal was honored?",
    a: 'In California, yes. Regulations effective January 1, 2026 require showing whether the opt-out preference signal was processed, for example with an "Opt-Out Request Honored" message. The check looks for one.',
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

export default function GpcChecker() {
  return (
    <main>
      <section className="hero center">
        <div className="wrap">
          <p className="bgpc-eyebrow">GPC checker</p>
          <h1>Does your site honor Global Privacy Control?</h1>
          <p className="lede">
            First, see if your own browser sends the signal. Then test a site: we load it with GPC
            on and list every ad tag that kept running, with the request that proves it.
          </p>
          <BrowserGpcCheck />
        </div>
      </section>

      <section className="tinted" id="site-check">
        <div data-reveal className="wrap center">
          <h2>Now test a site.</h2>
          <p className="lede" style={{ marginTop: "1rem" }}>
            Free, no account. Results in about a minute.
          </p>
          <div style={{ marginTop: "1.75rem" }}>
            <ScanForm />
          </div>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap">
          <h2>What the test does</h2>
          <ul className="limits">
            <li>
              <strong>Sends the signal the way a browser does.</strong> A clean Chromium browser
              sends the <code>Sec-GPC: 1</code> header to every host and sets{" "}
              <code>navigator.globalPrivacyControl</code> before any page script runs.
            </li>
            <li>
              <strong>Leaves the banner alone.</strong> GPC is an opt-out with no click, so nothing
              is accepted or rejected.
            </li>
            <li>
              <strong>Records everything the page sends.</strong> Every request and cookie is
              matched against a fixed library of ad and analytics vendors.
            </li>
            <li>
              <strong>Compares with a normal visit.</strong> Separate passes reject and accept
              cookies, so you see which tags stopped for the signal and which ignored it.
            </li>
            <li>
              <strong>Checks for a confirmation.</strong> California requires showing that the
              signal was processed. We look for it on the page.
            </li>
          </ul>
        </div>
      </section>

      <section className="tinted">
        <div data-reveal className="wrap">
          <h2>Reading the result</h2>
          <ul className="limits">
            <li>
              <strong>Kept running:</strong> advertising vendors that loaded with the signal on.
              These are the ones to fix, usually by gating them in your tag manager or consent
              platform.
            </li>
            <li>
              <strong>Stopped:</strong> vendors that ran after accept but not with the signal on.
              Your setup works for these.
            </li>
            <li>
              <strong>Confirmation:</strong> whether the page showed that the opt-out was honored.
            </li>
          </ul>
          <p style={{ marginTop: "1.25rem" }}>
            Want the law behind it? Read{" "}
            <Link href="/gpc">which states require Global Privacy Control</Link>.
          </p>
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
            This is a technical test, not legal advice.
          </p>
        </div>
      </section>

      <section className="tinted">
        <div data-reveal className="wrap center">
          <h2>Run the check again whenever tags change.</h2>
          <p className="lede" style={{ marginTop: "1rem", marginInline: "auto" }}>
            New tags break opt-outs all the time. Monitoring rescans daily and emails you when a
            vendor starts ignoring the signal. <Link href="/pricing">See plans</Link>
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
