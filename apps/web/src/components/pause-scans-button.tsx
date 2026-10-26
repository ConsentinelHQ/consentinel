"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Holds scheduled scans without losing the cadence. Manual scans keep working. */
export function PauseScansButton({ siteId, paused }: { siteId: string; paused: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/sites/${siteId}/pause`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paused: !paused }),
    });
    setBusy(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Couldn’t update the schedule. Try again.");
      return;
    }
    router.refresh();
  };

  return (
    <div className="pause-scans">
      <button disabled={busy} onClick={() => void toggle()} type="button">
        {busy ? (paused ? "Resuming..." : "Pausing...") : paused ? "Resume scans" : "Pause scans"}
      </button>
      {error !== null && <p className="form-error">{error}</p>}
    </div>
  );
}
