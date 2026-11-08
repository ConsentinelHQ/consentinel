"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";

type Dialog = "archive" | "delete" | null;

/** Archive (pause, keep data) and delete (gone for good), with the consequences spelled out. */
export function AccountActions({
  archived,
  canManage,
  teamOrgs,
}: {
  archived: boolean;
  /** Owners and admins can archive the organization. */
  canManage: boolean;
  /** Orgs with other members, which stay when this user is deleted. */
  teamOrgs: string[];
}) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function archive(action: "archive" | "restore"): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account/archive", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    setBusy(false);
    setDialog(null);
    if (res?.ok) {
      window.location.reload();
      return;
    }
    const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    setError(data?.error ?? "Something went wrong. Try again.");
  }

  async function remove(): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: typed }),
    }).catch(() => null);
    if (res?.ok) {
      window.location.assign("/");
      return;
    }
    setBusy(false);
    setDialog(null);
    const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    setError(data?.error ?? "Couldn't delete the account. Try again.");
  }

  return (
    <section className="account-actions">
      <h2>Account</h2>
      {canManage ? (
        <div className="account-row">
          <div>
            <strong>{archived ? "Restore account" : "Archive account"}</strong>
            <p className="quiet">
              {archived
                ? "Turn monitoring, alerts and integrations back on. Billing resumes if your subscription hasn't ended."
                : "Pause monitoring, alerts and integrations, and stop billing at the end of this period. Your sites and scan history are kept, and you can restore anytime."}
            </p>
          </div>
          {archived ? (
            <button
              className="account-btn is-positive"
              disabled={busy}
              onClick={() => void archive("restore")}
              type="button"
            >
              {busy ? "Restoring..." : "Restore"}
            </button>
          ) : (
            <button className="account-btn" onClick={() => setDialog("archive")} type="button">
              Archive
            </button>
          )}
        </div>
      ) : null}
      <div className="account-row">
        <div>
          <strong>Delete account</strong>
          <p className="quiet">
            Permanently delete your account, sites, scan history and integrations, and cancel your
            subscription now. This can&apos;t be undone.
          </p>
        </div>
        <button
          className="account-btn is-danger"
          onClick={() => {
            setTyped("");
            setDialog("delete");
          }}
          type="button"
        >
          Delete
        </button>
      </div>
      {error !== null && <p className="form-error">{error}</p>}

      <ConfirmDialog
        busy={busy}
        confirmLabel="Archive account"
        onCancel={() => setDialog(null)}
        onConfirm={() => void archive("archive")}
        open={dialog === "archive"}
        title="Archive this account?"
      >
        <p>
          Scheduled scans, alerts, Slack, Teams and Jira stop now. Your subscription ends at the
          close of this billing period and you won&apos;t be charged again. Everything is kept, so
          you can restore it later.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        busy={busy}
        confirmDisabled={typed !== "DELETE"}
        confirmLabel="Delete forever"
        danger
        onCancel={() => setDialog(null)}
        onConfirm={() => void remove()}
        open={dialog === "delete"}
        title="Delete your account?"
      >
        <p>
          Your sites, scans, evidence, alerts and integrations are deleted, and your subscription is
          canceled immediately with no further charges.
          {teamOrgs.length > 0
            ? ` ${teamOrgs.join(", ")} ${teamOrgs.length === 1 ? "has" : "have"} other members, so ${teamOrgs.length === 1 ? "it stays" : "they stay"} and you're just removed.`
            : ""}
        </p>
        <label className="account-confirm">
          <span>
            Type <strong>DELETE</strong> to confirm
          </span>
          <input
            autoComplete="off"
            onChange={(e) => setTyped(e.target.value)}
            spellCheck={false}
            value={typed}
          />
        </label>
      </ConfirmDialog>
    </section>
  );
}
