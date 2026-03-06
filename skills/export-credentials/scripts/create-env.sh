#!/bin/bash
# Create a local .env file with credentials from credential store
# Generic tool: supports Keychain, pass, environment variables
#
# Usage: create-env.sh <output-file> [--store keychain|pass|env] [--service SERVICE_NAME] [--creds-json FILE]
#
# Examples:
#   create-env.sh .env.local                                          # Auto-detect store
#   create-env.sh .env.local --store keychain --service my-creds
#   create-env.sh .env.local --store pass --creds-json .detected-credentials.json

set -euo pipefail

OUTPUT_FILE="${1:-.env.local}"
STORE="${STORE:-auto}"
SERVICE_NAME="${SERVICE_NAME:-credentials}"
CREDENTIALS_JSON="${CREDENTIALS_JSON:-.detected-credentials.json}"

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

if [ ! -f "$CREDENTIALS_JSON" ]; then
  echo "Error: $CREDENTIALS_JSON not found" >&2
  exit 1
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

echo "Creating $OUTPUT_FILE from $STORE credentials..." >&2

# Create .env file with strict permissions
touch "$OUTPUT_FILE"
chmod 600 "$OUTPUT_FILE"

# Add header (never commit warning)
cat > "$OUTPUT_FILE" << 'EOF'
# LOCAL CREDENTIALS - NEVER COMMIT THIS FILE
# This file contains secrets and should NEVER be committed to version control.
# Add to .gitignore: .env.local, .env.*.local, .env.secret
#
# Credentials were generated from a secure local credential store.
# If this file is compromised, rotate your credentials immediately.
EOF

echo "" >> "$OUTPUT_FILE"

# Extract credentials and write them
CREDENTIALS=$(grep -o '"name":"[^"]*"' "$CREDENTIALS_JSON" | cut -d'"' -f4)
WRITTEN_COUNT=0

for cred_name in $CREDENTIALS; do
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
    continue
  fi

  # Write to file (values stay in file, never in stdout/stderr)
  echo "$cred_name=$cred_value" >> "$OUTPUT_FILE"
  echo "✓ Added: $cred_name" >&2
  WRITTEN_COUNT=$((WRITTEN_COUNT + 1))
done

echo ""
echo "✓ Created $OUTPUT_FILE with $WRITTEN_COUNT credentials" >&2
echo "⚠️  This file contains secrets! Never commit it." >&2
echo "⚠️  Add '.env.local' to your .gitignore" >&2

# Verify file exists and is readable
if [ -f "$OUTPUT_FILE" ] && [ -r "$OUTPUT_FILE" ]; then
  exit 0
else
  echo "✗ Failed to create $OUTPUT_FILE" >&2
  exit 1
fi
