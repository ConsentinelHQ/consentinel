import { ClerkProvider } from "@clerk/nextjs";
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
  // Short in the tab, descriptive in search results.
  title: {
    default: "Consentinel",
    template: "%s | Consentinel",
  },
  description:
    "Scan any website and get evidence of trackers firing before consent, cookies dropped without permission, and personal data leaking to ad platforms.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <html className={inter.variable} lang="en">
        <body>
          <SiteNav />
          <Reveal />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
