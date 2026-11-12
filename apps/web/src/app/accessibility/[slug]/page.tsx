import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScanForm } from "@/components/scan-form";
import { A11Y_GUIDES } from "@/lib/a11y-guides";

export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return A11Y_GUIDES.map((g) => ({ slug: g.slug }));
}

const find = (slug: string) => A11Y_GUIDES.find((g) => g.slug === slug);

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
    alternates: { canonical: `/accessibility/${g.slug}` },
  };
}

export default async function A11yGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const g = find((await params).slug);
  if (!g) notFound();
  const others = A11Y_GUIDES.filter((o) => o.slug !== g.slug);
  const ld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: g.faq.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };

  return (
    <main>
      <section className="hero center">
        <div className="wrap">
          <p className="eyebrow">{g.eyebrow}</p>
          <h1>{g.title}</h1>
          <p className="lede">{g.short}</p>
        </div>
      </section>

      {g.sections.map((s, i) => (
        <section className={i % 2 === 0 ? "tinted" : undefined} key={s.title}>
          <div data-reveal className="wrap">
            <h2>{s.title}</h2>
            <ul className="limits">
              {s.body.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <section className={g.sections.length % 2 === 0 ? "tinted" : undefined}>
        <div data-reveal className="wrap">
          <h2 id="faq">Questions</h2>
          <div className="faq">
            {g.faq.map(({ q, a }) => (
              <details className="faq-item" key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
          {g.sources && (
            <p className="quiet" style={{ marginTop: "1.25rem" }}>
              Sources:{" "}
              {g.sources.map((s, i) => (
                <span key={s.url}>
                  {i > 0 && ", "}
                  <a href={s.url} rel="noopener" target="_blank">
                    {s.title}
                  </a>
                </span>
              ))}
            </p>
          )}
          <p style={{ marginTop: "1.25rem" }}>
            More guides:{" "}
            {others.map((o, i) => (
              <span key={o.slug}>
                {i > 0 && " · "}
                <Link href={`/accessibility/${o.slug}`}>{o.title}</Link>
              </span>
            ))}
          </p>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap center">
          <h2>Find every issue on your site.</h2>
          <p className="lede" style={{ marginTop: "1rem", marginInline: "auto" }}>
            A free scan checks WCAG 2.2 AA and your cookie banner, and shows the fix for each issue.
            Automated checks catch a share of issues, not all of them.
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
