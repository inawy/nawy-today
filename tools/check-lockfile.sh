#!/usr/bin/env bash
# Guard: package-lock.json must match package.json.
# If not, print the exact patch as an annotation so it can be applied from an
# environment without npm access (see D-015), then fail.
set -uo pipefail

if ! npm install --package-lock-only --ignore-scripts --no-audit --no-fund >/dev/null 2>&1; then
  echo "::error title=lockfile check::npm install --package-lock-only failed"
  exit 1
fi

if git diff --quiet -- package-lock.json; then
  echo "lockfile is in sync"
  exit 0
fi

git diff -- package-lock.json | python3 tools/annotate.py "lockfile out of sync - apply this patch" head 40000
exit 1
