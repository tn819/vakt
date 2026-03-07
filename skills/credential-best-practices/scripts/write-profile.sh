#!/bin/bash
# Write credential profile to ~/.agents/credential-profile.json
# Collects names and configuration only — never reads or stores values
#
# Usage: write-profile.sh [--store keychain|pass|env] [--service NAME]
#                         [--rotation-days N] [--creds "KEY1 KEY2 KEY3"]

set -euo pipefail

STORE=""
SERVICE_NAME="${SERVICE_NAME:-agentctl}"
ROTATION_DAYS="${ROTATION_DAYS:-90}"
CREDENTIAL_NAMES="${CREDENTIAL_NAMES:-}"
OUTPUT="$HOME/.agents/credential-profile.json"

# Auto-detect store if not specified
if [ -z "$STORE" ]; then
  if command -v security >/dev/null 2>&1 && [ "$(uname)" = "Darwin" ]; then
    STORE="keychain"
  elif command -v pass >/dev/null 2>&1; then
    STORE="pass"
  else
    STORE="env"
  fi
fi

# Parse optional arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --store) STORE="$2"; shift 2 ;;
    --service) SERVICE_NAME="$2"; shift 2 ;;
    --rotation-days) ROTATION_DAYS="$2"; shift 2 ;;
    --creds) CREDENTIAL_NAMES="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# Build credentials JSON array from space-separated names
CREDS_JSON="["
first=true
for cred in $CREDENTIAL_NAMES; do
  [ "$first" = false ] && CREDS_JSON+=","
  CREDS_JSON+="\"$cred\""
  first=false
done
CREDS_JSON+="]"

mkdir -p "$HOME/.agents"

cat > "$OUTPUT" << EOF
{
  "store": "$STORE",
  "service_name": "$SERVICE_NAME",
  "credentials": $CREDS_JSON,
  "conventions": {
    "rotation_days": $ROTATION_DAYS,
    "naming": "UPPER_SNAKE_CASE"
  },
  "last_reviewed": "$(date +%Y-%m-%d)"
}
EOF

chmod 600 "$OUTPUT"
echo "Profile written to $OUTPUT" >&2
echo "Credential names recorded: $CREDENTIAL_NAMES" >&2
