"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SlackConnect({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: "POST" | "DELETE"): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/alerts/slack", {
        method,
        headers: { "content-type": "application/json" },
        body: method === "POST" ? JSON.stringify({ url }) : null,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Couldn't save that. Try again.");
        return;
      }
      setUrl("");
      router.refresh();
    } catch {
      setError("Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (connected) {
    return (
      <div className="dash-row">
        <span className="dash-row-name">
          Connected. New critical findings post to your channel.
        </span>
        <button
          className="link-button"
          disabled={busy}
          onClick={() => void call("DELETE")}
          type="button"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <>
      <p className="panel-note">
        In Slack, add the Incoming Webhooks app to a channel and paste its URL here. We send a test
        message to confirm it works.
      </p>
      <div className="recipient-add">
        <input
          aria-label="Slack webhook URL"
          disabled={busy}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && url.trim() !== "") void call("POST");
          }}
          placeholder="https://hooks.slack.com/services/..."
          type="url"
          value={url}
        />
        <button
          className="dash-cta"
          disabled={busy || url.trim() === ""}
          onClick={() => void call("POST")}
          type="button"
        >
          {busy ? "Testing..." : "Connect"}
        </button>
      </div>
      {error !== null && <p className="form-error panel-empty">{error}</p>}
    </>
  );
}
