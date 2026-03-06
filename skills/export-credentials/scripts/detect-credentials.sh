#!/bin/bash
# Detect available credentials from local credential store
# Generic tool: works with Keychain (macOS), pass (Linux), environment variables
#
# Usage: detect-credentials.sh [--store keychain|pass|env] [--service SERVICE_NAME] [--output FILE]
#
# Examples:
#   detect-credentials.sh                          # Auto-detect, Keychain on macOS
#   detect-credentials.sh --store pass             # Use 'pass' password manager
#   detect-credentials.sh --store env              # Use environment variables
#   detect-credentials.sh --service my-secrets     # Keychain service name

set -euo pipefail

STORE="${STORE:-auto}"
SERVICE_NAME="${SERVICE_NAME:-credentials}"
OUTPUT_FILE="${OUTPUT_FILE:-.detected-credentials.json}"

# Detect platform and credential store if auto
if [ "$STORE" = "auto" ]; then
  if command -v security >/dev/null 2>&1 && [ "$(uname)" = "Darwin" ]; then
    STORE="keychain"
    echo "Auto-detected: macOS Keychain" >&2
  elif command -v pass >/dev/null 2>&1; then
    STORE="pass"
    echo "Auto-detected: pass password manager" >&2
  else
    STORE="env"
    echo "Auto-detected: environment variables" >&2
  fi
fi

echo "Detecting credentials from: $STORE" >&2

DETECTED="["
first=true

case "$STORE" in
  keychain)
    # macOS Keychain: query without reading values
    if ! command -v security >/dev/null 2>&1; then
      echo "✗ Error: 'security' command not found (macOS Keychain access)" >&2
      echo "ℹ This tool is macOS-specific. On Linux, use: STORE=pass ./detect-credentials.sh" >&2
      exit 1
    fi
    ACCOUNTS=$(security find-generic-password -s "$SERVICE_NAME" 2>/dev/null | grep "acct" | cut -d'"' -f4 || true)
    for account in $ACCOUNTS; do
      if [ "$first" = false ]; then
        DETECTED+=","
      fi
      DETECTED+="{\"name\":\"$account\",\"available\":true,\"store\":\"keychain\"}"
      echo "✓ Found: $account" >&2
      first=false
    done
    ;;

  pass)
    # pass password manager: list entries without reading values
    if ! command -v pass >/dev/null 2>&1; then
      echo "✗ Error: 'pass' command not found" >&2
      echo "ℹ Install with: sudo apt install pass (Ubuntu) or brew install pass (macOS)" >&2
      exit 1
    fi
    if [ -d "$HOME/.password-store" ]; then
      ENTRIES=$(find "$HOME/.password-store" -name "*.gpg" | sed "s|$HOME/.password-store/||;s|\.gpg$||" || true)
      for entry in $ENTRIES; do
        if [ "$first" = false ]; then
          DETECTED+=","
        fi
        DETECTED+="{\"name\":\"$entry\",\"available\":true,\"store\":\"pass\"}"
        echo "✓ Found: $entry" >&2
        first=false
      done
    fi
    ;;

  env)
    # Environment variables: only show names (values already in environment)
    # User should specify which env vars are credentials
    echo "ℹ Environment variables are already available" >&2
    echo "Specify credential names via environment: CREDENTIAL_NAMES=\"KEY1 KEY2 KEY3\"" >&2
    if [ -n "${CREDENTIAL_NAMES:-}" ]; then
      for cred in $CREDENTIAL_NAMES; do
        if [ -n "${!cred:-}" ]; then
          if [ "$first" = false ]; then
            DETECTED+=","
          fi
          DETECTED+="{\"name\":\"$cred\",\"available\":true,\"store\":\"env\"}"
          echo "✓ Found: $cred" >&2
          first=false
        fi
      done
    fi
    ;;

  *)
    echo "Unknown credential store: $STORE" >&2
    echo "Supported: keychain, pass, env" >&2
    exit 1
    ;;
esac

DETECTED+="]"

# Write to file (never stdout)
echo "$DETECTED" > "$OUTPUT_FILE"
echo "Credentials saved to: $OUTPUT_FILE" >&2
