#!/usr/bin/env bash
# Consentinel deploy check: start a scan, wait for it, and fail on new critical findings.
# Needs curl and jq (both on GitHub's Linux and macOS runners).
set -uo pipefail

HOOK="${CONSENTINEL_HOOK:-}"
FAIL_ON="${FAIL_ON:-new}"
WAIT="${WAIT:-true}"
TIMEOUT_MINUTES="${TIMEOUT_MINUTES:-15}"
FAIL_ON_ERROR="${FAIL_ON_ERROR:-false}"
POLL_SECONDS="${POLL_SECONDS:-15}"
OUT="${GITHUB_OUTPUT:-/dev/null}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"

out() { echo "$1=$2" >>"$OUT"; }

# Our problem, not theirs: warn and pass unless they asked to fail.
give_up() {
  echo "::warning title=Consentinel::$1"
  printf '### Consentinel consent check\n\nCouldn'"'"'t run: %s\n' "$1" >>"$SUMMARY"
  out verdict error
  [ "$FAIL_ON_ERROR" = "true" ] && exit 1
  exit 0
}

[ -n "$HOOK" ] || give_up "hook-url is empty. Add your deploy URL as a secret and pass it in."
command -v jq >/dev/null || give_up "jq isn't installed on this runner."
case "$FAIL_ON" in new | any | never) ;; *) give_up "fail-on must be new, any or never." ;; esac
HOOK="${HOOK%%\?*}"

# 1. Start the scan. An in-flight scan for the site is reused.
start=$(curl -sS -X POST -w '\n%{http_code}' "$HOOK") || give_up "couldn't reach Consentinel."
code=$(tail -n1 <<<"$start")
body=$(sed '$d' <<<"$start")
scan=$(jq -r '.scanId // empty' <<<"$body" 2>/dev/null)
if [ -z "$scan" ]; then
  give_up "$(jq -r '.error // empty' <<<"$body" 2>/dev/null || true) (HTTP $code)"
fi
out scan-id "$scan"
echo "Consentinel scan $scan started."

if [ "$WAIT" != "true" ]; then
  out verdict started
  exit 0
fi

# 2. Wait for the verdict.
deadline=$(($(date +%s) + TIMEOUT_MINUTES * 60))
while :; do
  res=$(curl -sS "$HOOK?scan=$scan") || res=""
  status=$(jq -r '.status // empty' <<<"$res" 2>/dev/null)
  case "$status" in
    complete | failed) break ;;
  esac
  [ "$(date +%s)" -ge "$deadline" ] && give_up "no result after $TIMEOUT_MINUTES minutes. The scan keeps running; check Consentinel."
  sleep "$POLL_SECONDS"
done

report=$(jq -r '.reportUrl // empty' <<<"$res")
out report-url "$report"
[ "$status" = "failed" ] && give_up "the scan failed: $(jq -r '.error' <<<"$res"). Report: $report"

verdict=$(jq -r '.verdict' <<<"$res")
critical=$(jq -r '.critical // 0' <<<"$res")
fresh=$(jq -r '.newCritical | length' <<<"$res")
out verdict "$verdict"
out new-critical "$fresh"

# 3. Job summary: what's new, the fix, and the exact GTM tag when there is one.
{
  echo "### Consentinel consent check"
  echo
  echo "$(jq -r '.headline // ""' <<<"$res")"
  echo
  echo "**$critical critical** in total, **$fresh new** since recent scans. [Full report]($report)"
  if [ "$fresh" -gt 0 ]; then
    echo
    echo "| New finding | Fix |"
    echo "| --- | --- |"
    jq -r '.newCritical[] | "| \(.title | gsub("\\|"; "/")) | \(.fix | gsub("\\|"; "/"))\(if .gtm then "<br>**In Google Tag Manager:** " + (.gtm | join("<br>") | gsub("\\|"; "/")) else "" end) |"' <<<"$res"
  fi
  [ "$verdict" = "baseline" ] && printf '\nFirst comparable scan for this site, so this one is the baseline.\n'
} >>"$SUMMARY"

fail=0
if [ "$FAIL_ON" = "new" ] && [ "$verdict" = "fail" ]; then fail=1; fi
if [ "$FAIL_ON" = "any" ] && [ "$critical" -gt 0 ]; then fail=1; fi
level=$([ "$fail" = 1 ] && echo error || echo warning)

echo "Verdict: $verdict. $critical critical, $fresh new. $report"
jq -r --arg l "$level" '.newCritical[] | "::\($l) title=Consentinel - \(.vendor)::\(.title). \(.fix)"' <<<"$res"
exit "$fail"
