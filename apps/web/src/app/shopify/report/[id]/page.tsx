import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { shareTokenMatches } from "@consentinel/db";
import { PrintButton } from "@/components/print-button";
import { ScanResultView } from "@/components/scan-result-view";
import { db } from "@/lib/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Store privacy report",
  robots: { index: false },
};

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Full report for a merchant who opened it from the Shopify app. No site nav,
 * no pricing, no upsells: Shopify merchants are billed only through Shopify,
 * so nothing here leads to web checkout. Valid share token required.
 */
export default async function ShopifyReport({ params, searchParams }: Props) {
  const { id } = await params;
  const { t } = await searchParams;
  if (!t || !UUID.test(id) || !(await shareTokenMatches(db(), id, t))) notFound();

  return (
    <main className="shopify-report">
      <section className="hero">
        <div className="wrap">
          <div className="report-toolbar">
            <PrintButton />
          </div>
          <ScanResultView branded scanId={id} shareToken={t} />
        </div>
      </section>
      <footer>
        <div className="wrap">
          Consentinel for Shopify. Manage monitoring from the Consentinel app in your Shopify admin.
        </div>
      </footer>
    </main>
  );
}
