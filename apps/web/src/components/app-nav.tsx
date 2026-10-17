"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const SVG = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

interface Item {
  href: string;
  label: string;
  icon: ReactNode;
  match: (path: string) => boolean;
}

const ITEMS: Item[] = [
  {
    href: "/app",
    label: "Overview",
    match: (p) => p === "/app",
    icon: (
      <svg {...SVG}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/app/sites",
    label: "Sites",
    // Scans live under a site, so they light up Sites.
    match: (p) => p.startsWith("/app/sites") || p.startsWith("/app/scans"),
    icon: (
      <svg {...SVG}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
    ),
  },
  {
    href: "/app/portfolio",
    label: "Portfolio",
    match: (p) => p.startsWith("/app/portfolio"),
    icon: (
      <svg {...SVG}>
        <path d="M3 7h18v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" />
      </svg>
    ),
  },
  {
    href: "/app/alerts",
    label: "Alerts",
    match: (p) => p.startsWith("/app/alerts"),
    icon: (
      <svg {...SVG}>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    ),
  },
  {
    href: "/app/branding",
    label: "Branding",
    match: (p) => p.startsWith("/app/branding"),
    icon: (
      <svg {...SVG}>
        <path d="M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3 3h-2a2 2 0 0 0-1 3.7c.6.4.6 2.3-3 2.3z" />
        <circle cx="7.5" cy="11" r="1" />
        <circle cx="11" cy="7.5" r="1" />
        <circle cx="16" cy="8.5" r="1" />
      </svg>
    ),
  },
  {
    href: "/app/billing",
    label: "Billing",
    match: (p) => p.startsWith("/app/billing"),
    icon: (
      <svg {...SVG}>
        <rect x="2.5" y="5" width="19" height="14" rx="2" />
        <path d="M2.5 10h19" />
      </svg>
    ),
  },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="App" className="side-nav">
      {ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={active ? "side-link is-active" : "side-link"}
            href={item.href}
            key={item.href}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
