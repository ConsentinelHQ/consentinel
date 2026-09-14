import { writeFileSync, mkdirSync } from "node:fs";
import { scan } from "../apps/scanner/src/index.js";
import type { ScanResult } from "@consentinel/shared";

/**
 * Batch harness for signature-library research. Not part of the product.
 *
 * Runs sequentially on purpose: parallel Chromium instances distort timing,
 * and a tag that fires late is exactly what we are trying to catch.
 */
const TARGETS = [
  "https://www.allbirds.com",
  "https://vuori.com",
  "https://www.untuckit.com",
  "https://mizzenandmain.com",
  "https://rothys.com",
  "https://www.beautycounter.com",
  "https://iliabeauty.com",
  "https://youthtothepeople.com",
  "https://burrow.com",
  "https://floyddetroit.com",
  "https://www.brooklinen.com",
  "https://athleticbrewing.com",
  "https://magicspoon.com",
  "https://drinkolipop.com",
  "https://huckberry.com",
  "https://www.cotopaxi.com",
  "https://www.thefarmersdog.com",
  "https://meetlalo.com",
  "https://www.hims.com",
  "https://ritual.com",
];

interface Row {
  url: string;
  ok: boolean;
  error?: string;
  cmp?: string | null;
  observedUnder?: string;
  critical?: number;
  warning?: number;
  headline?: string;
  vendors?: string[];
  unattributed?: string[];
}

async function main(): Promise<void> {
  mkdirSync("out", { recursive: true });
  const rows: Row[] = [];

  for (const [i, url] of TARGETS.entries()) {
    process.stderr.write(`[${String(i + 1)}/${String(TARGETS.length)}] ${url}\n`);
    try {
      const r: ScanResult = await scan(url);
      const unattributed = r.findings
        .filter((f) => f.type === "cookie-set-pre-consent" && f.category === "unknown")
        .map((f) => f.vendor);
      const vendors = [
        ...new Set(r.findings.filter((f) => f.category !== "unknown").map((f) => f.vendor)),
      ];

      rows.push({
        url,
        ok: true,
        cmp: r.cmp.detected?.name ?? null,
        observedUnder: r.findings[0]?.observedUnder ?? "n/a",
        critical: r.counts.critical,
        warning: r.counts.warning,
        headline: r.headline,
        vendors,
        unattributed,
      });
      writeFileSync(`out/${new URL(url).hostname}.json`, JSON.stringify(r, null, 2));
    } catch (e) {
      const error = e instanceof Error ? e.message.split("\n")[0] : "failed";
      rows.push({ url, ok: false, error });
      process.stderr.write(`    FAILED: ${String(error)}\n`);
    }
  }

  writeFileSync("out/summary.json", JSON.stringify(rows, null, 2));

  // Every unattributed cookie across all sites, by frequency. This is the
  // worklist for the next cookie-signature pass.
  const freq = new Map<string, number>();
  for (const r of rows) for (const c of r.unattributed ?? []) freq.set(c, (freq.get(c) ?? 0) + 1);
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]);

  console.log("\n=== SUMMARY ===");
  for (const r of rows) {
    console.log(
      r.ok
        ? `${r.url}\n  ${String(r.critical)} critical / ${String(r.warning)} warning | CMP: ${r.cmp ?? "none"} | observed: ${r.observedUnder ?? "?"}\n  vendors: ${(r.vendors ?? []).join(", ") || "none"}`
        : `${r.url}\n  FAILED: ${r.error ?? "unknown"}`,
    );
  }
  console.log("\n=== UNATTRIBUTED COOKIES BY FREQUENCY ===");
  for (const [name, n] of ranked) console.log(`${String(n)}x  ${name}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
