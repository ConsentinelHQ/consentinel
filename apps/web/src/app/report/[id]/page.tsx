import type { Metadata } from "next";
import { ScanResultView } from "@/components/scan-result-view";

export const metadata: Metadata = { title: "Consent report", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * A shared report. No session required: the token in the query string is the
 * credential, and ScanResultView forwards it to the API.
 */
export default async function SharedReport({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;

  return (
    <main>
      <section className="hero">
        <div className="wrap">
          <ScanResultView scanId={id} shareToken={t} />
        </div>
      </section>
      <footer>
        <div className="wrap">
          Consentinel. This report was shared with you and is not publicly listed.
        </div>
      </footer>
    </main>
  );
}
