import Link from "next/link";
import { getBillingState } from "@consentinel/db";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";

/** Shown on every app page while the org is archived, so paused monitoring is never a surprise. */
export async function ArchivedBanner() {
  const session = await requireSession().catch(() => null);
  if (!session) return null;
  const billing = await getBillingState(db(), session.orgId);
  if (!billing?.archivedAt) return null;
  return (
    <div className="archived-banner" role="status">
      <span>This account is archived. Scheduled scans, alerts and integrations are off.</span>
      <Link href="/app/profile">Restore</Link>
    </div>
  );
}
