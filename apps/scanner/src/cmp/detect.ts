import type { Page } from "playwright";
import { CMPS, CMP_REGISTRY_VERSION } from "./registry";

export interface CmpEvidence {
  globals: string[];
  selectors: string[];
  cookies: string[];
  scriptHosts: string[];
}

export interface DetectedCmp {
  id: string;
  name: string;
  confidence: "low" | "medium" | "high";
  evidence: CmpEvidence;
}

export interface CmpDetection {
  registryVersion: string;
  detected: DetectedCmp | null;
  ranked: Array<{ id: string; name: string; score: number; evidence: CmpEvidence }>;
}

export interface ConsentModeDetection {
  present: boolean;
  defaultState: "denied" | "granted" | null;
}

interface Probe {
  id: string;
  globalsHit: string[];
  selectorsHit: string[];
  cookiesHit: string[];
}

async function probePage(page: Page): Promise<Probe[]> {
  const input = CMPS.map((c) => ({
    id: c.id,
    globals: c.globals,
    selectors: c.selectors,
    cookies: c.cookies,
  }));
  return page.evaluate((cmps) => {
    const cookieNames = document.cookie
      .split(";")
      .map((c) => (c.split("=")[0] ?? "").trim())
      .filter(Boolean);
    return cmps.map((c) => ({
      id: c.id,
      globalsHit: c.globals.filter(
        (g) => typeof (window as unknown as Record<string, unknown>)[g] !== "undefined",
      ),
      selectorsHit: c.selectors.filter((s) => !!document.querySelector(s)),
      cookiesHit: c.cookies.filter((n) => cookieNames.includes(n)),
    }));
  }, input);
}

function hostsFromRequests(requests: Array<{ url: string }>): Set<string> {
  const hosts = new Set<string>();
  for (const r of requests) {
    try {
      hosts.add(new URL(r.url).hostname.replace(/^www\./, ""));
    } catch {
      // malformed URL, skip
    }
  }
  return hosts;
}

function confidenceLabel(score: number): "low" | "medium" | "high" {
  if (score >= 4) return "high";
  if (score >= 2) return "medium";
  return "low";
}

export async function detectCmp(
  page: Page,
  requests: Array<{ url: string }> = [],
): Promise<CmpDetection> {
  const probes = await probePage(page);
  const probeById = new Map(probes.map((p) => [p.id, p]));
  const hosts = [...hostsFromRequests(requests)];

  const ranked = CMPS.map((cmp) => {
    const p = probeById.get(cmp.id) ?? {
      id: cmp.id,
      globalsHit: [],
      selectorsHit: [],
      cookiesHit: [],
    };
    const scriptHostsHit = cmp.scriptHosts.filter((h) =>
      hosts.some((x) => x === h || x.endsWith("." + h)),
    );
    const score =
      (p.globalsHit.length ? 2 : 0) +
      (p.selectorsHit.length ? 2 : 0) +
      (p.cookiesHit.length ? 1 : 0) +
      (scriptHostsHit.length ? 2 : 0);
    return {
      id: cmp.id,
      name: cmp.name,
      score,
      evidence: {
        globals: p.globalsHit,
        selectors: p.selectorsHit,
        cookies: p.cookiesHit,
        scriptHosts: scriptHostsHit,
      },
    };
  }).sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const detected: DetectedCmp | null =
    top && top.score >= 2
      ? {
          id: top.id,
          name: top.name,
          confidence: confidenceLabel(top.score),
          evidence: top.evidence,
        }
      : null;

  return {
    registryVersion: CMP_REGISTRY_VERSION,
    detected,
    ranked: ranked.filter((r) => r.score > 0),
  };
}

export async function detectConsentMode(page: Page): Promise<ConsentModeDetection> {
  return page.evaluate(() => {
    const w = window as unknown as { dataLayer?: unknown[]; google_tag_data?: unknown };
    const dl = Array.isArray(w.dataLayer) ? w.dataLayer : [];
    let present = false;
    let defaultState: "denied" | "granted" | null = null;
    for (const entry of dl) {
      if (Array.isArray(entry) && entry[0] === "consent") {
        present = true;
        if (entry[1] === "default" && entry[2] && typeof entry[2] === "object") {
          const s = entry[2] as Record<string, string>;
          defaultState =
            s["analytics_storage"] === "granted" || s["ad_storage"] === "granted"
              ? "granted"
              : "denied";
        }
      }
    }
    if (typeof w.google_tag_data !== "undefined") present = true;
    return { present, defaultState };
  });
}
