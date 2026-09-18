#!/usr/bin/env bash
# Local batch scan. Writes JSON per site and a summary line per site.
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p scripts/out

SITES=(
  "https://www.allbirds.com"
  "https://vuori.com"
  "https://www.untuckit.com"
  "https://mizzenandmain.com"
  "https://rothys.com"
  "https://www.beautycounter.com"
  "https://iliabeauty.com"
  "https://youthtothepeople.com"
  "https://burrow.com"
  "https://floyddetroit.com"
  "https://www.brooklinen.com"
  "https://athleticbrewing.com"
  "https://magicspoon.com"
  "https://drinkolipop.com"
  "https://huckberry.com"
  "https://www.cotopaxi.com"
  "https://www.thefarmersdog.com"
  "https://meetlalo.com"
  "https://www.hims.com"
  "https://ritual.com"
)

for url in "${SITES[@]}"; do
  slug=$(echo "$url" | sed -E 's|https?://||; s|/$||; s|[^a-z0-9]|-|g')
  echo "--- $url"
  if pnpm --silent --filter @consentinel/scanner scan "$url" > "scripts/out/$slug.json" 2>"scripts/out/$slug.err"; then
    node scripts/summarize.cjs "scripts/out/$slug.json"
  else
    echo "  FAILED - see scripts/out/$slug.err"
  fi
done
