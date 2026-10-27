import type { Metadata } from "next";
import Link from "next/link";
import { ScanForm } from "@/components/scan-form";

export const metadata: Metadata = {
  title: "Got a CIPA demand letter? What to do first, and what SB 690 changes",
  description:
    "A CIPA demand letter claims the tags on your site wiretapped or tracked visitors without consent. What to do in the first 48 hours, which claims SB 690 ends on January 1, 2027, and the evidence that matters.",
  alternates: { canonical: "/cipa-demand-letter" },
};

const REVIEWED = "October 26, 2026";

type Source = { label: string; url: string };

const SRC = {
  jmbm: {
    label: "Jeffer Mangels Butler & Mitchell, Website Privacy Lawsuits Under CIPA (Aug 28, 2026)",
    url: "https://articles.jeffer.com/2026/08/28/website-privacy-lawsuits-under-cipa-current-state-of-the-law/",
  },
  harris: {
    label: "Harris Beach Murtha, California CIPA Demand Letters (Jul 1, 2026)",
    url: "https://www.harrisbeachmurtha.com/insights/california-cipa-demand-letters-what-businesses-need-to-know-and-do/",
  },
  covington: {
    label: "Covington, Inside Privacy: Governor Signs SB 690 (Oct 5, 2026)",
    url: "https://www.insideprivacy.com/state-privacy/california-governor-signs-sb-690-eliminating-private-website-based-cipa-pen-register-claims-and-calling-for-broader-cipa-reform/",
  },
  klg: {
    label: "K&L Gates, SB 690 Ends Pen Register and Trap-and-Trace Claims (Oct 8, 2026)",
    url: "https://www.klgates.com/thought-leadership/California-Narrows-CIPA-Litigation-SB-690-Ends-Pen-Register-and-Trap-and-Trace-Claims-10-8-2026",
  },
  aaaa: {
    label: "4A's, Received a CIPA Demand Letter? (Aug 2026)",
    url: "https://www.aaaa.org/blog/guest-post-received-a-cipa-demand-letter-heres-what-to-do-next-a-practical-guide-for-agencies-and-brands/",
  },
  phillips: {
    label: "Jonathan L.A. Phillips, CIPA & Website Tracking Litigation (Jul 2026)",
    url: "https://www.jlaplaw.com/blog/2026/7/19/cipa-amp-website-tracking-litigation-a-working-resource-for-ecommerce-businesses",
  },
} satisfies Record<string, Source>;

const STEPS: { title: string; body: string; source: Source }[] = [
  {
    title: "Preserve before you change anything.",
    body: "Put a hold on tag manager and consent platform settings, change logs, your privacy policy, and vendor contracts. Fixing the site first can erase the record you need to show what it actually did.",
    source: SRC.harris,
  },
  {
    title: "Capture what the site does today.",
    body: "Record a page load before and after consent: every request, cookie and identifier, and how the banner behaves. Counsel will ask for this before anything else.",
    source: SRC.harris,
  },
  {
    title: "Tell your insurer.",
    body: "Cyber and general liability policies can cover defense costs, and many require early notice.",
    source: SRC.aaaa,
  },
  {
    title: "Talk to privacy counsel before you reply.",
    body: "Don't respond to the claimant or describe your technology until a lawyer has reviewed the letter. Don't ignore it, and don't pay it without an assessment.",
    source: SRC.phillips,
  },
  {
    title: "Find the section the letter cites.",
    body: "SB 690 treats the claims differently, so the section number changes how much leverage you have. See the table below.",
    source: SRC.klg,
  },
];

const CLAIMS: { section: string; theory: string; what: string; sb690: string }[] = [
  {
    section: "§ 631(a)",
    theory: "Wiretapping",
    what: "Reading the contents of a communication in transit without every party's consent. Plaintiffs point to chat, search terms, form inputs and session replay.",
    sb690: "Not affected. Private suits continue.",
  },
  {
    section: "§ 632",
    theory: "Recording a confidential communication",
    what: "Recording a confidential communication without consent.",
    sb690: "Not affected.",
  },
  {
    section: "§ 638.51",
    theory: "Pen register / trap and trace",
    what: "Tags and pixels that capture routing or addressing data such as IP addresses and identifiers. Easier to plead, and behind most recent filings.",
    sb690:
      "From January 1, 2027, only the Attorney General can bring claims about websites and apps. Applies to pending claims in actions filed on or after January 1, 2025.",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "How much can a CIPA claim cost?",
    a: "Section 637.2 allows the greater of $5,000 per violation or three times actual damages, with no need to prove actual harm. Whether a violation is each visit, each transmission or each person is contested, which is what makes class claims expensive.",
  },
  {
    q: "My letter cites section 638.51. Is it dead?",
    a: "Not automatically. SB 690 takes effect January 1, 2027 and applies to pending claims in actions filed on or after January 1, 2025. Plaintiffs may challenge the retroactive part, and a letter can be reframed as a wiretap claim under section 631, which SB 690 doesn't touch. Ask counsel how it applies to yours.",
  },
  {
    q: "Doesn't my cookie banner protect me?",
    a: "Only if the tags actually wait for it. The pattern behind most claims, and behind California's $1.55 million Healthline settlement, is a banner that works while some trackers keep running after the visitor says no.",
  },
  {
    q: "Does SB 690 change my obligations under the CCPA?",
    a: "No. It narrows private CIPA lawsuits. The Attorney General and the California Privacy Protection Agency still enforce opt-out rights, including honoring Global Privacy Control, which every browser has to offer from January 1, 2027.",
  },
  {
    q: "Can Consentinel show what my site did on the date in the letter?",
    a: "Only for dates we were already scanning. Monitoring keeps a sealed, dated record of every scan and every version of your privacy policy, and the demand letter pack pulls the ones around the claimed dates. If the letter comes first, a scan today still shows what runs now and starts the record that proves when a fix took effect.",
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

export default function DemandLetterGuide() {
  return (
    <main>
      <section className="hero center">
        <div className="wrap">
          <h1>Got a CIPA demand letter? Start here.</h1>
          <p className="lede">
            A demand letter under California&apos;s Invasion of Privacy Act claims the tags on your
            site wiretapped or tracked a visitor without consent. Here&apos;s what to do in the
            first 48 hours, which claims SB 690 ends on January 1, 2027, and the evidence that
            matters.
          </p>
          <div style={{ marginTop: "1.75rem" }}>
            <ScanForm />
          </div>
          <p className="quiet" style={{ marginTop: "0.75rem" }}>
            Scan the page named in the letter to see what runs after a visitor opts out.
          </p>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap">
          <h2>The first 48 hours</h2>
          <ol className="limits">
            {STEPS.map((s) => (
              <li key={s.title}>
                <strong>{s.title}</strong> {s.body}{" "}
                <a className="quiet" href={s.source.url} rel="noopener noreferrer">
                  Source
                </a>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="tinted">
        <div data-reveal className="wrap">
          <h2 id="claims">Which claim is it?</h2>
          <p className="lede" style={{ marginTop: "1rem" }}>
            Most letters cite one or more of three sections of the California Penal Code. SB 690,
            signed September 30, 2026, treats them very differently.
          </p>
          <div className="law-table-wrap">
            <table className="law-table">
              <thead>
                <tr>
                  <th>Section</th>
                  <th>What plaintiffs claim</th>
                  <th>After SB 690</th>
                </tr>
              </thead>
              <tbody>
                {CLAIMS.map((c) => (
                  <tr key={c.section}>
                    <td className="law-state">
                      {c.section}
                      <span className="law-note">{c.theory}</span>
                    </td>
                    <td>{c.what}</td>
                    <td>{c.sb690}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="quiet" style={{ marginTop: "1rem" }}>
            Sources: <a href={SRC.jmbm.url}>{SRC.jmbm.label}</a>;{" "}
            <a href={SRC.covington.url}>{SRC.covington.label}</a>;{" "}
            <a href={SRC.klg.url}>{SRC.klg.label}</a>.
          </p>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap">
          <h2>The evidence that decides it</h2>
          <p className="lede" style={{ marginTop: "1rem" }}>
            Almost every claim comes down to the same three questions, and each needs a record from
            the date the letter names.
          </p>
          <ul className="limits">
            <li>
              <strong>What ran on the site.</strong> Which tags fired, and whether they waited for
              consent or kept going after the visitor said no.
            </li>
            <li>
              <strong>What your privacy policy said.</strong> Whether it disclosed the vendors that
              were running at the time.
            </li>
            <li>
              <strong>When each one changed.</strong> When a tag was added, when it was fixed, and
              when the policy was updated.
            </li>
          </ul>
          <p style={{ marginTop: "1.25rem" }}>
            Consentinel keeps all three: sealed daily scans, every version of your policy, and a{" "}
            <Link href="/pricing">demand letter pack</Link> that pulls the records around the dates
            a letter claims.
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
          <p className="quiet" style={{ marginTop: "1rem" }}>
            Last reviewed {REVIEWED}. This is general information, not legal advice. Talk to a
            lawyer about your letter. See also{" "}
            <Link href="/gpc">Global Privacy Control and state law</Link>.
          </p>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap center">
          <h2>See what a plaintiff&apos;s scanner sees.</h2>
          <p className="lede" style={{ marginTop: "1rem", marginInline: "auto" }}>
            Consentinel loads your page in clean browsers: once rejecting cookies, once accepting,
            and once with Global Privacy Control on. It lists every tag that ran when it
            shouldn&apos;t have, with the request that proves it.
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
