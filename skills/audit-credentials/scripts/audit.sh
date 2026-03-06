#!/bin/bash
# Run all credential security checks and write audit-report.json
# Never reads or exposes credential values — checks metadata and structure only
#
# Usage: audit.sh [--profile FILE] [--output FILE]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE_FILE="${PROFILE_FILE:-$HOME/.agents/credential-profile.json}"
OUTPUT_FILE="${OUTPUT_FILE:-$HOME/.agents/audit-report.json}"

PASSED=()
FAILED=()
WARNINGS=()

# Load credential names from profile or environment
CREDENTIAL_NAMES="${CREDENTIAL_NAMES:-}"
if [ -f "$PROFILE_FILE" ] && [ -z "$CREDENTIAL_NAMES" ]; then
  CREDENTIAL_NAMES=$(grep -o '"[A-Z_]*"' "$PROFILE_FILE" | tr -d '"' | grep -v "^store$\|^service_name$\|^naming$" | tr '\n' ' ' || true)
  echo "Loaded profile from $PROFILE_FILE" >&2
else
  echo "No profile found at $PROFILE_FILE — running generic checks" >&2
fi

ROTATION_DAYS=$(grep -o '"rotation_days":[0-9]*' "$PROFILE_FILE" 2>/dev/null | cut -d: -f2 || echo "90")
SERVICE_NAME=$(grep -o '"service_name":"[^"]*"' "$PROFILE_FILE" 2>/dev/null | cut -d'"' -f4 || echo "agentctl")

run_check() {
  local check_name="$1"
  local check_script="$2"
  shift 2

  if CREDENTIAL_NAMES="$CREDENTIAL_NAMES" \
     ROTATION_DAYS="$ROTATION_DAYS" \
     SERVICE_NAME="$SERVICE_NAME" \
     bash "$check_script" "$@" 2>/tmp/check-stderr-$$; then
    PASSED+=("$check_name")
    echo "✓ $check_name" >&2
  else
    local exit_code=$?
    local msg
    msg=$(cat /tmp/check-stderr-$$ | tail -1)
    if [ $exit_code -eq 2 ]; then
      WARNINGS+=("$check_name: $msg")
      echo "⚠ $check_name: $msg" >&2
    else
      FAILED+=("$check_name: $msg")
      echo "✗ $check_name: $msg" >&2
    fi
  fi
  rm -f /tmp/check-stderr-$$
}

CHECKS_DIR="$SCRIPT_DIR/checks"

run_check "rotation"    "$CHECKS_DIR/check-rotation.sh"
run_check "history"     "$CHECKS_DIR/check-history.sh"
run_check "permissions" "$CHECKS_DIR/check-permissions.sh"
run_check "gitrepo"     "$CHECKS_DIR/check-gitrepo.sh"

# Calculate score (100 - 25 per failure, -10 per warning)
SCORE=100
SCORE=$((SCORE - ${#FAILED[@]} * 25))
SCORE=$((SCORE - ${#WARNINGS[@]} * 10))
[ $SCORE -lt 0 ] && SCORE=0

# Build JSON arrays
to_json_array() {
  local json="["
  local first=true
  for item in "$@"; do
    [ -z "$item" ] && continue
    [ "$first" = false ] && json+=","
    json+="\"$(echo "$item" | sed 's/"/\\"/g')\""
    first=false
  done
  json+="]"
  echo "$json"
}

mkdir -p "$(dirname "$OUTPUT_FILE")"
cat > "$OUTPUT_FILE" << EOF
{
  "passed": $(to_json_array "${PASSED[@]:-}"),
  "failed": $(to_json_array "${FAILED[@]:-}"),
  "warnings": $(to_json_array "${WARNINGS[@]:-}"),
  "score": $SCORE,
  "timestamp": "$(date -Iseconds)"
}
EOF

chmod 600 "$OUTPUT_FILE"
echo "" >&2
echo "Audit complete. Score: $SCORE/100" >&2
echo "Report written to $OUTPUT_FILE" >&2

[ ${#FAILED[@]} -eq 0 ]
