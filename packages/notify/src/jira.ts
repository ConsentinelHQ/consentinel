/**
 * Minimal Jira Cloud REST v3 client. Basic auth with an Atlassian API token.
 * Cloud only: the host is pinned to *.atlassian.net so a saved URL can't point
 * our servers at anything else.
 */

export const JIRA_HOST = /^https:\/\/[a-z0-9][a-z0-9-]*\.atlassian\.net$/;
export const JIRA_ISSUE_KEY = /^[A-Z][A-Z0-9_]{0,19}-\d{1,9}$/;
export const JIRA_PROJECT_KEY = /^[A-Z][A-Z0-9_]{0,19}$/;

export interface JiraAuth {
  baseUrl: string;
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

async function jira<T>(auth: JiraAuth, method: string, path: string, body?: unknown): Promise<T> {
  if (!JIRA_HOST.test(auth.baseUrl)) throw new JiraError("not a Jira Cloud URL", 400);
  const res = await fetch(`${auth.baseUrl}${path}`, {
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
  | { ok: true; issueTypeId: string; issueTypeName: string; projectName: string }
  | { ok: false; error: string };

/** Prove the credentials and project work before we save them. */
export async function checkJira(auth: JiraAuth, projectKey: string): Promise<JiraCheck> {
  try {
    await jira(auth, "GET", "/rest/api/3/myself");
  } catch (error) {
    const status = error instanceof JiraError ? error.status : 0;
    return {
      ok: false,
      error:
        status === 401 || status === 403
          ? "Jira rejected that email and API token."
          : "Couldn't reach that Jira site. Check the URL.",
    };
  }
  try {
    const project = await jira<{ name: string; issueTypes?: IssueType[] }>(
      auth,
      "GET",
      `/rest/api/3/project/${encodeURIComponent(projectKey)}`,
    );
    const types = (project.issueTypes ?? []).filter((t) => !t.subtask);
    const pick =
      types.find((t) => t.name.toLowerCase() === "bug") ??
      types.find((t) => t.name.toLowerCase() === "task") ??
      types[0];
    if (!pick) return { ok: false, error: `Project ${projectKey} has no issue types we can use.` };
    return { ok: true, issueTypeId: pick.id, issueTypeName: pick.name, projectName: project.name };
  } catch {
    return {
      ok: false,
      error: `Couldn't open project ${projectKey}. Check the key and permissions.`,
    };
  }
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
