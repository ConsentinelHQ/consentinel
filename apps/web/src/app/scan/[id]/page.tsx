import { ScanResultView } from "@/components/scan-result-view";

export const dynamic = "force-dynamic";

export default async function ScanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lead?: string | string[]; live?: string | string[] }>;
}) {
  const { id } = await params;
  // From the "your scan is ready" email: they already gave us their address.
  const { lead, live } = await searchParams;
  // Live view: ?live=1 while we try it, everywhere once LIVE_SCAN=1.
  const liveView = live === "1" || process.env["LIVE_SCAN"] === "1";
  return (
    <main>
      <section className="hero center">
        <div className="wrap">
          <ScanResultView
            leadId={typeof lead === "string" ? lead : undefined}
            liveView={liveView}
            scanId={id}
            upsell
          />
        </div>
      </section>
      <footer>
        <div className="wrap">Consentinel. Scan only sites you’re authorized to test.</div>
      </footer>
    </main>
  );
}
