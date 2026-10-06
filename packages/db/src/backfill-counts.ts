// One-time: recount stored severity counts with the report's grouping.
// Dry run by default; pass --apply to write.
import postgres from "postgres";
import { displayCounts, type ScanResult } from "@consentinel/shared";

const url = process.env["DATABASE_URL"];
if (!url) throw new Error("DATABASE_URL is not set");
const apply = process.argv.includes("--apply");
const sql = postgres(url, { max: 1 });

const rows = await sql<
  { id: string; url: string; result: ScanResult | string; critical_count: number }[]
>`
  select id, url, result, critical_count from scans where result is not null`;
let changed = 0;
let skipped = 0;
for (const r of rows) {
  try {
    const result = typeof r.result === "string" ? (JSON.parse(r.result) as ScanResult) : r.result;
    const c = displayCounts(result);
    if (c.critical === r.critical_count) continue;
    changed += 1;
    if (changed <= 5) console.log(`${r.url}: ${String(r.critical_count)} -> ${String(c.critical)}`);
    if (apply) {
      await sql`update scans set critical_count = ${c.critical}, warning_count = ${c.warning}, info_count = ${c.info} where id = ${r.id}`;
    }
  } catch {
    skipped += 1;
  }
}
console.log(
  `${String(rows.length)} checked, ${String(changed)} ${apply ? "updated" : "would change"}, ${String(skipped)} skipped`,
);
await sql.end();
