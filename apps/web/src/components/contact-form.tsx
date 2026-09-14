"use client";

import { useCallback, useState, type FormEvent } from "react";

const TOPICS = [
  { value: "audit", label: "Book a consent audit" },
  { value: "monitoring", label: "Monitoring waitlist" },
  { value: "general", label: "Something else" },
] as const;

export function ContactForm() {
  const [topic, setTopic] = useState<string>("audit");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    async (event: FormEvent): Promise<void> => {
      event.preventDefault();
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/contact", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, name, company, topic, message }),
        });
        if (!response.ok) {
          const data = (await response.json()) as { error?: string };
          setError(data.error ?? "That didn't send. Try again.");
          setBusy(false);
          return;
        }
        setSent(true);
      } catch {
        setError("That didn't send. Check your connection and try again.");
        setBusy(false);
      }
    },
    [busy, company, email, message, name, topic],
  );

  if (sent) {
    return (
      <div className="gate">
        <h3>Message received.</h3>
        <p className="quiet">
          You will hear back within one business day. If it is urgent, reply to any email from us
          and it lands in the same place.
        </p>
      </div>
    );
  }

  return (
    <form className="gate contact" onSubmit={(e) => void submit(e)}>
      <label className="field">
        <span>What is this about?</span>
        <select onChange={(e) => setTopic(e.target.value)} value={topic}>
          {TOPICS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Email</span>
        <input
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          required
          type="email"
          value={email}
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Name</span>
          <input onChange={(e) => setName(e.target.value)} type="text" value={name} />
        </label>
        <label className="field">
          <span>Company</span>
          <input onChange={(e) => setCompany(e.target.value)} type="text" value={company} />
        </label>
      </div>

      <label className="field">
        <span>Message</span>
        <textarea
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Your domain, roughly how many pages, and what prompted this."
          required
          rows={5}
          value={message}
        />
      </label>

      {error !== null && <p className="form-error">{error}</p>}

      <button disabled={busy} type="submit">
        {busy ? "Sending" : "Send message"}
      </button>
    </form>
  );
}
