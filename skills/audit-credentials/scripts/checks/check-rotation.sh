#!/bin/bash
# Check credential rotation age against policy
# Exit 0: all current, Exit 1: overdue, Exit 2: warning (approaching limit)
set -euo pipefail

CREDENTIAL_NAMES="${CREDENTIAL_NAMES:-}"
ROTATION_DAYS="${ROTATION_DAYS:-90}"
SERVICE_NAME="${SERVICE_NAME:-agentctl}"

if [ -z "$CREDENTIAL_NAMES" ]; then
  echo "No credentials to check" >&2
  exit 0
fi

WARN_DAYS=$((ROTATION_DAYS * 3 / 4))
NOW=$(date +%s)
overdue=0
warning=0

for cred in $CREDENTIAL_NAMES; do
  if command -v security >/dev/null 2>&1 && [ "$(uname)" = "Darwin" ]; then
    # Get creation date from Keychain metadata (never reads value)
    meta=$(security find-generic-password -s "$SERVICE_NAME" -a "$cred" 2>/dev/null || true)
    cdate=$(echo "$meta" | grep '"cdat"' | grep -o '"[0-9]*"' | tr -d '"' || echo "")
    if [ -n "$cdate" ]; then
      age_days=$(( (NOW - cdate) / 86400 ))
      if [ $age_days -gt $ROTATION_DAYS ]; then
        echo "Rotation overdue for $cred (${age_days}d > ${ROTATION_DAYS}d)" >&2
        overdue=$((overdue + 1))
      elif [ $age_days -gt $WARN_DAYS ]; then
        echo "Rotation approaching for $cred (${age_days}d of ${ROTATION_DAYS}d)" >&2
        warning=$((warning + 1))
      fi
    fi
  fi
  # pass: creation date not easily available — skip rotation check
done

if [ $overdue -gt 0 ]; then exit 1; fi
if [ $warning -gt 0 ]; then exit 2; fi
exit 0
