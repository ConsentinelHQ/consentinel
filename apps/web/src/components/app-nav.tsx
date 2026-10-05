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
