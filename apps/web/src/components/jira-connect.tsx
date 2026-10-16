"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyButton } from "@/components/copy-button";

export interface JiraState {
  baseUrl: string;
  projectKey: string;
  issueTypeName: string;
  autoCreate: boolean;
  hookToken: string;
}

const API_TOKEN_URL = "https://id.atlassian.com/manage-profile/security/api-tokens";

export function JiraConnect({ connection }: { connection: JiraState | null }) {
  return connection ? <Connected connection={connection} /> : <ConnectForm />;
}

function ConnectForm() {
  const router = useRouter();
  const [form, setForm] = useState({ url: "", email: "", apiToken: "", projectKey: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = Object.values(form).every((v) => v.trim() !== "");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function connect(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/jira", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Couldn't connect. Try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't connect. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="panel-note">
        New critical findings open a Jira ticket with the evidence and the fix. When any ticket
        moves to Done, we rescan and comment whether it actually fixed the site. Use an{" "}
        <a href={API_TOKEN_URL} rel="noreferrer" target="_blank">
          Atlassian API token
        </a>{" "}
        from an account that can create issues in the project.
      </p>
      <div className="jira-form">
        <input
          aria-label="Jira URL"
          disabled={busy}
          onChange={set("url")}
          placeholder="yourcompany.atlassian.net"
          value={form.url}
        />
        <input
          aria-label="Project key"
          disabled={busy}
          onChange={set("projectKey")}
          placeholder="Project key, e.g. WEB"
          value={form.projectKey}
        />
        <input
          aria-label="Jira account email"
          autoComplete="off"
          disabled={busy}
          onChange={set("email")}
          placeholder="Jira account email"
          type="email"
          value={form.email}
        />
        <input
          aria-label="API token"
          autoComplete="off"
          disabled={busy}
          onChange={set("apiToken")}
          placeholder="API token"
          type="password"
          value={form.apiToken}
        />
        <button
          className="dash-cta"
          disabled={busy || !ready}
          onClick={() => void connect()}
          type="button"
        >
          {busy ? "Checking..." : "Connect Jira"}
        </button>
      </div>
      {error !== null && <p className="form-error panel-empty">{error}</p>}
    </>
  );
}

function Connected({ connection }: { connection: JiraState }) {
  const router = useRouter();
  const [auto, setAuto] = useState(connection.autoCreate);
  const [token, setToken] = useState(connection.hookToken);
  const [origin, setOrigin] = useState("https://www.consentinelhq.com");
  const [show, setShow] = useState(false);
  const [dialog, setDialog] = useState<"rotate" | "disconnect" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const host = connection.baseUrl.replace(/^https:\/\//, "");
  const url = `${origin}/api/hooks/jira/${token}`;
  const shown = show ? url : `${origin}/api/hooks/jira/${"•".repeat(12)}${token.slice(-4)}`;
  const body = '{ "issueKey": "{{issue.key}}" }';

  async function toggle(next: boolean): Promise<void> {
    setAuto(next);
    setError(null);
    const res = await fetch("/api/integrations/jira", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ autoCreate: next }),
    }).catch(() => null);
    if (!res?.ok) {
      setAuto(!next);
      setError("Couldn't save that. Try again.");
    }
  }

  async function confirm(): Promise<void> {
    setBusy(true);
    setError(null);
    if (dialog === "rotate") {
      const res = await fetch("/api/integrations/jira/hook", { method: "POST" }).catch(() => null);
      if (res?.ok) {
        setToken(((await res.json()) as { token: string }).token);
        setShow(true);
      } else setError("Couldn't regenerate. Try again.");
    } else {
      const res = await fetch("/api/integrations/jira", { method: "DELETE" }).catch(() => null);
      if (res?.ok) router.refresh();
      else setError("Couldn't disconnect. Try again.");
    }
    setBusy(false);
    setDialog(null);
  }

  return (
    <>
      <div className="dash-row">
        <span className="dash-row-name">
          Connected to {host}, project {connection.projectKey}. Tickets open as{" "}
          {connection.issueTypeName}.
        </span>
        <button className="link-button" onClick={() => setDialog("disconnect")} type="button">
          Disconnect
        </button>
      </div>

      <label className="alert-toggle">
        <input
          checked={auto}
          className="switch"
          onChange={(e) => void toggle(e.target.checked)}
          role="switch"
          type="checkbox"
        />
        <span>
          <strong>Open a ticket for new critical findings</strong>
          <span className="quiet alert-toggle-sub">
            One ticket per regression, labelled consentinel, with the evidence and the fix.
          </span>
        </span>
      </label>

      <div className="jira-steps">
        <p>
          <strong>Rescan when a ticket is done.</strong> In Jira, go to Project settings,
          Automation, Create rule:
        </p>
        <ol>
          <li>Trigger: Issue transitioned, to status Done.</li>
          <li>Action: Send web request, method POST, to the URL below.</li>
          <li>Web request body: Custom data, then paste the body below.</li>
        </ol>
        <div className="allowlist-code">
          <pre>{shown}</pre>
          <button className="copy-btn" onClick={() => setShow((s) => !s)} type="button">
            {show ? "Hide" : "Show"}
          </button>
          <CopyButton text={url} />
        </div>
        <div className="allowlist-code">
          <pre>{body}</pre>
          <CopyButton text={body} />
        </div>
        <p className="quiet">
          Tickets we opened are checked finding by finding. Any other ticket gets a regression
          check. More than one site? Add <code>?site=yourdomain.com</code> to the URL, one rule per
          site.
        </p>
        <p>
          <button className="copy-btn btn-quiet" onClick={() => setDialog("rotate")} type="button">
            Regenerate URL
          </button>
        </p>
      </div>
      {error !== null && <p className="form-error panel-empty">{error}</p>}

      <ConfirmDialog
        busy={busy}
        confirmLabel={dialog === "rotate" ? "Regenerate" : "Disconnect"}
        danger
        onCancel={() => setDialog(null)}
        onConfirm={() => void confirm()}
        open={dialog !== null}
        title={dialog === "rotate" ? "Regenerate Jira URL?" : "Disconnect Jira?"}
      >
        {dialog === "rotate" ? (
          <p>The current URL stops working immediately. Update your Automation rule.</p>
        ) : (
          <p>We stop opening tickets and stop commenting on done tickets. Existing tickets stay.</p>
        )}
      </ConfirmDialog>
    </>
  );
}
