#!/usr/bin/env bash
# Local batch scan. Writes JSON per site and a summary line per site.
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p scripts/out

SITES=(
  "https://athleticbrewing.com"
  "https://magicspoon.com"
)

for url in "${SITES[@]}"; do
  slug=$(echo "$url" | sed -E 's|https?://||; s|/$||; s|[^a-z0-9]|-|g')
  echo "--- $url"
  if pnpm --silent --filter @consentinel/scanner scan "$url" > "scripts/out/$slug.json" 2>"scripts/out/$slug.err"; then
    node -e '
      const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      const f = r.findings ?? [];
      const n = s => f.filter(x => x.severity === s).length;
      const vendors = [...new Set(f.map(x => x.vendor).filter(Boolean))];
      console.log(`  ${n("critical")} critical / ${n("warning")} warning | CMP: ${r.cmp?.name ?? "none"} | observed: ${r.consentState ?? "?"}`);
      console.log(`  vendors (${vendors.length}): ${vendors.join(", ")}`);
    ' "scripts/out/$slug.json"
  else
    echo "  FAILED - see scripts/out/$slug.err"
  fi
done
