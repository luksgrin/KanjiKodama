#!/bin/sh
# Builds the app (with the private content, which stays on this machine) into a cache directory and
# serves it on 127.0.0.1 only (never 0.0.0.0). Started by playwright.config.ts (webServer).
set -e
cd "$(dirname "$0")/../.."
OUT=node_modules/.cache/kk-e2e/dist
PORT="${KK_E2E_PORT:-4317}"
if [ "${KK_E2E_SKIP_BUILD:-}" != "1" ] || [ ! -f "$OUT/index.html" ]; then
  npm run content >/dev/null
  npx vite build --outDir "$OUT" --emptyOutDir --logLevel warn
fi
exec npx vite preview --outDir "$OUT" --host 127.0.0.1 --port "$PORT" --strictPort
