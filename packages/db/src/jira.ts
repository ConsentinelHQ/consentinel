import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { findings, jiraConnections, jiraIssues, sites, type JiraConnectionRow } from "./schema.js";

/**
 * AES-256-GCM with a 32-byte key from INTEGRATION_KEY (base64). Format:
 * v1.<iv>.<tag>.<ciphertext>, all base64url. The version prefix lets us rotate keys.
 */
function key(): Buffer {
  const raw = process.env.INTEGRATION_KEY;
  if (!raw) throw new Error("INTEGRATION_KEY is not set");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("INTEGRATION_KEY must be 32 bytes, base64 encoded");
  return buf;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, body]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function decryptSecret(enc: string): string {
  const [v, iv, tag, body] = enc.split(".");
  if (v !== "v1" || !iv || !tag || !body) throw new Error("unrecognised secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(body, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Decrypted, ready for the API client. Never sent to the browser. */
export interface JiraCredentials {
  orgId: string;
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
  issueTypeId: string;
  issueTypeName: string;
  autoCreate: boolean;
}

/** Safe to render: no token. */
export type JiraConnectionSummary = Omit<JiraCredentials, "apiToken"> & { hookToken: string };

export interface SaveJiraInput {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
  issueTypeId: string;
  issueTypeName: string;
  autoCreate: boolean;
}

export async function saveJiraConnection(
  db: Database,
  orgId: string,
  input: SaveJiraInput,
): Promise<void> {
  const values = {
    baseUrl: input.baseUrl,
    email: input.email,
    apiTokenEnc: encryptSecret(input.apiToken),
    projectKey: input.projectKey,
    issueTypeId: input.issueTypeId,
    issueTypeName: input.issueTypeName,
    autoCreate: input.autoCreate,
  };
  await db
    .insert(jiraConnections)
    .values({ orgId, ...values })
    .onConflictDoUpdate({ target: jiraConnections.orgId, set: values });
}

export async function setJiraAutoCreate(
  db: Database,
  orgId: string,
  autoCreate: boolean,
): Promise<void> {
  await db.update(jiraConnections).set({ autoCreate }).where(eq(jiraConnections.orgId, orgId));
}

export async function deleteJiraConnection(db: Database, orgId: string): Promise<void> {
  await db.delete(jiraConnections).where(eq(jiraConnections.orgId, orgId));
}

function summarise(row: JiraConnectionRow): JiraConnectionSummary {
  return {
    orgId: row.orgId,
    baseUrl: row.baseUrl,
    email: row.email,
    projectKey: row.projectKey,
    issueTypeId: row.issueTypeId,
    issueTypeName: row.issueTypeName,
    autoCreate: row.autoCreate,
    hookToken: row.hookToken,
  };
}

export async function getJiraConnectionSummary(
  db: Database,
  orgId: string,
): Promise<JiraConnectionSummary | null> {
  const [row] = await db
    .select()
    .from(jiraConnections)
    .where(eq(jiraConnections.orgId, orgId))
    .limit(1);
  return row ? summarise(row) : null;
}

/** Connection for an inbound hook token. */
export async function getJiraConnectionByHookToken(
  db: Database,
  token: string,
): Promise<JiraConnectionSummary | null> {
  const [row] = await db
    .select()
    .from(jiraConnections)
    .where(eq(jiraConnections.hookToken, token))
    .limit(1);
  return row ? summarise(row) : null;
}

/** Issue a new hook token. The old URL stops working immediately. */
export async function rotateJiraHookToken(db: Database, orgId: string): Promise<string | null> {
  const [row] = await db
    .update(jiraConnections)
    .set({ hookToken: sql`replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')` })
    .where(eq(jiraConnections.orgId, orgId))
    .returning({ token: jiraConnections.hookToken });
  return row?.token ?? null;
}

/** Active sites, for resolving which one a ticket is about. */
export async function listActiveSites(
  db: Database,
  orgId: string,
): Promise<{ id: string; url: string }[]> {
  return db
    .select({ id: sites.id, url: sites.url })
    .from(sites)
    .where(and(eq(sites.orgId, orgId), isNull(sites.archivedAt)));
}

/** For the worker. Returns null when not connected or the token can't be decrypted. */
export async function getJiraCredentialsForSite(
  db: Database,
  siteId: string,
): Promise<JiraCredentials | null> {
  const [row] = await db
    .select({ conn: jiraConnections })
    .from(sites)
    .innerJoin(jiraConnections, eq(jiraConnections.orgId, sites.orgId))
    .where(eq(sites.id, siteId))
    .limit(1);
  if (!row) return null;
  try {
    const summary: Partial<JiraConnectionSummary> = summarise(row.conn);
    delete summary.hookToken;
    return {
      ...(summary as Omit<JiraCredentials, "apiToken">),
      apiToken: decryptSecret(row.conn.apiTokenEnc),
    };
  } catch (error) {
    console.error("jira token decrypt failed", { orgId: row.conn.orgId, error });
    return null;
  }
}

export async function recordJiraIssue(
  db: Database,
  input: {
    orgId: string;
    siteId: string;
    issueKey: string;
    scanId: string;
    fingerprints: string[];
  },
): Promise<void> {
  await db
    .insert(jiraIssues)
    .values(input)
    .onConflictDoUpdate({
      target: [jiraIssues.orgId, jiraIssues.issueKey],
      set: { fingerprints: input.fingerprints, scanId: input.scanId },
    });
}

/** A ticket Consentinel opened, if this key is one. */
export async function getTrackedJiraIssue(
  db: Database,
  orgId: string,
  issueKey: string,
): Promise<{ siteId: string; fingerprints: string[] } | null> {
  const [row] = await db
    .select({ siteId: jiraIssues.siteId, fingerprints: jiraIssues.fingerprints })
    .from(jiraIssues)
    .where(and(eq(jiraIssues.orgId, orgId), eq(jiraIssues.issueKey, issueKey)))
    .limit(1);
  return row ?? null;
}

/** Which of these fingerprints are still present in a scan. */
export async function findingsStillPresent(
  db: Database,
  scanId: string,
  fingerprints: string[],
): Promise<{ fingerprint: string; vendor: string; title: string }[]> {
  if (fingerprints.length === 0) return [];
  return db
    .select({ fingerprint: findings.fingerprint, vendor: findings.vendor, title: findings.title })
    .from(findings)
    .where(and(eq(findings.scanId, scanId), inArray(findings.fingerprint, fingerprints)));
}
