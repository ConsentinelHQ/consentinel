// Summarise a scan JSON: counts, CMP, consent state, real vendors only.
const fs = require("fs");
const r = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const f = r.findings ?? [];

// Only findings carrying a known vendor. Unattributed cookies have no vendor
// in the signature library, so they must not inflate the vendor count.
const known = f.filter((x) => x.vendor && x.category !== "unattributed");
const vendors = [...new Set(known.map((x) => x.vendor))].sort();
const states = [...new Set(f.map((x) => x.observedUnder).filter(Boolean))];
const crit = [...new Set(known.filter((x) => x.severity === "critical").map((x) => x.vendor))];

console.log(`  ${r.url}`);
console.log(`  counts: ${JSON.stringify(r.counts)}`);
console.log(`  CMP: ${r.cmp?.detected?.name ?? "NONE DETECTED"} (${r.cmp?.detected?.confidence ?? "-"}) | observed: ${states.join(",") || "?"} | gatedCorrectly: ${(r.correctlyGated ?? []).length}`);
console.log(`  critical vendors (${crit.length}): ${crit.sort().join(", ")}`);
console.log(`  headline: ${r.headline}`);
console.log(`  all vendors (${vendors.length})`);
