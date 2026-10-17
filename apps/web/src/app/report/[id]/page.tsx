import type { Metadata } from "next";
import { getReportBranding, shareTokenMatches } from "@consentinel/db";
import type { CSSProperties } from "react";
import { PrintButton } from "@/components/print-button";
import { ScanResultView } from "@/components/scan-result-view";
import { db } from "@/lib/server";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Branding only applies behind a valid token. Without one the page is the free,
 * redacted view, and an agency's name shouldn't decorate a stranger's guess.
 */
async function brandFor(id: string, token: string | undefined) {
  if (!token || !UUID.test(id)) return null;
  const database = db();
  if (!(await shareTokenMatches(database, id, token))) return null;
  return getReportBranding(database, id);
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params;
  const { t } = await searchParams;
  const brand = await brandFor(id, t);
  return {
    title: brand ? { absolute: `Privacy report | ${brand.brandName}` } : "Consent report",
    robots: { index: false },
  };
}

/**
 * A shared report. No session required: the token in the query string is the
 * credential, and ScanResultView forwards it to the API.
 */
export default async function SharedReport({ params, searchParams }: Props) {
  const { id } = await params;
  const { t } = await searchParams;
  const brand = await brandFor(id, t);

  if (brand) {
    // Logos are agency-hosted <img>, so there is no next/image domain list per customer.
    const style = { "--brand": brand.brandColor ?? "#1d1d1f" } as CSSProperties;
    const mark = (
      <span className="wl-mark">
        {brand.brandLogoUrl ? (
          <img alt="" height={28} referrerPolicy="no-referrer" src={brand.brandLogoUrl} />
        ) : (
          <span className="wl-initial">{brand.brandName.charAt(0).toUpperCase()}</span>
        )}
        <span>{brand.brandName}</span>
      </span>
    );
    return (
      <main className="wl-report" style={style}>
        <header className="wl-header">
          <div className="wrap wl-header-inner">
            {brand.brandWebsite ? (
              <a href={brand.brandWebsite} rel="noopener" target="_blank">
                {mark}
              </a>
            ) : (
              mark
            )}
            <div className="wl-header-actions">
              <span className="wl-tag">Privacy compliance report</span>
              <PrintButton />
            </div>
          </div>
        </header>
        <section className="hero">
          <div className="wrap">
            <ScanResultView branded scanId={id} shareToken={t} />
          </div>
        </section>
        <footer className="wl-footer">
          <div className="wrap">
            Prepared by {brand.brandName}. This report was shared with you and isn’t publicly
            listed.
          </div>
        </footer>
      </main>
    );
  }

  return (
    <main>
      <section className="hero">
        <div className="wrap">
          {t ? (
            <div className="report-toolbar">
              <PrintButton />
            </div>
          ) : null}
          <ScanResultView scanId={id} shareToken={t} />
          <div className="report-cta">
            <h3>Know the moment this changes.</h3>
            <p className="quiet">
              Consentinel rescans your site on a schedule and emails you when a new tag fires before
              consent - before a regulator or a plaintiff finds it.
            </p>
            <a className="nav-cta" href="/pricing">
              Start monitoring
            </a>
          </div>
        </div>
      </section>
      <footer>
        <div className="wrap">
          Consentinel. This report was shared with you and isn’t publicly listed.
        </div>
      </footer>
    </main>
  );
}
