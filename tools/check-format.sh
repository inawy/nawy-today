#!/usr/bin/env bash
# Guard: Prettier formatting. On failure, apply Prettier in the runner and print the
# resulting patch as an annotation, so it can be applied from an environment without npm.
set -uo pipefail

if npm run format:check; then
  exit 0
fi

npm run format >/dev/null 2>&1
git diff -- src tests vite.config.ts eslint.config.js index.html \
  | python3 tools/annotate.py "format-patch" head 150000 3000
exit 1
