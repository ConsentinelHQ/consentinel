import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScanForm } from "@/components/scan-form";
import { COMMON_FAILURES, GUIDES } from "@/lib/guides";

export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

const find = (slug: string) => GUIDES.find((g) => g.slug === slug);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const g = find((await params).slug);
  if (!g) return {};
  return {
    title: g.title,
    description: g.description,
    alternates: { canonical: `/guides/${g.slug}` },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const g = find((await params).slug);
  if (!g) notFound();
  const others = GUIDES.filter((o) => o.slug !== g.slug);
  const faq = [
    { q: `Does ${g.cmp} support Global Privacy Control?`, a: g.short },
    {
      q: `Why do trackers still fire after GPC with ${g.cmp}?`,
      a: `Usually because the tag isn't under ${g.cmp}'s control: it's hardcoded in the page, loaded by an app or another tag, or sits in a category the signal doesn't reach.`,
    },
    {
      q: `How do I test whether ${g.cmp} honors GPC on my site?`,
      a: "Load the page with Global Privacy Control on, without touching the banner, and record every request. Consentinel's free scan does exactly this and names every ad vendor that ran, with the request as proof.",
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
          <p className="eyebrow">{g.cmp} fix guide</p>
          <h1>{g.title}</h1>
          <p className="lede">{g.short}</p>
          <div style={{ marginTop: "1.75rem" }}>
            <ScanForm />
          </div>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap">
          <h2>What {g.cmp} says it does</h2>
          <ul className="limits" style={{ marginTop: "1.25rem" }}>
            {g.documented.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          <p className="quiet" style={{ marginTop: "1rem" }}>
            From {g.cmp}&apos;s own documentation, linked below.
          </p>
        </div>
      </section>

      {g.steps ? (
        <section className="tinted">
          <div data-reveal className="wrap">
            <h2>How to set it up</h2>
            <ol className="limits guide-steps" style={{ marginTop: "1.25rem" }}>
              {g.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
        </section>
      ) : (
        <section className="tinted">
          <div data-reveal className="wrap">
            <h2>Setting it up</h2>
            <p className="lede" style={{ marginTop: "1rem" }}>
              {g.cmp} doesn&apos;t publish step-by-step GPC settings. Ask your {g.cmp} contact which
              categories the signal opts out of, then test the live site. The settings page saying
              it&apos;s on isn&apos;t proof that tags stop.
            </p>
          </div>
        </section>
      )}

      <section>
        <div data-reveal className="wrap">
          <h2>Why tags still fire with {g.cmp}</h2>
          <ul className="limits" style={{ marginTop: "1.25rem" }}>
            {g.specific.map((f) => (
              <li key={f.title}>
                <strong>{f.title}.</strong> {f.body}
              </li>
            ))}
          </ul>
          <h3 style={{ marginTop: "2.5rem" }}>Gaps on every consent platform</h3>
          <ul className="limits" style={{ marginTop: "1rem" }}>
            {COMMON_FAILURES.map((f) => (
              <li key={f.title}>
                <strong>{f.title}.</strong> {f.body}
              </li>
            ))}
          </ul>
          <p className="quiet" style={{ marginTop: "1.25rem" }}>
            Which tags do this most? See <Link href="/vendors">pixels that ignore opt-outs</Link>.
          </p>
        </div>
      </section>

      <section className="tinted">
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
            Sources:{" "}
            {g.sources.map((s, i) => (
              <span key={s.url}>
                {i > 0 && " · "}
                <a href={s.url} rel="noopener" target="_blank">
                  {s.title}
                </a>
              </span>
            ))}
          </p>
          <p className="quiet" style={{ marginTop: "0.75rem" }}>
            Other platforms:{" "}
            {others.map((o, i) => (
              <span key={o.slug}>
                {i > 0 && " · "}
                <Link href={`/guides/${o.slug}`}>{o.cmp}</Link>
              </span>
            ))}
          </p>
          <p className="quiet" style={{ marginTop: "0.75rem" }}>
            This is a technical guide, not legal advice. {g.cmp} is a trademark of its owner;
            Consentinel isn&apos;t affiliated with it.
          </p>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap center">
          <h2>See what {g.cmp} is missing on your site.</h2>
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
