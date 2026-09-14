import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { Reveal } from "@/components/reveal";
import { SiteNav } from "@/components/site-nav";
import "./globals.css";

// Self-hosted at build time, so no runtime request to Google and no layout shift.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Consentinel - see which trackers fire before consent",
  description:
    "Scan any website and get evidence of trackers firing before consent, cookies dropped without permission, and personal data leaking to ad platforms.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className={inter.variable} lang="en">
      <body>
        <SiteNav />
        <Reveal />
        {children}
      </body>
    </html>
  );
}
