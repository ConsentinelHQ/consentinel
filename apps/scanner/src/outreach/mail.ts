/**
 * Pure helpers for reading Gmail messages: body text, quote stripping, and
 * bounce parsing. No network here, so all of it is unit tested.
 */

export interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
}

const decode = (data: string): string => Buffer.from(data, "base64url").toString("utf8");

/** First text/plain part, else text/html with tags stripped. */
export function extractText(part: GmailPart): string {
  const plain = find(part, "text/plain");
  if (plain?.body?.data) return decode(plain.body.data);
  const html = find(part, "text/html");
  if (html?.body?.data) {
    return decode(html.body.data)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }
  return "";
}

function find(part: GmailPart, mime: string): GmailPart | undefined {
  if (part.mimeType === mime) return part;
  for (const p of part.parts ?? []) {
    const hit = find(p, mime);
    if (hit) return hit;
  }
  return undefined;
}

export function header(part: GmailPart, name: string): string {
  return part.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** Keep only what the sender wrote: drop quoted history and signatures' reply chains. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/^On .+wrote:\s*$/.test(line.trim())) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line.trim())) break;
    if (/^From: .+/.test(line.trim()) && out.length > 0) break;
    if (line.startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

/** Addresses a bounce notice says failed. Header first, then the body text. */
export function bouncedRecipients(part: GmailPart, text: string): string[] {
  const found = new Set<string>();
  for (const v of header(part, "X-Failed-Recipients").split(",")) {
    if (v.trim()) found.add(v.trim().toLowerCase());
  }
  const body =
    /(?:wasn't delivered to|couldn't be delivered to|delivery to the following recipients? failed[^:]*:|address not found[\s\S]{0,200}?)\s*<?([^\s<>@]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})/gi;
  for (const m of text.matchAll(body)) {
    if (m[1]) found.add(m[1].toLowerCase());
  }
  return [...found];
}

/** "Name <a@b.com>" -> "a@b.com" */
export function address(from: string): string {
  return (/<([^>]+)>/.exec(from)?.[1] ?? from).trim().toLowerCase();
}
