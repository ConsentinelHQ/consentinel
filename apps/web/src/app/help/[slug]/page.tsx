import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { INTEGRATIONS } from "@/lib/integration-help";

export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return INTEGRATIONS.map((i) => ({ slug: i.slug }));
}

const find = (slug: string) => INTEGRATIONS.find((i) => i.slug === slug);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const h = find((await params).slug);
  if (!h) return {};
  return {
    title: h.title,
    description: h.description,
    alternates: { canonical: `/help/${h.slug}` },
  };
}

export default async function HelpPage({ params }: { params: Promise<{ slug: string }> }) {
  const h = find((await params).slug);
  if (!h) notFound();
  const others = INTEGRATIONS.filter((o) => o.slug !== h.slug);
  const ld = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: h.title,
    description: h.description,
    step: h.steps.map((text, i) => ({ "@type": "HowToStep", position: i + 1, text })),
  };

  return (
    <main>
      <section className="hero center">
        <div className="wrap">
          <p className="eyebrow">{h.name} setup</p>
          <h1>{h.title}</h1>
          <p className="lede">{h.short}</p>
          <p className="quiet" style={{ marginTop: "1.25rem" }}>
            Available on Growth and Agency. <Link href="/app/alerts">Open your Alerts page</Link>
          </p>
        </div>
      </section>

      <section className="tinted">
        <div data-reveal className="wrap">
          <h2>How to connect {h.name}</h2>
          <ol className="limits guide-steps" style={{ marginTop: "1.25rem" }}>
            {h.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap">
          <h2 id="fixes">Common problems</h2>
          <div className="faq">
            {h.troubleshooting.map(({ title, body }) => (
              <details className="faq-item" key={title}>
                <summary>{title}</summary>
                <p>{body}</p>
              </details>
            ))}
          </div>
          <p className="quiet" style={{ marginTop: "1.5rem" }}>
            Sources:{" "}
            {h.sources.map((s, i) => (
              <span key={s.url}>
                {i > 0 && " · "}
                <a href={s.url} rel="noopener" target="_blank">
                  {s.title}
                </a>
              </span>
            ))}
          </p>
          <p className="quiet" style={{ marginTop: "0.75rem" }}>
            Other integrations:{" "}
            {others.map((o, i) => (
              <span key={o.slug}>
                {i > 0 && " · "}
                <Link href={`/help/${o.slug}`}>{o.name}</Link>
              </span>
            ))}
          </p>
          <p className="quiet" style={{ marginTop: "0.75rem" }}>
            Still stuck? <Link href="/contact">Contact us</Link> and we&apos;ll get it working.
            {` ${h.name}`} is a trademark of its owner; Consentinel isn&apos;t affiliated with it.
          </p>
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
