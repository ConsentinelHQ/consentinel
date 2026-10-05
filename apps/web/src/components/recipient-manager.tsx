"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RecipientManager({
  recipients,
  limit,
}: {
  recipients: { id: string; email: string }[];
  limit: number;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = recipients.length >= limit;

  async function call(method: "POST" | "DELETE", body: object): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/alerts/recipients", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Couldn't save that. Try again.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Couldn't save that. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(): Promise<void> {
    const value = email.trim().toLowerCase();
    if (!EMAIL.test(value)) {
      setError("That doesn't look like an email address.");
      return;
    }
    if (await call("POST", { email: value })) setEmail("");
  }

  return (
    <>
      {recipients.length > 0 && (
        <ul className="panel-list">
          {recipients.map((r) => (
            <li key={r.id}>
              <div className="dash-row">
                <span className="dash-row-name">{r.email}</span>
                <button
                  className="link-button"
                  disabled={busy}
                  onClick={() => void call("DELETE", { id: r.id })}
                  type="button"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="recipient-add">
        <input
          aria-label="Email address"
          disabled={busy || full}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          placeholder={full ? `Limit of ${String(limit)} reached` : "name@company.com"}
          type="email"
          value={email}
        />
        <button
          className="dash-cta"
          disabled={busy || full || email.trim() === ""}
          onClick={() => void add()}
          type="button"
        >
          Add
        </button>
      </div>
      {error !== null && <p className="form-error panel-empty">{error}</p>}
    </>
  );
}
