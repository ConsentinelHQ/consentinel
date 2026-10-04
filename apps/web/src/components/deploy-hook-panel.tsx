"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyButton } from "@/components/copy-button";

const GHA_SECRET = "CONSENTINEL_DEPLOY_HOOK";

export function DeployHookPanel({
  siteId,
  token,
  entitled,
}: {
  siteId: string;
  token: string;
  entitled: boolean;
}) {
  const [current, setCurrent] = useState(token);
  const [origin, setOrigin] = useState("https://www.consentinelhq.com");
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (!entitled) {
    return (
      <details className="allowlist">
        <summary>Scan after every deploy</summary>
        <p className="quiet">
          Trigger a scan from your deploy pipeline, so a release that breaks consent is caught
          within minutes. Part of the monitoring plan.{" "}
          <Link href="/app/billing">Start monitoring</Link>
        </p>
      </details>
    );
  }

  const url = `${origin}/api/hooks/deploy/${current}`;
  const shown = show ? url : `${origin}/api/hooks/deploy/${"•".repeat(12)}${current.slice(-4)}`;
  const curl = `curl -fsS -X POST ${url}`;
  const gha = `- name: Consent scan after deploy\n  run: curl -fsS -X POST "\${{ secrets.${GHA_SECRET} }}"`;

  const regenerate = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/sites/${siteId}/deploy-hook`, { method: "POST" });
    setBusy(false);
    setOpen(false);
    if (!response.ok) {
      setError("Could not regenerate. Try again.");
      return;
    }
    const data = (await response.json()) as { token: string };
    setCurrent(data.token);
    setShow(true);
  };

  return (
    <details className="allowlist">
      <summary>Scan after every deploy</summary>
      <p className="quiet">
        Call this URL from your deploy pipeline and Consentinel scans the site right after each
        release. If a deploy breaks consent, you get the alert within minutes. Keep it private:
        anyone with the URL can trigger a scan.
      </p>
      <div className="allowlist-code">
        <pre>{shown}</pre>
        <button className="copy-btn" onClick={() => setShow((s) => !s)} type="button">
          {show ? "Hide" : "Show"}
        </button>
        <CopyButton text={url} />
      </div>

      <p className="quiet" style={{ marginTop: 16 }}>
        From a terminal or any CI step:
      </p>
      <div className="allowlist-code">
        <pre>{show ? curl : "curl -fsS -X POST <your deploy URL>"}</pre>
        <CopyButton text={curl} />
      </div>

      <p className="quiet" style={{ marginTop: 16 }}>
        GitHub Actions: save the URL as a repository secret named <code>{GHA_SECRET}</code>, then
        add this step after your deploy step:
      </p>
      <div className="allowlist-code">
        <pre>{gha}</pre>
        <CopyButton text={gha} />
      </div>

      <p className="quiet" style={{ marginTop: 16 }}>
        Shopify Flow or Zapier: add an action that sends an HTTP POST request to the URL.
      </p>

      <p style={{ marginTop: 16 }}>
        <button className="copy-btn btn-quiet" onClick={() => setOpen(true)} type="button">
          Regenerate URL
        </button>
      </p>
      {error !== null && <p className="form-error">{error}</p>}

      <ConfirmDialog
        busy={busy}
        confirmLabel="Regenerate"
        danger
        onCancel={() => setOpen(false)}
        onConfirm={() => void regenerate()}
        open={open}
        title="Regenerate deploy URL?"
      >
        <p>The current URL stops working immediately.</p>
        <p className="quiet">Update it everywhere you have added it, like CI secrets or Zapier.</p>
      </ConfirmDialog>
    </details>
  );
}
