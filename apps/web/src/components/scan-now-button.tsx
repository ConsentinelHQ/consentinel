"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

export function ScanNowButton({
  siteId,
  inFlight = false,
}: {
  siteId: string;
  inFlight?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/sites/${siteId}/scan`, { method: "POST" });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string; scanId?: string };
        // Lost a race with another tab or a double click: the scan exists, just show it.
        if (response.status === 409 && data.scanId) {
          setBusy(false);
          router.refresh();
          return;
        }
        setError(data.error ?? "Couldn’t start that scan.");
        setBusy(false);
        return;
      }
      // The scan is queued, not finished. Refresh so it appears as "running".
      setBusy(false);
      router.refresh();
    } catch {
      setError("Couldn’t reach the server.");
      setBusy(false);
    }
  }, [busy, router, siteId]);

  return (
    <>
      <button disabled={busy || inFlight} onClick={() => void run()} type="button">
        {inFlight ? "Scanning..." : busy ? "Starting..." : "Scan now"}
      </button>
      {error !== null && <p className="form-error">{error}</p>}
    </>
  );
}
