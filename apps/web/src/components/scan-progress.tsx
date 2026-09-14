"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Indeterminate progress for a scan in flight, plus polling.
 *
 * A scan takes about a minute and the page is server-rendered, so without this
 * the row sits on "queued" until the user thinks to refresh.
 */
export function ScanProgress({ status }: { status: string }) {
  const router = useRouter();
  const active = status === "queued" || status === "running";

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      router.refresh();
    }, 4000);
    return () => {
      window.clearInterval(id);
    };
  }, [active, router]);

  if (!active) return null;
  return <span aria-label="Scan in progress" className="scan-progress" role="status" />;
}
