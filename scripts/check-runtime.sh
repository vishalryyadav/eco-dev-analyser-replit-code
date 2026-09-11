#!/bin/sh
set -eu
printf 'EcoDev runtime preflight\n'
command -v node >/dev/null || { echo 'ERROR: node is missing'; exit 1; }
command -v pnpm >/dev/null || { echo 'ERROR: pnpm is missing'; exit 1; }
for tool in python3 gcc g++ go /usr/bin/time; do
  if command -v "$tool" >/dev/null 2>&1 || [ -x "$tool" ]; then
    printf 'OK: %s\n' "$tool"
  else
    printf 'WARN: %s is unavailable\n' "$tool"
  fi
done
if command -v bwrap >/dev/null 2>&1; then
  echo 'OK: bubblewrap'
elif command -v firejail >/dev/null 2>&1; then
  echo 'OK: firejail'
else
  echo 'WARN: neither bubblewrap nor firejail is available; secure code execution will be disabled and static analysis will remain available.'
fi
node -e 'console.log("Node", process.version)'
