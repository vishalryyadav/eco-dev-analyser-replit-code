#!/bin/sh
set -eu

# Replit-friendly startup: fail with a useful diagnostic instead of serving a UI
# that can only perform static analysis when the secure execution toolchain is absent.
./scripts/check-runtime.sh
exec pnpm --filter @workspace/api-server dev
