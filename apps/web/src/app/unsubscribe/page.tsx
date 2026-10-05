import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { findRecipientByToken, unsubscribeByToken } from "@consentinel/db";
import { db } from "@/lib/server";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };
export const dynamic = "force-dynamic";

async function unsubscribe(formData: FormData): Promise<void> {
  "use server";
  const token = formData.get("t");
  if (typeof token === "string" && token !== "") await unsubscribeByToken(db(), token);
  redirect("/unsubscribe?done=1");
}

export default async function Unsubscribe({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;

  if (q["done"] === "1") {
    return (
      <div className="wrap unsub">
        <h1>You&apos;re unsubscribed.</h1>
        <p className="quiet">You won&apos;t get Consentinel alerts at this address anymore.</p>
      </div>
    );
  }

  const token = typeof q["t"] === "string" ? q["t"] : "";
  const recipient = token === "" ? null : await findRecipientByToken(db(), token);

  if (recipient === null) {
    return (
      <div className="wrap unsub">
        <h1>Nothing to unsubscribe.</h1>
        <p className="quiet">This link has already been used, or the address was removed.</p>
      </div>
    );
  }

  return (
    <div className="wrap unsub">
      <h1>Stop these alerts?</h1>
      <p className="quiet">{recipient.email} won&apos;t get Consentinel alert emails anymore.</p>
      <form action={unsubscribe}>
        <input name="t" type="hidden" value={token} />
        <button className="dash-cta" type="submit">
          Unsubscribe
        </button>
      </form>
    </div>
  );
}
