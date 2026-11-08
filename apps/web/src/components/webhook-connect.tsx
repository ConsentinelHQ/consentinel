"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Paste-a-webhook connect flow, shared by Slack and Teams. */
export function WebhookConnect({
  connected,
  endpoint,
  name,
  label,
  placeholder,
}: {
  connected: boolean;
  endpoint: string;
  /** Shown in copy, e.g. "Slack" or "Teams". */
  name: string;
  label: string;
  placeholder: string;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function test(): Promise<void> {
    setBusy(true);
    setError(null);
    setSent(false);
    const res = await fetch(`${endpoint}/test`, { method: "POST" }).catch(() => null);
    if (res?.ok) setSent(true);
    else {
      const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
      setError(data?.error ?? `${name} didn't accept the test. Reconnect with a new link.`);
    }
    setBusy(false);
  }

  async function call(method: "POST" | "DELETE"): Promise<void> {
    if (busy) return; // Enter plus a click would connect twice and post two test cards
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
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
      <>
        <div className="dash-row">
          <span className="dash-row-name">
            Connected. New critical findings post to your {name} channel.
          </span>
          <span className="webhook-actions">
            <button
              className="link-button is-positive"
              disabled={busy}
              onClick={() => void test()}
              type="button"
            >
              {busy ? "Sending..." : "Send test"}
            </button>
            <button
              className="link-button"
              disabled={busy}
              onClick={() => void call("DELETE")}
              type="button"
            >
              Disconnect
            </button>
          </span>
        </div>
        {sent ? <p className="panel-note">Test sent. Check your {name} channel.</p> : null}
        {error !== null && <p className="form-error panel-empty">{error}</p>}
      </>
    );
  }

  return (
    <>
      <div className="recipient-add">
        <input
          aria-label={label}
          disabled={busy}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && url.trim() !== "") void call("POST");
          }}
          placeholder={placeholder}
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
