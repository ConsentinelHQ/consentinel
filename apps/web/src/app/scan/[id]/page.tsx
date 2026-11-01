import { ScanResultView } from "@/components/scan-result-view";

export const dynamic = "force-dynamic";

export default async function ScanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lead?: string | string[] }>;
}) {
  const { id } = await params;
  // From the "your scan is ready" email: they already gave us their address.
  const { lead } = await searchParams;
  return (
    <main>
      <section className="hero center">
        <div className="wrap">
          <ScanResultView leadId={typeof lead === "string" ? lead : undefined} scanId={id} upsell />
        </div>
      </section>
      <footer>
        <div className="wrap">Consentinel. Scan only sites you’re authorized to test.</div>
      </footer>
    </main>
  );
}
