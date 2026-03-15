#!/usr/bin/env bash
set -euo pipefail

FIXTURE_KEY="/app/tests/fixtures/gpg/test-key.asc"

echo "==> Importing test GPG key..."
export GNUPGHOME="/tmp/vakt-test-gnupghome"
mkdir -p "$GNUPGHOME"
chmod 700 "$GNUPGHOME"
gpg --batch --import "$FIXTURE_KEY"
# Set ultimate trust so gpg encrypts to the key without confirmation prompts
GPG_FINGERPRINT=$(gpg --with-colons --fingerprint 2>/dev/null \
  | awk -F: '/^fpr/{print $10; exit}')
echo "${GPG_FINGERPRINT}:6:" | gpg --import-ownertrust
GPG_KEY_ID=$(gpg --list-secret-keys --with-colons 2>/dev/null \
  | awk -F: '/^sec/{print $5; exit}')
echo "    Key ID: $GPG_KEY_ID"

echo "==> Waiting for Jaeger..."
until curl -sf "${JAEGER_URL:-http://jaeger:16686}/api/services" > /dev/null 2>&1; do
  sleep 1
done
echo "    Jaeger ready."

echo "==> Running Docker e2e harness..."
exec bats --tap /app/tests/docker/harness.bats
