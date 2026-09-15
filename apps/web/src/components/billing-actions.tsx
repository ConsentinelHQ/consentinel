"use client";

import { useState } from "react";

type Action = "checkout" | "portal";

/** Both buttons do the same thing: POST, then follow the URL Stripe returns. */
export function BillingActions({ action, label }: { action: Action; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/billing/${action}`, { method: "POST" });
      const data: unknown = await response.json();
      const url = typeof data === "object" && data !== null ? (data as { url?: string }).url : null;
      if (!response.ok || !url) {
        const message =
          typeof data === "object" && data !== null
            ? ((data as { error?: string }).error ?? "Something went wrong.")
            : "Something went wrong.";
        setError(message);
        setBusy(false);
        return;
      }
      window.location.href = url;
    } catch {
      setError("Could not reach Stripe. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="billing-actions">
      <button type="button" onClick={() => void go()} disabled={busy}>
        {busy ? "One moment..." : label}
      </button>
      {error ? <p className="quiet">{error}</p> : null}
    </div>
  );
}
