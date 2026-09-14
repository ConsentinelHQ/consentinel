import Link from "next/link";
import { ScanResultView } from "@/components/scan-result-view";

export const dynamic = "force-dynamic";

/**
 * Same report, inside the app shell. The public /scan/[id] route exists for the
 * anonymous funnel; a signed-in user clicking through from their own site list
 * should not be dropped back onto the marketing site.
 */
export default async function AppScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="wrap app-content">
      <p className="quiet">
        <Link href="/app">Sites</Link>
      </p>
      <ScanResultView scanId={id} />
    </div>
  );
}
