#!/bin/bash
# Scan current git repo for hardcoded credential patterns
# Never reads credential values — checks for names appearing in source
set -euo pipefail

CREDENTIAL_NAMES="${CREDENTIAL_NAMES:-}"

# Only run if inside a git repo
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Not in a git repo — skipping" >&2
  exit 0
fi

found=0

# Check if .env is tracked
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  echo ".env is tracked by git — should be in .gitignore" >&2
  found=$((found + 1))
fi

# Check for hardcoded credential name patterns in source
for cred in $CREDENTIAL_NAMES; do
  if git grep -q "${cred}=" -- ':!*.sh' ':!*.md' 2>/dev/null; then
    echo "$cred= found hardcoded in source files" >&2
    found=$((found + 1))
  fi
done

[ $found -eq 0 ]
