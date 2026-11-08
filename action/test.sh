#!/usr/bin/env bash
# Runs check.sh against a local mock of the deploy hook API.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
fails=0
run() { # mode fail-on expected-exit
  port=$((18000 + RANDOM % 1000))
  python3 "$here/test-server.py" "$1" "$port" &
  pid=$!
  sleep 1
  out=$(mktemp)
  NO_PROXY=127.0.0.1 no_proxy=127.0.0.1 POLL_SECONDS=1 FAIL_ON="$2" GITHUB_OUTPUT="$out" \
    GITHUB_STEP_SUMMARY=/dev/null CONSENTINEL_HOOK="http://127.0.0.1:$port/api/hooks/deploy/t" \
    "$here/check.sh" >/dev/null 2>&1
  code=$?
  kill "$pid" 2>/dev/null
  if [ "$code" != "$3" ]; then
    echo "FAIL: mode=$1 fail-on=$2 exit=$code, wanted $3"
    fails=1
  fi
  rm -f "$out"
}
run fail new 1
run pass new 0
run pass any 1
run fail never 0
run 402 new 0
[ "$fails" = 0 ] && echo "action: all checks passed"
exit "$fails"
