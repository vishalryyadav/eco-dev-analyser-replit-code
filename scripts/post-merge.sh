#!/bin/sh
set -eu

# Install the pinned workspace dependencies after a Replit merge.
pnpm install --frozen-lockfile

# Database setup is optional for the analyzer and should not prevent startup
# when no database is configured.
if [ -n "${DATABASE_URL:-}" ]; then
  pnpm --filter db push
fi

# Refresh native/runtime dependencies provided by the Replit environment.
exit 0
