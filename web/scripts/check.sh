#!/bin/sh
# Everything CI would run, locally (there are no GitHub Actions minutes): typecheck, tests,
# the core import boundary, the WaniKani leak check on tracked files, and the production build
# (which builds the private content first: needs durtles/app/src/main/assets/wk-content.db).
# Usage (from anywhere): web/scripts/check.sh
set -e
cd "$(dirname "$0")/.."
npm run typecheck
npm test
node scripts/check-core-imports.mjs
node scripts/check-no-private.mjs
npm run build
