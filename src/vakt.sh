#!/usr/bin/env bash
BUN=$(command -v bun 2>/dev/null || echo "${HOME}/.bun/bin/bun")
# Use the real user's bun if HOME has been sandboxed
if [[ ! -x "$BUN" ]]; then
  BUN=$(ls /Users/*/\.bun/bin/bun 2>/dev/null | head -1)
fi
exec "$BUN" run "$(dirname "$(realpath "$0")")/index.ts" "$@"
