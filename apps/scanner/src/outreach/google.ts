import { createServer } from "node:http";
import type { GmailPart } from "./mail.js";
import type { Email } from "./template.js";

/**
 * Gmail and Sheets over plain REST with one OAuth refresh token. Scopes are the
 * minimum: compose (drafts + send), readonly (bounce check), spreadsheets.
 */

export const SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
];

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not set`);
  return v;
}

let cached: { token: string; exp: number } | undefined;

async function accessToken(): Promise<string> {
  if (cached && Date.now() < cached.exp) return cached.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: env("OUTREACH_GOOGLE_CLIENT_ID"),
      client_secret: env("OUTREACH_GOOGLE_CLIENT_SECRET"),
      refresh_token: env("OUTREACH_GOOGLE_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });
  const body = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!body.access_token)
    throw new Error(`Google token refresh failed: ${body.error ?? res.status}`);
  cached = { token: body.access_token, exp: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000 };
  return body.access_token;
}

async function google<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) throw new Error(`Google ${String(res.status)}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

// ---------- Gmail ----------

const b64 = (s: string): string => Buffer.from(s, "utf8").toString("base64");
const header = (s: string): string => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

/** RFC 5322 multipart/alternative, base64url for the Gmail API. */
export function mime(from: string, to: string, email: Email): string {
  const boundary = `cs_${Math.random().toString(36).slice(2)}`;
  const replyTo = /<([^>]+)>/.exec(from)?.[1] ?? from;
  const msg = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${header(email.subject)}`,
    // Lets Gmail and Yahoo show a one-click unsubscribe instead of a spam button.
    `List-Unsubscribe: <mailto:${replyTo}?subject=unsubscribe>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(email.text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(email.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return Buffer.from(msg, "utf8").toString("base64url");
}

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

export async function createDraft(from: string, to: string, email: Email): Promise<string> {
  const r = await google<{ id: string }>(`${GMAIL}/drafts`, {
    method: "POST",
    body: JSON.stringify({ message: { raw: mime(from, to, email) } }),
  });
  return r.id;
}

export async function send(from: string, to: string, email: Email): Promise<string> {
  const r = await google<{ id: string }>(`${GMAIL}/messages/send`, {
    method: "POST",
    body: JSON.stringify({ raw: mime(from, to, email) }),
  });
  return r.id;
}

/** Bounce notices in the window. Counts any mailer-daemon mail: errs toward pausing. */
export async function countBounces(since: Date): Promise<number> {
  const q = `from:(mailer-daemon OR postmaster) after:${String(Math.floor(since.getTime() / 1000))}`;
  const r = await google<{ messages?: unknown[] }>(
    `${GMAIL}/messages?maxResults=100&q=${encodeURIComponent(q)}`,
  );
  return r.messages?.length ?? 0;
}

export interface Message {
  id: string;
  threadId: string;
  at: Date;
  payload: GmailPart;
}

/** Message ids matching a Gmail search, newest first. */
export async function search(q: string, max = 20): Promise<string[]> {
  const r = await google<{ messages?: { id: string }[] }>(
    `${GMAIL}/messages?maxResults=${String(max)}&q=${encodeURIComponent(q)}`,
  );
  return (r.messages ?? []).map((m) => m.id);
}

export async function getMessage(id: string): Promise<Message> {
  const r = await google<{
    id: string;
    threadId: string;
    internalDate: string;
    payload: GmailPart;
  }>(`${GMAIL}/messages/${id}?format=full`);
  return {
    id: r.id,
    threadId: r.threadId,
    at: new Date(Number(r.internalDate)),
    payload: r.payload,
  };
}

// ---------- Sheets ----------

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";

export type Row = Record<string, string | number>;

/** One sheet row keyed by header, plus its 1-based row number. */
export interface SheetRow {
  rowNumber: number;
  values: Record<string, string>;
}

export interface Sheet {
  headers: string[];
  domains: Set<string>;
  rows: SheetRow[];
}

export const normDomain = (d: string): string =>
  d
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");

export async function readSheet(id: string, tab: string): Promise<Sheet> {
  const r = await google<{ values?: string[][] }>(
    `${SHEETS}/${id}/values/${encodeURIComponent(`${tab}!A1:Z`)}`,
  );
  const [headers = [], ...rows] = r.values ?? [];
  const col = headers.findIndex((h) => h.trim().toLowerCase() === "domain");
  if (col < 0) throw new Error(`no "Domain" column in ${tab}`);
  const domains = new Set(rows.map((row) => normDomain(row[col] ?? "")).filter(Boolean));
  const keyed = rows.map((row, i) => ({
    rowNumber: i + 2,
    values: Object.fromEntries(headers.map((h, j) => [h, row[j] ?? ""])),
  }));
  return { headers, domains, rows: keyed };
}

function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Updates only the named cells, so dropdowns and untouched columns stay as they are. */
export async function updateRow(
  id: string,
  tab: string,
  headers: string[],
  rowNumber: number,
  row: Row,
): Promise<void> {
  const data = Object.entries(row)
    .map(([key, value]) => ({ i: headers.indexOf(key), value }))
    .filter(({ i }) => i >= 0)
    .map(({ i, value }) => ({
      range: `${tab}!${columnLetter(i)}${String(rowNumber)}`,
      values: [[value]],
    }));
  if (data.length === 0) return;
  await google(`${SHEETS}/${id}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
  });
}

/** Writes by header name, so reordering sheet columns can't misfile data. */
export async function appendRow(
  id: string,
  tab: string,
  headers: string[],
  row: Row,
): Promise<void> {
  const values = [headers.map((h) => row[h] ?? "")];
  await google(
    `${SHEETS}/${id}/values/${encodeURIComponent(`${tab}!A1`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values }) },
  );
}

// ---------- One-time auth ----------

/** Loopback OAuth: prints a URL, catches the redirect, prints the refresh token. */
export async function authorize(): Promise<void> {
  const clientId = env("OUTREACH_GOOGLE_CLIENT_ID");
  const clientSecret = env("OUTREACH_GOOGLE_CLIENT_SECRET");
  const port = 53682;
  const redirect = `http://127.0.0.1:${String(port)}`;
  const url =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirect,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
    }).toString();
  console.log(`Open this URL and sign in as the sending mailbox:\n\n${url}\n`);

  const code = await new Promise<string>((resolveCode, reject) => {
    const server = createServer((req, res) => {
      const c = new URL(req.url ?? "/", redirect).searchParams.get("code");
      res.end(c ? "Done. Back to the terminal." : "No code in redirect.");
      server.close();
      if (c) resolveCode(c);
      else reject(new Error("no code in redirect"));
    }).listen(port, "127.0.0.1");
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirect,
      grant_type: "authorization_code",
    }),
  });
  const body = (await res.json()) as { refresh_token?: string; error?: string };
  if (!body.refresh_token) throw new Error(`no refresh token: ${body.error ?? "unknown"}`);
  console.log(`Add to .env.outreach:\n\nOUTREACH_GOOGLE_REFRESH_TOKEN=${body.refresh_token}\n`);
}
