import { startFixtureServer } from "../fixtures/known-bad-shop";
import { scan } from "../src/index";
import type { ScanResult } from "@consentinel/shared";

function c(s: string, code: number): string {
  return `\x1b[${code}m${s}\x1b[0m`;
}
const mark = (b: boolean): string => (b ? c("PASS", 32) : c("FAIL", 31));

async function main(): Promise<void> {
  const { server, url } = await startFixtureServer();
  console.log(c("\nConsentinel engine - end-to-end integration proof\n", 1));

  // Hermetic: the fixture is the only host allowed to answer.
  const result: ScanResult = await scan(url, { blockThirdParty: true });

  // Render
  console.log(c(`  ${result.headline.toUpperCase()}`, 31));
  console.log(
    c(
      `  CMP: ${result.cmp.detected ? result.cmp.detected.name + " (" + result.cmp.detected.confidence + ")" : "none"}   ` +
        `${result.counts.critical} critical / ${result.counts.warning} warning   schema v${result.findings[0]?.schemaVersion ?? "n/a"}\n`,
      90,
    ),
  );
  for (const f of result.findings) {
    const col = f.severity === "critical" ? 31 : f.severity === "warning" ? 33 : 90;
    console.log(
      `  ${c("*", col)} ${c(f.severity.toUpperCase(), col)}  ${f.title}  ${c("[" + f.type + "]", 90)}`,
    );
  }
  console.log(
    c(
      `\n  Correctly gated (fired only after Accept): ${result.correctlyGated.map((g) => g.vendor).join(", ") || "none"}`,
      32,
    ),
  );

  // Ground-truth assertions
  const flagged = new Set(
    result.findings
      .filter((f) => f.type === "tracker-fires-pre-consent" || f.type === "consent-signal-ignored")
      .map((f) => f.vendor),
  );
  const gated = new Set(result.correctlyGated.map((g) => g.vendor));
  const checks: Array<[string, boolean]> = [
    ["CMP detected as OneTrust", result.cmp.detected?.name === "OneTrust"],
    ["GA4 flagged under rejected consent", flagged.has("Google Analytics 4")],
    [
      "GA4 finding typed consent-signal-ignored (gcs=G100)",
      result.findings.some(
        (f) => f.vendor === "Google Analytics 4" && f.type === "consent-signal-ignored",
      ),
    ],
    ["Meta Pixel flagged", flagged.has("Meta Pixel")],
    ["gtag.js flagged", flagged.has("Google gtag.js")],
    ["Email PII leak caught", result.findings.some((f) => f.type === "pii-leak-to-tracker")],
    [
      "_ga / _fbp cookies flagged",
      result.findings.filter((f) => f.type === "cookie-set-pre-consent").length >= 2,
    ],
    [
      "Reddit correctly gated, NOT flagged",
      gated.has("Reddit Pixel") && !flagged.has("Reddit Pixel"),
    ],
    // The scanner must outlast a deferred tag, or it under-reports the worst sites.
    ["late-firing tag caught 1.2s after load", flagged.has("Microsoft Clarity")],
    [
      "YouTube cookies attributed to the vendor, not listed by cookie name",
      result.findings.some((f) => f.type === "cookie-set-pre-consent" && f.vendor === "YouTube"),
    ],
    [
      "non-essential cookie pre-consent graded critical",
      result.findings.some((f) => f.vendor === "YouTube" && f.severity === "critical"),
    ],
    [
      "strictly necessary cookie NOT flagged",
      !result.findings.some((f) => JSON.stringify(f.evidence).includes("OptanonConsent")),
    ],
    [
      "findings observedUnder = rejected",
      result.findings.every((f) => f.observedUnder === "rejected"),
    ],
    ["every finding carries evidence", result.findings.every((f) => !!f.evidence)],
    [
      "compliance array present on every finding (Phase-6 ready)",
      result.findings.every((f) => Array.isArray(f.compliance)),
    ],
    ["critical findings sort first", isSorted(result)],
  ];

  console.log(c(`\n  Accuracy + schema conformance:`, 1));
  let pass = true;
  for (const [name, ok] of checks) {
    pass = pass && ok;
    console.log(`     ${mark(ok)}  ${name}`);
  }
  console.log(
    pass
      ? c("\n  M2 GREEN - full engine emits a correct ScanResult in the shared schema.\n", 32)
      : c("\n  FAILED - engine/schema mismatch, see above.\n", 31),
  );

  server.close();
  process.exit(pass ? 0 : 1);
}

function isSorted(r: ScanResult): boolean {
  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return r.findings.every(
    (f, i) => i === 0 || rank[r.findings[i - 1]!.severity] <= rank[f.severity],
  );
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
