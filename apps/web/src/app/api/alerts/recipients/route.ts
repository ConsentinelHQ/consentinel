import { NextResponse } from "next/server";
import {
  externalRecipientLimit,
  getBillingState,
  addExternalRecipient,
  removeExternalRecipient,
} from "@consentinel/db";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const data: unknown = await request.json().catch(() => null);
  return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
}

export async function POST(request: Request) {
  const session = await requireSession();
  const { email } = await readBody(request);
  const value = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!EMAIL.test(value) || value.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const limit = externalRecipientLimit(await getBillingState(db(), session.orgId));
  const result = await addExternalRecipient(db(), session.orgId, value, limit);
  if (result === "limit") {
    return NextResponse.json(
      { error: `You can add up to ${String(limit)} people.` },
      { status: 400 },
    );
  }
  if (result === "exists") {
    return NextResponse.json({ error: "That address already gets alerts." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await requireSession();
  const { id } = await readBody(request);
  if (typeof id !== "string" || id === "") {
    return NextResponse.json({ error: "Missing recipient." }, { status: 400 });
  }
  await removeExternalRecipient(db(), session.orgId, id);
  return NextResponse.json({ ok: true });
}
