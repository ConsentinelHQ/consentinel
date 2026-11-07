/**
 * Minimal Jira Cloud REST v3 client. Basic auth with an Atlassian API token.
 * Cloud only: requests go to the *.atlassian.net site or, for scoped tokens and
 * Atlassian service accounts, to Atlassian's API gateway for that site. Nothing
 * else, so a saved URL can't point our servers anywhere else.
 */

export const JIRA_HOST = /^https:\/\/[a-z0-9][a-z0-9-]*\.atlassian\.net$/;
/** Gateway base for one site. Scoped tokens and service accounts only work here. */
export const JIRA_GATEWAY = /^https:\/\/api\.atlassian\.com\/ex\/jira\/[0-9a-f-]{36}$/;
/** What a scoped token needs for everything we do. */
export const JIRA_SCOPES = ["read:jira-user", "read:jira-work", "write:jira-work"] as const;
export const JIRA_ISSUE_KEY = /^[A-Z][A-Z0-9_]{0,19}-\d{1,9}$/;
export const JIRA_PROJECT_KEY = /^[A-Z][A-Z0-9_]{0,19}$/;

export interface JiraAuth {
  baseUrl: string;
  /** Set when the token only works through the gateway. Null means call the site directly. */
  apiBase?: string | null;
  email: string;
  apiToken: string;
}

export class JiraError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Normalise "acme.atlassian.net/jira/..." to "https://acme.atlassian.net". */
export function normaliseJiraUrl(input: string): string | null {
  const raw = input.trim().toLowerCase();
  const withScheme = raw.startsWith("http") ? raw : `https://${raw}`;
  try {
    const origin = new URL(withScheme).origin;
    return JIRA_HOST.test(origin) ? origin : null;
  } catch {
    return null;
  }
}

function target(auth: JiraAuth): string {
  if (auth.apiBase) {
    if (!JIRA_GATEWAY.test(auth.apiBase)) throw new JiraError("not a Jira gateway URL", 400);
    return auth.apiBase;
  }
  if (!JIRA_HOST.test(auth.baseUrl)) throw new JiraError("not a Jira Cloud URL", 400);
  return auth.baseUrl;
}

async function jira<T>(auth: JiraAuth, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${target(auth)}${path}`, {
    method,
    headers: {
      authorization: `Basic ${Buffer.from(`${auth.email}:${auth.apiToken}`).toString("base64")}`,
      accept: "application/json",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new JiraError(
      `jira ${method} ${path} ${String(res.status)}: ${text.slice(0, 300)}`,
      res.status,
    );
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

interface IssueType {
  id: string;
  name: string;
  subtask: boolean;
}

export type JiraCheck =
  | {
      ok: true;
      apiBase: string | null;
      issueTypeId: string;
      issueTypeName: string;
      projectName: string;
    }
  | { ok: false; error: string };

const isAuthError = (e: unknown): boolean =>
  e instanceof JiraError && (e.status === 401 || e.status === 403);

/** The site's cloud id, which the gateway URL needs. Public endpoint, no auth. */
export async function jiraCloudId(baseUrl: string): Promise<string | null> {
  if (!JIRA_HOST.test(baseUrl)) return null;
  try {
    const res = await fetch(`${baseUrl}/_edge/tenant_info`, {
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const id = ((await res.json()) as { cloudId?: unknown }).cloudId;
    return typeof id === "string" && /^[0-9a-f-]{36}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

const SCOPE_HINT = `If the token was created with scopes, it needs ${JIRA_SCOPES.join(", ")}.`;

/**
 * Prove the credentials and project work before we save them. Plain API tokens
 * work against the site; scoped tokens and service accounts only through the
 * gateway, so a rejected token gets a second try there before we give up.
 */
export async function checkJira(auth: JiraAuth, projectKey: string): Promise<JiraCheck> {
  let working: JiraAuth = { ...auth, apiBase: null };
  try {
    await jira(working, "GET", "/rest/api/3/myself");
  } catch (direct) {
    if (!isAuthError(direct)) {
      return { ok: false, error: "Couldn't reach that Jira site. Check the URL." };
    }
    const cloudId = await jiraCloudId(auth.baseUrl);
    if (!cloudId) return { ok: false, error: "Jira rejected that email and API token." };
    working = { ...auth, apiBase: `https://api.atlassian.com/ex/jira/${cloudId}` };
    try {
      await jira(working, "GET", "/rest/api/3/myself");
    } catch {
      return {
        ok: false,
        error: `Jira rejected that email and API token. Check the email is the account that made the token, and that the token hasn't expired. ${SCOPE_HINT}`,
      };
    }
  }

  let project: { name: string; issueTypes?: IssueType[] };
  try {
    project = await jira(working, "GET", `/rest/api/3/project/${encodeURIComponent(projectKey)}`);
  } catch (error) {
    return {
      ok: false,
      error: isAuthError(error)
        ? `Signed in, but this account can't open project ${projectKey}. Add it to the project. ${SCOPE_HINT}`
        : `Couldn't find project ${projectKey}. The key is the letters before ticket numbers, like WEB in WEB-123.`,
    };
  }

  // Catch a missing permission now, not on the first real regression.
  const missing = await missingPermissions(working, projectKey);
  if (missing.length > 0) {
    return {
      ok: false,
      error: `This account can open ${projectKey} but can't ${missing.join(" or ")} there. Ask a Jira admin to grant it.`,
    };
  }

  const types = (project.issueTypes ?? []).filter((t) => !t.subtask);
  const pick =
    types.find((t) => t.name.toLowerCase() === "bug") ??
    types.find((t) => t.name.toLowerCase() === "task") ??
    types[0];
  if (!pick) return { ok: false, error: `Project ${projectKey} has no issue types we can use.` };
  return {
    ok: true,
    apiBase: working.apiBase ?? null,
    issueTypeId: pick.id,
    issueTypeName: pick.name,
    projectName: project.name,
  };
}

const NEEDED: Record<string, string> = {
  CREATE_ISSUES: "create issues",
  ADD_COMMENTS: "add comments",
};

/** Permissions we need and don't have. Unknown (the check itself failed) counts as fine. */
async function missingPermissions(auth: JiraAuth, projectKey: string): Promise<string[]> {
  try {
    const res = await jira<{ permissions: Record<string, { havePermission?: boolean }> }>(
      auth,
      "GET",
      `/rest/api/3/mypermissions?projectKey=${encodeURIComponent(projectKey)}&permissions=${Object.keys(NEEDED).join(",")}`,
    );
    return Object.entries(NEEDED)
      .filter(([k]) => res.permissions[k]?.havePermission === false)
      .map(([, label]) => label);
  } catch {
    return [];
  }
}

/** True when Jira refused the credentials, as opposed to being down or rejecting the payload. */
export function isJiraAuthFailure(error: unknown): boolean {
  return error instanceof JiraError && error.status === 401;
}

// Atlassian Document Format, the only body format v3 accepts.
export type AdfNode = Record<string, unknown>;

export const adf = {
  doc: (...content: AdfNode[]): AdfNode => ({ type: "doc", version: 1, content }),
  p: (...content: AdfNode[]): AdfNode => ({ type: "paragraph", content }),
  text: (text: string, opts: { bold?: boolean; href?: string } = {}): AdfNode => {
    const marks: AdfNode[] = [];
    if (opts.bold) marks.push({ type: "strong" });
    if (opts.href) marks.push({ type: "link", attrs: { href: opts.href } });
    return { type: "text", text, ...(marks.length > 0 ? { marks } : {}) };
  },
  bullets: (items: AdfNode[][]): AdfNode => ({
    type: "bulletList",
    content: items.map((c) => ({ type: "listItem", content: [{ type: "paragraph", content: c }] })),
  }),
};

export async function createJiraIssue(
  auth: JiraAuth,
  input: {
    projectKey: string;
    issueTypeId: string;
    summary: string;
    description: AdfNode;
    labels: string[];
  },
): Promise<string> {
  const res = await jira<{ key: string }>(auth, "POST", "/rest/api/3/issue", {
    fields: {
      project: { key: input.projectKey },
      issuetype: { id: input.issueTypeId },
      summary: input.summary.slice(0, 254),
      description: input.description,
      labels: input.labels,
    },
  });
  return res.key;
}

export async function commentOnJiraIssue(
  auth: JiraAuth,
  issueKey: string,
  body: AdfNode,
): Promise<void> {
  await jira(auth, "POST", `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, { body });
}
