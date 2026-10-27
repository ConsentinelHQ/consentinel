import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScanForm } from "@/components/scan-form";
import { POPULATION, REPORT, VENDORS } from "@/lib/research";

export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return VENDORS.map((v) => ({ slug: v.slug }));
}

const find = (slug: string) => VENDORS.find((v) => v.slug === slug);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const v = find((await params).slug);
  if (!v) return {};
  return {
    title: `Does ${v.name} respect opt-outs and Global Privacy Control?`,
    description: `${v.name} was still firing after a visitor opted out on ${String(v.share)}% of ${String(REPORT.sites)} e-commerce brands we tested. Why it happens and how to fix it.`,
    alternates: { canonical: `/vendors/${v.slug}` },
  };
}

export default async function VendorPage({ params }: { params: Promise<{ slug: string }> }) {
  const v = find((await params).slug);
  if (!v) notFound();
  const others = VENDORS.filter((o) => o.slug !== v.slug);
  const faq = [
    {
      q: `Does ${v.name} respect Global Privacy Control on its own?`,
      a: `Not reliably. Whether ${v.name} stops for an opt-out depends on how it's installed on your site. On ${String(v.sites)} of the ${String(REPORT.sites)} brands in our data, it kept firing after the visitor opted out.`,
    },
    { q: `How do I stop ${v.name} after an opt-out?`, a: v.fix },
    {
      q: `How do I check whether ${v.name} fires on my site after an opt-out?`,
      a: `Load the page with Global Privacy Control on, or after clicking reject, and watch whether ${v.name} still sends requests or sets cookies. Consentinel's free scan does this and names every vendor that ran, with the request as proof.`,
    },
  ];
  const ld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
  return (
    <main>
      <section className="hero center">
        <div className="wrap">
          <p className="eyebrow">Vendor guide</p>
          <h1>Does {v.name} respect opt-outs?</h1>
          <p className="lede">
            On {v.share}% of the {REPORT.sites} US e-commerce brands we found tracking after an
            opt-out, {v.name} was one of the tags still firing.
          </p>
          <div style={{ marginTop: "1.75rem" }}>
            <ScanForm />
          </div>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap">
          <div className="research-stats">
            <div className="research-stat">
              <p className="stat">{v.share}%</p>
              <p className="quiet">
                of brands in our data had {v.name} firing after an opt-out ({v.sites} of{" "}
                {REPORT.sites})
              </p>
            </div>
          </div>
          <p className="quiet" style={{ marginTop: "1rem" }}>
            {POPULATION} <Link href={`/research/${REPORT.slug}`}>Read the full report</Link>.
          </p>
        </div>
      </section>

      <section className="tinted">
        <div data-reveal className="wrap">
          <h2>What it is</h2>
          <p className="lede" style={{ marginTop: "1rem" }}>
            {v.what}
          </p>
          <h2 style={{ marginTop: "2.5rem" }}>Why it keeps firing</h2>
          <p className="lede" style={{ marginTop: "1rem" }}>
            {v.how}
          </p>
          <h2 style={{ marginTop: "2.5rem" }}>How to fix it</h2>
          <p className="lede" style={{ marginTop: "1rem" }}>
            {v.fix}
          </p>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap">
          <h2 id="faq">Questions</h2>
          <div className="faq">
            {faq.map(({ q, a }) => (
              <details className="faq-item" key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
          <p className="quiet" style={{ marginTop: "1.5rem" }}>
            Other vendors:{" "}
            {others.map((o, i) => (
              <span key={o.slug}>
                {i > 0 && " · "}
                <Link href={`/vendors/${o.slug}`}>{o.name}</Link>
              </span>
            ))}
          </p>
        </div>
      </section>

      <section className="tinted">
        <div data-reveal className="wrap center">
          <h2>Check {v.name} on your site.</h2>
          <p className="lede" style={{ marginTop: "1rem", marginInline: "auto" }}>
            Free, about a minute. We test reject, accept and Global Privacy Control, and name every
            tag that ran when it shouldn&apos;t have.
          </p>
          <div style={{ marginTop: "1.5rem" }}>
            <ScanForm />
          </div>
        </div>
      </section>
      <script
        // Static, server-built JSON. No user input reaches it.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
        type="application/ld+json"
      />
    </main>
  );
}
