#!/bin/bash
# Add credentials to GitHub Secrets from local credential store
# Generic tool: supports Keychain, pass, environment variables
#
# Usage: add-to-github.sh <owner/repo> [--store keychain|pass|env] [--service SERVICE_NAME] [--creds-json FILE]
#
# Examples:
#   add-to-github.sh owner/repo                                    # Auto-detect store
#   add-to-github.sh owner/repo --store keychain --service my-creds
#   add-to-github.sh owner/repo --store pass --creds-json .detected-credentials.json

set -euo pipefail

REPO="${1:-}"
STORE="${STORE:-auto}"
SERVICE_NAME="${SERVICE_NAME:-credentials}"
CREDENTIALS_JSON="${CREDENTIALS_JSON:-.detected-credentials.json}"

if [ -z "$REPO" ]; then
  echo "Usage: $0 <owner/repo> [--store keychain|pass|env] [--service SERVICE_NAME]" >&2
  exit 1
fi

# Parse optional arguments
while [[ $# -gt 1 ]]; do
  case "$2" in
    --store)
      STORE="$3"
      shift 2
      ;;
    --service)
      SERVICE_NAME="$3"
      shift 2
      ;;
    --creds-json)
      CREDENTIALS_JSON="$3"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

AUDIT_REPORT="${AUDIT_REPORT:-$HOME/.agents/audit-report.json}"
SKIP_AUDIT="${SKIP_AUDIT:-false}"

# Load failed credentials from audit report if present
AUDIT_FAILED=""
if [ "$SKIP_AUDIT" != "true" ] && [ -f "$AUDIT_REPORT" ]; then
  AUDIT_FAILED=$(tr -d '\n\r ' < "$AUDIT_REPORT" | grep -o '"failed":\[[^]]*\]' | grep -o '"[A-Z_][A-Z0-9_]*"' | tr -d '"' | tr '\n' ' ' || true)
  if [ -n "$AUDIT_FAILED" ]; then
    echo "Audit report found — skipping failed credentials: $AUDIT_FAILED" >&2
  fi
fi

# Auto-detect credential store if needed
if [ "$STORE" = "auto" ]; then
  if command -v security >/dev/null 2>&1 && [ "$(uname)" = "Darwin" ]; then
    STORE="keychain"
  elif command -v pass >/dev/null 2>&1; then
    STORE="pass"
  else
    STORE="env"
  fi
fi

echo "Adding credentials to GitHub Secrets for $REPO from $STORE..." >&2

# Check for gh CLI
if ! command -v gh >/dev/null 2>&1; then
  echo "✗ Error: GitHub CLI (gh) not found" >&2
  echo "ℹ Install with: brew install gh (macOS) or sudo apt install gh (Ubuntu)" >&2
  echo "ℹ Then authenticate: gh auth login" >&2
  exit 1
fi

if [ ! -f "$CREDENTIALS_JSON" ]; then
  echo "✗ Error: $CREDENTIALS_JSON not found" >&2
  echo "ℹ Run detect-credentials.sh first to generate the credentials list" >&2
  exit 1
fi

SUCCESS_COUNT=0
FAIL_COUNT=0

# Extract credential names from JSON
CREDENTIALS=$(grep -o '"name":"[^"]*"' "$CREDENTIALS_JSON" | cut -d'"' -f4)

for cred_name in $CREDENTIALS; do
  # Skip credentials that failed audit
  if echo " $AUDIT_FAILED " | grep -q " $cred_name "; then
    echo "⚠ Skipping $cred_name (failed audit — run audit-credentials to see why)" >&2
    FAIL_COUNT=$((FAIL_COUNT + 1))
    continue
  fi

  cred_value=""

  # Read value based on credential store
  case "$STORE" in
    keychain)
      cred_value=$(security find-generic-password -s "$SERVICE_NAME" -a "$cred_name" -w 2>/dev/null || echo "")
      ;;
    pass)
      if [ -f "$HOME/.password-store/$cred_name.gpg" ]; then
        cred_value=$(pass show "$cred_name" 2>/dev/null | head -1 || echo "")
      fi
      ;;
    env)
      cred_value="${!cred_name:-}"
      ;;
  esac

  if [ -z "$cred_value" ]; then
    echo "✗ Failed to read $cred_name from $STORE" >&2
    FAIL_COUNT=$((FAIL_COUNT + 1))
    continue
  fi

  # Add to GitHub Secrets (never log the value)
  if gh secret set "$cred_name" -b"$cred_value" --repo "$REPO" 2>/dev/null; then
    echo "✓ Added: $cred_name" >&2
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  else
    echo "✗ Failed to add $cred_name (check gh authentication and repo access)" >&2
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
done

echo ""
echo "Summary: $SUCCESS_COUNT added, $FAIL_COUNT failed" >&2

# Write results (never include values)
cat > .github-secrets-result.json << EOF
{
  "repo": "$REPO",
  "store": "$STORE",
  "timestamp": "$(date -Iseconds)",
  "added": $SUCCESS_COUNT,
  "failed": $FAIL_COUNT,
  "status": "complete"
}
EOF

if [ $FAIL_COUNT -eq 0 ]; then
  exit 0
else
  exit 1
fi
