"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

export function ScanNowButton({ siteId }: { siteId: string }) {
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
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? "Could not start that scan.");
        setBusy(false);
        return;
      }
      // The scan is queued, not finished. Refresh so it appears as "running".
      setBusy(false);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  }, [busy, router, siteId]);

  return (
    <>
      <button disabled={busy} onClick={() => void run()} type="button">
        {busy ? "Starting" : "Scan now"}
      </button>
      {error !== null && <p className="form-error">{error}</p>}
    </>
  );
}
