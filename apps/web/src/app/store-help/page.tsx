import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Consentinel for Shopify: help",
  description:
    "How the Consentinel Shopify app checks your store's opt-outs, what it reads, and how billing works.",
  alternates: { canonical: "/store-help" },
};

const FAQ: { q: string; a: string }[] = [
  {
    q: "What does the app check?",
    a: "It loads your storefront three ways: after Reject all, after Accept all, and with Global Privacy Control on. It lists every ad vendor that keeps tracking after a shopper opts out, with the request that proves it. You don't need to install anything in your browser. Our scanner sends the opt-out signal itself.",
  },
  {
    q: "What does it read from my store?",
    a: "Two read-only permissions. Themes: we read your live theme's code files to show the exact file and line where each ad tag is hardcoded, and whether it has a consent check. Privacy settings: we check whether Shopify's cookie banner is on and whether your “Do not sell or share” page is managed by Shopify. We never change your theme, and we don't access customers or orders.",
  },
  {
    q: "How do I fix a tag that keeps firing?",
    a: "Open the app and click Edit code next to the tag. It opens your theme code editor on that file. Wrap the tag in Shopify's customer privacy API, or move it to Settings > Customer events so Shopify gates it on consent.",
  },
  {
    q: "How does billing work?",
    a: "The first scan is free and you can rescan any time. Daily monitoring is $99 a month after a 7-day free trial, billed by Shopify on your Shopify invoice. Start, change or cancel it from the app in your Shopify admin. Uninstalling the app cancels it.",
  },
  {
    q: "My scan says the store is password protected.",
    a: "We can only test what shoppers see. Turn off the storefront password in Online Store > Preferences, then click Try again in the app.",
  },
];

/** Linked from the App Store listing. No site nav: nothing here leads to web checkout. */
export default function ShopifyHelp() {
  return (
    <main>
      <section className="hero">
        <div className="wrap">
          <div className="legal">
            <h1 style={{ marginInline: 0 }}>Consentinel for Shopify</h1>
            <p className="lede" style={{ marginTop: "1rem" }}>
              Find every ad tracker that keeps running after a shopper opts out, and the theme file
              it&apos;s installed in.
            </p>
            {FAQ.map(({ q, a }) => (
              <div key={q}>
                <h2>{q}</h2>
                <p>{a}</p>
              </div>
            ))}
            <h2>Support</h2>
            <p>
              Email <a href="mailto:charlie@consentinelhq.com">charlie@consentinelhq.com</a>. We
              reply within one business day. Read our <a href="/privacy">privacy policy</a>.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
