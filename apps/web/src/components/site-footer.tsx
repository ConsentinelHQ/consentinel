"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Marketing footer. Links every public guide and tool so visitors and search
 * engines can reach them from any page. Hidden in the app and on reports.
 */
export function SiteFooter() {
  const pathname = usePathname();
  if (
    pathname.startsWith("/app") ||
    pathname.startsWith("/report") ||
    pathname.startsWith("/scan/")
  )
    return null;
  return (
    <footer className="site-footer">
      <div className="wrap site-footer-inner">
        <div>
          <p className="site-footer-mark">Consentinel</p>
          <p className="quiet">Proof your website does what your privacy promises say.</p>
          <p className="quiet">Scan only sites you’re authorized to test.</p>
        </div>
        <nav aria-label="Product">
          <p className="site-footer-head">Product</p>
          <Link href="/how-it-works">How it works</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/#scan">Free scan</Link>
        </nav>
        <nav aria-label="Guides and tools">
          <p className="site-footer-head">Guides and tools</p>
          <Link href="/gpc-checker">GPC checker</Link>
          <Link href="/gpc">Global Privacy Control by state</Link>
          <Link href="/cipa-demand-letter">Got a CIPA demand letter?</Link>
          <Link href="/research/opt-out-report-2026">2026 opt-out report</Link>
          <Link href="/vendors">Pixels that ignore opt-outs</Link>
          <Link href="/guides">Consent platform fix guides</Link>
        </nav>
        <nav aria-label="Company">
          <p className="site-footer-head">Company</p>
          <Link href="/contact">Contact</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </div>
      <div className="wrap">
        <div className="footer-base">
          <span>© {new Date().getFullYear()} Consentinel</span>
          <span>Audit-grade consent testing for e-commerce</span>
        </div>
      </div>
    </footer>
  );
}
