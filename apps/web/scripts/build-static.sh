#!/usr/bin/env bash
# Build the static export that Convex hosts. Route handlers cannot be exported, and on Convex the
# same endpoints are served by convex/http.ts, so src/app/api is set aside for the build only.
set -euo pipefail
cd "$(dirname "$0")/.."
hold=$(mktemp -d)
mv src/app/api "$hold/api"
trap 'mv "$hold/api" src/app/api; rmdir "$hold"' EXIT
rm -rf out dist
STATIC_EXPORT=1 npx next build
mv out dist
