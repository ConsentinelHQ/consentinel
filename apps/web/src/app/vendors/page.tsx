import type { Metadata } from "next";
import Link from "next/link";
import { REPORT, VENDORS } from "@/lib/research";

export const metadata: Metadata = {
  title: "Which tracking pixels ignore opt-outs: vendor guides",
  description:
    "How often the Meta Pixel, Google Ads, TikTok Pixel, Klaviyo and other tags keep firing after a visitor opts out, why it happens, and how to fix each one.",
  alternates: { canonical: "/vendors" },
};

export default function Vendors() {
  return (
    <main>
      <section className="hero center">
        <div className="wrap">
          <h1>Tracking pixels that ignore opt-outs.</h1>
          <p className="lede">
            How often each vendor kept firing after a visitor said no, across {REPORT.sites} US
            e-commerce brands we tested, why it happens, and how to fix it.
          </p>
        </div>
      </section>
      <section>
        <div data-reveal className="wrap">
          <div className="tiles">
            {VENDORS.map((v) => (
              <Link className="tile tile-link" href={`/vendors/${v.slug}`} key={v.slug}>
                <h3>{v.name}</h3>
                <p>
                  Still firing on {v.share}% of the brands in our data. {v.what}
                </p>
              </Link>
            ))}
          </div>
          <p className="quiet" style={{ marginTop: "1.5rem" }}>
            Figures from the{" "}
            <Link href={`/research/${REPORT.slug}`}>{REPORT.asOf} opt-out report</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
