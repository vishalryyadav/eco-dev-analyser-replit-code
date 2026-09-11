#!/bin/sh
set -eu

printf 'EcoDev runtime smoke test\n'
command -v node >/dev/null
command -v pnpm >/dev/null
command -v python3 >/dev/null
command -v gcc >/dev/null
command -v g++ >/dev/null
command -v go >/dev/null
command -v time >/dev/null
command -v bwrap >/dev/null || command -v firejail >/dev/null

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

cat > "$workdir/main.c" <<'EOF'
#include <stdio.h>
int main(void) { puts("EcoDev smoke ok"); return 0; }
EOF

gcc -O2 -std=c11 "$workdir/main.c" -o "$workdir/main"

if command -v bwrap >/dev/null 2>&1; then
  bwrap --die-with-parent --unshare-all --new-session \
    --ro-bind /usr /usr --ro-bind /bin /bin --ro-bind /lib /lib \
    --ro-bind-try /usr/local /usr/local --ro-bind-try /lib64 /lib64 \
    --proc /proc --dev /dev --tmpfs /tmp --bind "$workdir" /workspace \
    --chdir /workspace --clearenv \
    --setenv PATH /usr/local/bin:/usr/bin:/bin \
    --setenv HOME /tmp --setenv LANG C.UTF-8 --setenv LC_ALL C.UTF-8 \
    -- /workspace/main
else
  firejail --quiet --private --net=none --caps.drop=all --noroot \
    -- /bin/sh -c '"$0"' "$workdir/main"
fi
