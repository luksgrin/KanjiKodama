#!/bin/sh
# Everything CI would run, locally (there are no GitHub Actions minutes): typecheck, tests,
# the core import boundary, and the production build.
# Usage (from anywhere): web/scripts/check.sh
set -e
cd "$(dirname "$0")/.."
npm run typecheck
npm test
node scripts/check-core-imports.mjs
npm run build
