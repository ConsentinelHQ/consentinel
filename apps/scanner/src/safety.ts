import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF guard.
 *
 * We render arbitrary URLs supplied by anonymous strangers. Without this, the free
 * scanner is a request-forgery proxy: someone submits http://169.254.169.254/ and
 * we fetch cloud credentials on their behalf, or probes an internal service and
 * reads the result out of the findings.
 *
 * The roadmap files this under Phase 7, but it must exist the moment a public form
 * accepts a URL - not after. Resolution happens here, before the browser launches.
 */

export type UrlCheck = { ok: true; url: string } | { ok: false; reason: string };

const BLOCKED_PORTS = new Set([22, 23, 25, 445, 3306, 5432, 6379, 9200, 11211, 27017]);

export async function assertScannableUrl(
  input: string,
  opts: { allowPrivate?: boolean } = {},
): Promise<UrlCheck> {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return { ok: false, reason: "not a valid URL" };
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, reason: `unsupported scheme "${u.protocol}"` };
  }
  if (u.username || u.password) {
    return { ok: false, reason: "credentials in URL are not accepted" };
  }
  if (u.port && BLOCKED_PORTS.has(Number(u.port))) {
    return { ok: false, reason: `port ${u.port} is not scannable` };
  }

  if (opts.allowPrivate) return { ok: true, url: u.toString() };

  // Resolve the hostname ourselves: a public name can point at a private address.
  const addresses = await resolveAll(u.hostname);
  if (addresses.length === 0) return { ok: false, reason: "hostname does not resolve" };
  for (const addr of addresses) {
    if (isPrivateAddress(addr)) {
      return { ok: false, reason: "target resolves to a private or reserved address" };
    }
  }

  return { ok: true, url: u.toString() };
}

async function resolveAll(hostname: string): Promise<string[]> {
  if (isIP(hostname)) return [hostname];
  try {
    const records = await lookup(hostname, { all: true });
    return records.map((r) => r.address);
  } catch {
    return [];
  }
}

export function isPrivateAddress(addr: string): boolean {
  const v = isIP(addr);
  if (v === 4) return isPrivateIPv4(addr);
  if (v === 6) return isPrivateIPv6(addr);
  return true; // unknown format - refuse rather than guess
}

function isPrivateIPv4(addr: string): boolean {
  const parts = addr.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a = 0, b = 0] = parts;
  if (a === 0) return true; // "this" network
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(addr: string): boolean {
  const a = addr.toLowerCase();
  if (a === "::" || a === "::1") return true;
  if (a.startsWith("fe80")) return true; // link-local
  if (a.startsWith("fc") || a.startsWith("fd")) return true; // unique local
  // IPv4-mapped: defer to the v4 rules.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (mapped?.[1]) return isPrivateIPv4(mapped[1]);
  return false;
}
