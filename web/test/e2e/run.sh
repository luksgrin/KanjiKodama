#!/bin/sh
# npm run e2e [-- playwright args]: builds and serves the app on 127.0.0.1, runs every project.
set -e
cd "$(dirname "$0")/../.."
exec npx playwright test "$@"
