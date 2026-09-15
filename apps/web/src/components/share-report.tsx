"use client";

import { useState } from "react";

/** Mints a share link for a scan and puts it on the clipboard. */
export function ShareReport({ scanId }: { scanId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/scans/${scanId}/share`, { method: "POST" });
      const data: unknown = await response.json();
      const link =
        typeof data === "object" && data !== null ? (data as { url?: string }).url : null;
      if (!response.ok || !link) {
        const message =
          typeof data === "object" && data !== null
            ? ((data as { error?: string }).error ?? "Could not create a link.")
            : "Could not create a link.";
        setError(message);
        setBusy(false);
        return;
      }
      setUrl(link);
      // Clipboard can fail silently in some browsers. The link is shown either way.
      try {
        await navigator.clipboard.writeText(link);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    } catch {
      setError("Could not reach the server. Try again.");
    }
    setBusy(false);
  }

  if (url) {
    return (
      <div className="share-report">
        <p className="quiet">{copied ? "Link copied." : "Share this link:"}</p>
        <code className="share-link">{url}</code>
      </div>
    );
  }

  return (
    <div className="share-report">
      <button disabled={busy} onClick={() => void create()} type="button">
        {busy ? "Creating..." : "Create share link"}
      </button>
      {error !== null && <p className="form-error">{error}</p>}
    </div>
  );
}
