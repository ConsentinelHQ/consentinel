import { ScanResultView } from "@/components/scan-result-view";

export const dynamic = "force-dynamic";

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main>
      <section className="hero center">
        <div className="wrap">
          <ScanResultView scanId={id} />
        </div>
      </section>
      <footer>
        <div className="wrap">Consentinel. Scan only sites you are authorised to test.</div>
      </footer>
    </main>
  );
}
