import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES } from "@/lib/guides";

export const metadata: Metadata = {
  title: "Consent platform fix guides: when GPC and opt-outs don't stop tags",
  description:
    "Why OneTrust, Cookiebot, Osano, Didomi and TrustArc sites still fire ad tags after an opt-out or Global Privacy Control, and how to fix each one.",
  alternates: { canonical: "/guides" },
};

export default function Guides() {
  return (
    <main>
      <section className="hero center">
        <div className="wrap">
          <h1>Your consent platform says it works. Does it?</h1>
          <p className="lede">
            Where each platform handles Global Privacy Control, the gaps that let ad tags fire
            anyway, and how to prove they&apos;re closed.
          </p>
        </div>
      </section>
      <section>
        <div data-reveal className="wrap">
          <div className="tiles">
            {GUIDES.map((g) => (
              <Link className="tile tile-link" href={`/guides/${g.slug}`} key={g.slug}>
                <h3>{g.cmp}</h3>
                <p>{g.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
