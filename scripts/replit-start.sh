#!/bin/sh
set -eu

# Replit-friendly production start: always build the UI and API into one
# process so the exposed port serves both the website and /api endpoints.
./scripts/check-runtime.sh
pnpm run typecheck:libs
pnpm --filter @workspace/ecodev build
pnpm --filter @workspace/api-server build
exec pnpm --filter @workspace/api-server start
