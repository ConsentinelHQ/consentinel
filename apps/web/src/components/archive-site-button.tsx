"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function ArchiveSiteButton({
  siteId,
  host,
  archived,
}: {
  siteId: string;
  host: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/sites/${siteId}/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: !archived }),
    });
    setBusy(false);
    if (!response.ok) {
      setOpen(false);
      setError("Could not update the site. Try again.");
      return;
    }
    if (archived) router.refresh();
    else router.push("/app");
  };

  if (archived) {
    return (
      <>
        <button disabled={busy} onClick={() => void submit()} type="button">
          {busy ? "Restoring..." : "Restore site"}
        </button>
        {error !== null && <p className="form-error">{error}</p>}
      </>
    );
  }

  return (
    <>
      <button className="archive-btn" onClick={() => setOpen(true)} type="button">
        Archive site
      </button>
      {error !== null && <p className="form-error">{error}</p>}
      <ConfirmDialog
        busy={busy}
        confirmLabel="Archive site"
        danger
        onCancel={() => setOpen(false)}
        onConfirm={() => void submit()}
        open={open}
        title={`Archive ${host}?`}
      >
        <p>Scheduled scans stop and the site leaves your list.</p>
        <p className="quiet">
          Reports and shared links keep working. Add the URL again any time to restore it with its
          full history.
        </p>
      </ConfirmDialog>
    </>
  );
}
