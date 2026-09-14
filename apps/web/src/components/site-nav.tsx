"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Nav sits in the root layout so every route gets it, including /scan.
export function SiteNav() {
  // The app shell has its own bar. Rendering both stacks two navs on /app.
  const pathname = usePathname();
  if (pathname.startsWith("/app")) return null;

  return (
    <header className="nav">
      <div className="wrap nav-inner">
        <Link className="nav-mark" href="/">
          <Image alt="" height={26} priority src="/logo.svg" width={26} />
          <span>Consentinel</span>
        </Link>
        <nav className="nav-links">
          <Link href="/how-it-works">How it works</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/contact">Contact</Link>
          <Link className="nav-cta" href="/#scan">
            Scan a site
          </Link>
        </nav>
      </div>
    </header>
  );
}
