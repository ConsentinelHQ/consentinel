import type { Metadata } from "next";
import Link from "next/link";
import { ScanForm } from "@/components/scan-form";

export const metadata: Metadata = {
  title: "Free website accessibility checker: WCAG 2.2 AA scan with fixes",
  description:
    "Free accessibility checker for online stores. Scan any page against WCAG 2.2 AA and get a 0-100 score, every issue with the element it's on, and how to fix it. No overlay, no account.",
  alternates: { canonical: "/accessibility-checker" },
};

const FAQ: { q: string; a: string }[] = [
  {
    q: "Is the accessibility check free?",
    a: "Yes. Scan any page on a site you're authorized to test. No account, no install. You get a 0-100 score and the top issues right away; enter your email for the full list.",
  },
  {
    q: "What does it check?",
    a: "Automated WCAG 2.2 A and AA rules, run with axe-core, the open-source engine most accessibility teams use. That covers things like missing alt text, low color contrast, buttons and links without a name, form fields without labels, and a missing page language.",
  },
  {
    q: "Does a good score mean my site is ADA compliant?",
    a: "No. Automated checks catch a share of issues. Others, like whether alt text actually describes the image or whether a checkout works with a keyboard, need a person to test. Treat the score as a monitor that catches regressions, not a certification.",
  },
  {
    q: "I already have an accessibility widget. Do I need this?",
    a: "A widget changes how the page looks for visitors who open it. It doesn't fix the underlying code, and the issues claims cite are still there for screen readers. The scan checks the page as shipped, with or without a widget.",
  },
  {
    q: "Why are online stores targeted?",
    a: "Most ADA website lawsuits are filed against online stores, and most cite the same few automated failures. Those are also the fastest to fix, which is why a regular check pays off.",
  },
  {
    q: "Does it check privacy too?",
    a: "Yes. The same scan tests your cookie banner: it rejects, accepts and sends Global Privacy Control, then lists every ad tag that kept tracking after a visitor said no.",
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

const CHECKS = [
  {
    title: "Images missing alt text",
    body: "Product photos and buttons made of images that a screen reader can't describe.",
  },
  {
    title: "Text contrast too low",
    body: "Light text on light backgrounds, sale badges and placeholder text that fail the 4.5:1 ratio.",
  },
  {
    title: "Buttons and links without a name",
    body: "Icon-only cart, search and menu buttons that announce as just “button”.",
  },
  {
    title: "Form fields without labels",
    body: "Email signups and search boxes a screen reader can't identify.",
  },
] as const;

export default function AccessibilityChecker() {
  return (
    <main>
      <section className="hero center">
        <div className="wrap">
          <p className="bgpc-eyebrow">Accessibility checker</p>
          <h1>Check your site for accessibility issues.</h1>
          <p className="lede">
            A free WCAG 2.2 AA scan of any page. You get a 0-100 score, every issue with the element
            it&apos;s on, and how to fix it. No overlay, nothing to install.
          </p>
          <div style={{ marginTop: "1.75rem" }}>
            <ScanForm />
          </div>
        </div>
      </section>

      <section className="tinted">
        <div data-reveal className="wrap">
          <h2>What it catches</h2>
          <p className="lede" style={{ marginTop: "1rem" }}>
            These are the issues accessibility claims against online stores cite most. Most are
            quick fixes in your theme.
          </p>
          <div className="tiles" style={{ marginTop: "1.75rem" }}>
            {CHECKS.map((c) => (
              <div className="tile" key={c.title}>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap">
          <h2>What the scan does</h2>
          <ul className="limits">
            <li>
              <strong>Loads the page like a visitor.</strong> A real Chromium browser renders the
              page, including anything scripts add after load.
            </li>
            <li>
              <strong>Runs automated WCAG 2.2 A and AA rules.</strong> The same axe-core engine most
              accessibility teams use, with no extra rules of our own.
            </li>
            <li>
              <strong>Shows the element and the fix.</strong> Each issue lists where it is, why it
              fails and what to change. Paid plans add a screenshot of the element.
            </li>
            <li>
              <strong>Checks privacy in the same pass.</strong> Your cookie banner is tested for
              reject, accept and Global Privacy Control.
            </li>
          </ul>
          <p className="quiet" style={{ marginTop: "1.25rem" }}>
            Automated checks catch a share of accessibility issues, not all of them. This is a
            technical test, not a compliance certification or legal advice.
          </p>
        </div>
      </section>

      <section className="tinted">
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
          <p style={{ marginTop: "1.25rem" }}>
            On Shopify? The{" "}
            <a href="https://apps.shopify.com/consentinel-1?utm_source=consentinel&utm_medium=site&utm_campaign=accessibility-checker">
              Shopify app
            </a>{" "}
            runs the same scan from your admin.
          </p>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap center">
          <h2>Theme edits and new apps break things.</h2>
          <p className="lede" style={{ marginTop: "1rem", marginInline: "auto" }}>
            Monitoring rescans your site and emails you when a new accessibility or privacy issue
            shows up. <Link href="/pricing">See plans</Link>
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
