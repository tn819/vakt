#!/bin/bash
# Check shell history for credential name patterns (never reads values)
# Exit 0: clean, Exit 1: credentials found in history
set -euo pipefail

CREDENTIAL_NAMES="${CREDENTIAL_NAMES:-}"

HISTORY_FILES=(
  "$HOME/.zsh_history"
  "$HOME/.bash_history"
  "$HOME/.local/share/fish/fish_history"
)

found=0
for cred in $CREDENTIAL_NAMES; do
  for hist_file in "${HISTORY_FILES[@]}"; do
    [ -f "$hist_file" ] || continue
    # Look for patterns like KEY=value or export KEY= (suggests value was typed inline)
    if grep -q "${cred}=" "$hist_file" 2>/dev/null; then
      echo "Found $cred= in $hist_file — value may have been typed inline" >&2
      found=$((found + 1))
    fi
  done
done

[ $found -eq 0 ]
