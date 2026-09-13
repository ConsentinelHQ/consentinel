import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Consentinel - see which trackers fire before consent",
  description:
    "Scan any website and get evidence of trackers firing before consent, cookies dropped without permission, and personal data leaking to ad platforms.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
