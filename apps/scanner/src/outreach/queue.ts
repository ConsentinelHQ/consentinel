import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normDomain } from "./google.js";
import { repoRoot } from "./state.js";

/**
 * New-site queue. Claw proposes domains; code decides whether each one is a
 * real, reachable store we haven't touched before. Only accepted domains are
 * queued, and `run --then-queue` scans them once the sheet backlog is used up.
 */

const queueFile = resolve(repoRoot(), ".outreach", "queue.txt");

export function readQueue(): string[] {
  if (!existsSync(queueFile)) return [];
  return [
    ...new Set(
      readFileSync(queueFile, "utf8")
        .split("\n")
        .map((l) => normDomain(l))
        .filter(Boolean),
    ),
  ];
}

function appendQueue(domains: string[]): void {
  if (domains.length === 0) return;
  mkdirSync(resolve(repoRoot(), ".outreach"), { recursive: true });
  appendFileSync(queueFile, domains.join("\n") + "\n");
}

/** Platform and storefront markers. Two independent hits make it a store. */
const STORE_SIGNALS: [string, RegExp][] = [
  ["shopify", /cdn\.shopify\.com|Shopify\.theme|myshopify\.com/i],
  ["bigcommerce", /cdn\d*\.bigcommerce\.com|BCData/i],
  ["magento", /Magento_|mage\/cookies|static\/version\d+\/frontend/i],
  ["woocommerce", /woocommerce/i],
  ["salesforce", /demandware\.static|dwanalytics/i],
  ["cart", /href=["'][^"']*\/cart\b|add[\s-]to[\s-](cart|bag)/i],
  ["product-schema", /"@type"\s*:\s*"Product"|og:type["']\s+content=["']product/i],
  ["checkout", /\/checkout\b|shop pay|afterpay|klarna/i],
];

export function storeSignals(html: string): string[] {
  return STORE_SIGNALS.filter(([, re]) => re.test(html)).map(([name]) => name);
}

export function isStore(signals: string[]): boolean {
  const platform = signals.some((s) =>
    ["shopify", "bigcommerce", "magento", "woocommerce", "salesforce"].includes(s),
  );
  return platform ? signals.length >= 2 : signals.length >= 3;
}

export interface Check {
  input: string;
  domain: string;
  ok: boolean;
  reason: string;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

async function checkOne(input: string, taken: Set<string>): Promise<Check> {
  const asked = normDomain(input);
  if (!asked || !asked.includes("."))
    return { input, domain: asked, ok: false, reason: "not a domain" };
  if (taken.has(asked))
    return { input, domain: asked, ok: false, reason: "already on sheet or queued" };
  let res: Response;
  try {
    res = await fetch(`https://${asked}/`, {
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    const msg =
      error instanceof Error
        ? ((error.cause as Error | undefined)?.message ?? error.message)
        : String(error);
    return { input, domain: asked, ok: false, reason: `unreachable: ${msg.slice(0, 80)}` };
  }
  // Brands move domains: queue where the site actually lives.
  const domain = normDomain(res.url || asked);
  if (domain !== asked && taken.has(domain)) {
    return {
      input,
      domain,
      ok: false,
      reason: `redirects to ${domain}, already on sheet or queued`,
    };
  }
  if (res.status === 403 || res.status === 429 || res.status === 503) {
    return { input, domain, ok: false, reason: `bot protection (${String(res.status)})` };
  }
  if (!res.ok) return { input, domain, ok: false, reason: `HTTP ${String(res.status)}` };
  const html = (await res.text()).slice(0, 600_000);
  const signals = storeSignals(html);
  if (!isStore(signals)) {
    return {
      input,
      domain,
      ok: false,
      reason: `not a store (${signals.join(", ") || "no signals"})`,
    };
  }
  return { input, domain, ok: true, reason: signals.join(", ") };
}

/** Check each candidate, queue the good ones, report every decision. */
export async function addToQueue(
  candidates: string[],
  sheetDomains: Set<string>,
): Promise<Check[]> {
  const taken = new Set([...sheetDomains, ...readQueue()]);
  const out: Check[] = [];
  for (const c of candidates.map((x) => x.trim()).filter(Boolean)) {
    const check = await checkOne(c, taken);
    out.push(check);
    if (check.ok) {
      taken.add(check.domain);
      appendQueue([check.domain]);
    }
  }
  return out;
}
