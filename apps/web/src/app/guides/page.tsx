import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES } from "@/lib/guides";
import { REPORT } from "@/lib/research";

export const metadata: Metadata = {
  title: "Guides and tools: GPC, opt-outs and consent platform fixes",
  description:
    "Free GPC checker, state-by-state GPC law, CIPA demand letter help, opt-out research, and fix guides for OneTrust, Cookiebot, Osano, Didomi and TrustArc.",
  alternates: { canonical: "/guides" },
};

const GROUPS: { title: string; items: { href: string; name: string; blurb: string }[] }[] = [
  {
    title: "Tools",
    items: [
      {
        href: "/gpc-checker",
        name: "GPC checker",
        blurb:
          "See if your browser sends Global Privacy Control, then test whether a site obeys it.",
      },
      {
        href: "/#scan",
        name: "Free site scan",
        blurb: "Reject, accept and GPC passes, with every tag that ran when it shouldn't have.",
      },
    ],
  },
  {
    title: "Laws and legal risk",
    items: [
      {
        href: "/gpc",
        name: "Global Privacy Control by state",
        blurb: "Which states require sites to honor the signal, and what's changing January 1.",
      },
      {
        href: "/cipa-demand-letter",
        name: "Got a CIPA demand letter?",
        blurb: "What the letter claims, what to check first, and how to get the evidence.",
      },
    ],
  },
  {
    title: "Research",
    items: [
      {
        href: `/research/${REPORT.slug}`,
        name: `${REPORT.asOf} opt-out report`,
        blurb: `What kept firing after an opt-out across ${String(REPORT.sites)} US e-commerce brands.`,
      },
      {
        href: "/vendors",
        name: "Pixels that ignore opt-outs",
        blurb: "Meta, Google Ads, TikTok and more: how often each fires after a no, and the fix.",
      },
    ],
  },
];

export default function Guides() {
  return (
    <main>
      <section className="hero center">
        <div className="wrap">
          <h1>Guides and tools.</h1>
          <p className="lede">
            Everything we&apos;ve learned about why opt-outs fail, how the law treats it, and how to
            prove your site is fixed.
          </p>
        </div>
      </section>

      <section>
        <div data-reveal className="wrap">
          <h2 id="platforms">Consent platform fix guides</h2>
          <p className="lede" style={{ marginTop: "1rem" }}>
            Your consent platform says it handles Global Privacy Control. Here&apos;s where each one
            applies it, and the gaps that let ad tags fire anyway.
          </p>
          <div className="tiles" style={{ marginTop: "2rem" }}>
            {GUIDES.map((g) => (
              <Link className="tile tile-link" href={`/guides/${g.slug}`} key={g.slug}>
                <h3>{g.cmp}</h3>
                <p>{g.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {GROUPS.map((group, i) => (
        <section className={i % 2 === 0 ? "tinted" : undefined} key={group.title}>
          <div data-reveal className="wrap">
            <h2>{group.title}</h2>
            <div
              className={group.items.length === 2 ? "tiles tiles-2" : "tiles"}
              style={{ marginTop: "2rem" }}
            >
              {group.items.map((item) => (
                <Link className="tile tile-link" href={item.href} key={item.href}>
                  <h3>{item.name}</h3>
                  <p>{item.blurb}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ))}
    </main>
  );
}
