"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";
import { Turnstile } from "./turnstile";

export function ScanForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | undefined>(undefined);

  const onToken = useCallback((value: string | undefined) => setToken(value), []);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, turnstileToken: token }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        setError(readError(data));
        setBusy(false);
        return;
      }
      const scanId = (data as { scanId?: string }).scanId;
      if (!scanId) {
        setError("The scan could not be started. Try again.");
        setBusy(false);
        return;
      }
      router.push(`/scan/${scanId}`);
    } catch {
      setError("The scan could not be started. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <form className="scanbar" onSubmit={(e) => void submit(e)}>
        <input
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="yourstore.com"
          aria-label="Website address"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy}
        />
        <button type="submit" disabled={busy || url.trim().length === 0}>
          {busy ? "Starting" : "Scan"}
        </button>
      </form>
      <Turnstile onToken={onToken} />
      <p className="quiet">Free. No account. Results in about a minute.</p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

function readError(data: unknown): string {
  if (data && typeof data === "object" && "error" in data) {
    const message = (data as { error?: unknown }).error;
    if (typeof message === "string") return message;
  }
  return "The scan could not be started. Try again.";
}
