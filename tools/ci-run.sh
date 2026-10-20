#!/usr/bin/env bash
# Runs a command; on failure, surfaces the tail of its output as a single GitHub
# annotation so the failure is readable through the check-runs API.
# Usage: tools/ci-run.sh <label> <command...>
set -uo pipefail
label="$1"; shift
out="$(mktemp)"
"$@" 2>&1 | tee "$out"
rc="${PIPESTATUS[0]}"
if [ "$rc" -ne 0 ] && [ "$label" = "e2e" ]; then
  # Browser failures are long: keep the last 28 KB as up to 8 numbered annotations.
  sed 's/\x1b\[[0-9;]*m//g' "$out" | python3 tools/annotate.py "e2e failed (exit ${rc})" tail 28000 3500
elif [ "$rc" -ne 0 ]; then
  msg="$(tail -c 3500 "$out" | python3 -c 'import sys; s=sys.stdin.read(); print(s.replace("%","%25").replace("\r","%0D").replace("\n","%0A"), end="")')"
  echo "::error title=${label} failed (exit ${rc})::${msg}"
fi
if [ "$rc" -eq 0 ] && [ "$label" = "test" ]; then
  summary="$(sed 's/\x1b\[[0-9;]*m//g' "$out" | grep -E '^ *(Test Files|Tests) ' | tr -s ' ' | tr '\n' ';')"
  echo "::notice title=test summary::${summary}"
fi
exit "$rc"
