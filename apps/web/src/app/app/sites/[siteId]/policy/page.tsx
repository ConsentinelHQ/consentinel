import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can, getBillingState, getSiteForOrg, listPolicyVersions } from "@consentinel/db";
import { PolicyVersionItem } from "@/components/policy-version-item";
import { PrintButton } from "@/components/print-button";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";
import { displayHost } from "@/lib/format";

export const metadata: Metadata = { title: "Policy history" };
export const dynamic = "force-dynamic";

const KIND_LABEL = { privacy: "Privacy policy", cookie: "Cookie policy" } as const;

/**
 * Every version of the site's privacy and cookie policy we've seen, dated, with
 * what changed between them. Old versions are what nobody keeps, and what a
 * lawyer asks for when a letter names a date.
 */
export default async function PolicyHistoryPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const session = await requireSession();
  const site = await getSiteForOrg(db(), siteId, session.orgId);
  if (!site) notFound();
  const host = site.label ?? displayHost(site.url);
  const back = (
    <p className="quiet">
      <Link href={`/app/sites/${site.id}`}>
        <span aria-hidden="true">←</span> {host}
      </Link>
    </p>
  );

  if (!can(await getBillingState(db(), session.orgId), "pdfExport")) {
    return (
      <div className="wrap app-content">
        {back}
        <div className="empty">
          <h2>Policy history is on Growth.</h2>
          <p className="quiet">
            Every version of your privacy and cookie policy, saved the day it changes, with what was
            added and removed. When a letter names a date, you can show exactly what your policy
            said that day.
          </p>
          <p style={{ marginTop: "1rem" }}>
            <Link className="nav-cta" href="/app/billing">
              See Growth
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const versions = (await listPolicyVersions(db(), site.id, session.orgId)) ?? [];
  const byKind = (["privacy", "cookie"] as const)
    .map((kind) => ({ kind, list: versions.filter((v) => v.kind === kind) }))
    .filter((k) => k.list.length > 0);

  return (
    <div className="wrap app-content evidence policy-history">
      {back}
      <div className="evidence-toolbar">
        <PrintButton label="Save as PDF" />
      </div>
      <header className="evidence-head">
        <p className="evidence-kicker">Consentinel policy archive</p>
        <h1>{host}</h1>
        <p className="quiet">
          Saved on each scan when the text changes. Each version’s SHA-256 matches the hash sealed
          into every scan that saw it.
        </p>
      </header>

      {byKind.length === 0 ? (
        <div className="empty">
          <h2>No policy saved yet.</h2>
          <p className="quiet">
            The next scan reads the privacy and cookie policy linked from {host} and saves it here.
            If it never shows up, the policy may load inside a widget we can’t read.
          </p>
        </div>
      ) : (
        byKind.map(({ kind, list }) => (
          <section key={kind}>
            <h2 className="section-label">
              {KIND_LABEL[kind]} ({list.length} {list.length === 1 ? "version" : "versions"})
            </h2>
            <ol className="policy-versions">
              {list.map((v, i) => (
                <PolicyVersionItem current={i === 0} key={v.id} previous={list[i + 1]} v={v} />
              ))}
            </ol>
          </section>
        ))
      )}

      <footer className="evidence-foot quiet">
        <p>
          A version runs from the first scan that saw its text to the last. Changes compare
          paragraphs, ignoring spacing. This archive describes what was published. It is not legal
          advice.
        </p>
      </footer>
    </div>
  );
}
