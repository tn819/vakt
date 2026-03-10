#\!/usr/bin/env bash
exec bun run "$(dirname "$(realpath "$0")")/index.ts" "$@"
