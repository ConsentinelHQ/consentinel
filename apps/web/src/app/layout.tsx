import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { Reveal } from "@/components/reveal";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import "./globals.css";

// Self-hosted at build time, so no runtime request to Google and no layout shift.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

// Display serif for headlines. Self-hosted from the package, so no network at build.
const newsreader = localFont({
  src: "../../node_modules/@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2",
  display: "swap",
  variable: "--font-newsreader",
  weight: "200 800",
});

export const metadata: Metadata = {
  // Short in the tab, descriptive in search results.
  title: {
    default: "Consentinel",
    template: "%s | Consentinel",
  },
  description:
    "Scan any website and get evidence of trackers firing before consent, cookies dropped without permission, and personal data leaking to ad platforms.",
  metadataBase: new URL("https://www.getconsentinel.com"),
  // Google Search Console HTML-tag verification. Set the token in Vercel; absent, no tag.
  ...(process.env["GOOGLE_SITE_VERIFICATION"]
    ? { verification: { google: process.env["GOOGLE_SITE_VERIFICATION"] } }
    : {}),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <html className={`${inter.variable} ${newsreader.variable}`} lang="en">
        <body>
          <SiteNav />
          <Reveal />
          {children}
          <SiteFooter />
        </body>
      </html>
    </ClerkProvider>
  );
}
