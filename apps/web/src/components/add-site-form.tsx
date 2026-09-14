"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";

export function AddSiteForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (event: FormEvent): Promise<void> => {
      event.preventDefault();
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/sites", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url }),
        });
        if (!response.ok) {
          const data = (await response.json()) as { error?: string };
          setError(data.error ?? "Could not add that site.");
          setBusy(false);
          return;
        }
        setUrl("");
        setBusy(false);
        router.refresh();
      } catch {
        setError("Could not reach the server. Try again.");
        setBusy(false);
      }
    },
    [busy, router, url],
  );

  return (
    <form className="add-site" onSubmit={(e) => void submit(e)}>
      <input
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://yourstore.com"
        required
        type="url"
        value={url}
      />
      <button disabled={busy} type="submit">
        {busy ? "Adding" : "Add site"}
      </button>
      {error !== null && <p className="form-error">{error}</p>}
    </form>
  );
}
