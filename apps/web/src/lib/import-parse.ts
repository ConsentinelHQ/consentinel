/**
 * Turns a pasted list, a CSV export or a flattened spreadsheet into import rows.
 * Pure, so the browser preview and the server agree on what was read.
 */

export interface ImportRow {
  domain: string;
  /** From a "client" column when the file has one. */
  client: string | null;
}

export const MAX_IMPORT_ROWS = 200;

const DOMAIN =
  /^(?:https?:\/\/)?((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63})(?:[/:?#]\S*)?$/i;

const DOMAIN_HEADER = /^(domains?|urls?|websites?|sites?|store|homepage)$/i;
const CLIENT_HEADER = /^(client|customer|account|brand|company)( name)?$/i;

/** One CSV line into cells. Handles quoted commas; tabs and semicolons split too. */
export function splitRow(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"' && cur.trim() === "") {
      quoted = true;
    } else if (ch === "," || ch === ";" || ch === "\t") {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

/** "https://www.Shop.com/products" -> "shop.com". Emails and junk -> null. */
export function toDomain(value: string): string | null {
  const v = value.trim();
  if (v === "" || v.includes("@") || /\s/.test(v)) return null;
  const m = DOMAIN.exec(v);
  return m?.[1] ? m[1].toLowerCase().replace(/^www\./, "") : null;
}

export interface ParseResult {
  rows: ImportRow[];
  /** Hit MAX_IMPORT_ROWS before the end of the input. */
  truncated: boolean;
  /** Lines that had no usable domain, so the preview can say so. */
  skipped: number;
}

/**
 * With a header row naming a domain column, reads that column (and a client
 * column if present). Without one, takes the first domain-looking cell per line,
 * so a bare list and an arbitrary export both work. Duplicates collapse.
 */
export function parseImport(text: string, max = MAX_IMPORT_ROWS): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  let domainCol = -1;
  let clientCol = -1;

  const first = lines[0] ? splitRow(lines[0]) : [];
  const headerDomain = first.findIndex((c) => DOMAIN_HEADER.test(c));
  if (headerDomain !== -1) {
    domainCol = headerDomain;
    clientCol = first.findIndex((c) => CLIENT_HEADER.test(c));
    lines.shift();
  }

  const seen = new Map<string, ImportRow>();
  let skipped = 0;
  let truncated = false;

  for (const line of lines) {
    const cells = splitRow(line);
    let domain: string | null = null;
    if (domainCol !== -1) {
      domain = toDomain(cells[domainCol] ?? "");
    } else {
      for (const cell of cells) {
        domain = toDomain(cell);
        if (domain) break;
      }
    }
    if (!domain) {
      skipped++;
      continue;
    }
    if (seen.has(domain)) continue;
    if (seen.size >= max) {
      truncated = true;
      break;
    }
    const client = clientCol !== -1 ? (cells[clientCol] ?? "").slice(0, 120).trim() : "";
    seen.set(domain, { domain, client: client === "" ? null : client });
  }

  return { rows: [...seen.values()], truncated, skipped };
}

function cellText(c: unknown): string {
  if (typeof c === "string") return c;
  if (typeof c === "number" || typeof c === "boolean") return String(c);
  if (c instanceof Date) return c.toISOString();
  return "";
}

/** Spreadsheet rows to tab-separated text, so one parser handles every format. */
export function sheetToText(rows: readonly (readonly unknown[])[]): string {
  return rows
    .map((r) => r.map((c) => cellText(c).replace(/[\t\r\n]+/g, " ")).join("\t"))
    .join("\n");
}
