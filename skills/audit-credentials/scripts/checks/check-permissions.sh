#!/bin/bash
# Check file permissions on sensitive files
# Exit 0: all correct, Exit 1: wrong permissions
set -euo pipefail

failures=0

check_perm() {
  local path="$1"
  local expected="$2"
  [ -e "$path" ] || return 0
  local actual
  actual=$(stat -f "%Mp%Lp" "$path" 2>/dev/null || stat -c "%a" "$path" 2>/dev/null || echo "unknown")
  if [ "$actual" != "$expected" ]; then
    echo "$path has permissions $actual, expected $expected" >&2
    failures=$((failures + 1))
  fi
}

# ~/.agents JSON files must be 600
for f in "$HOME/.agents/"*.json; do
  [ -f "$f" ] && check_perm "$f" "0600"
done

# SSH and GPG directories
check_perm "$HOME/.ssh" "0700"
check_perm "$HOME/.gnupg" "0700"

[ $failures -eq 0 ]
