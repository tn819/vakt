# Test GPG Key

This is a **throwaway** GPG key pair used exclusively to initialise a `pass` store
inside the Docker e2e test container.

- No passphrase
- Not used to sign or encrypt anything of value
- Committing it to the repository is intentional and safe (it protects no real secrets)
- Never import this key into a real keyring
- No expiry (Expire-Date: 0)

## Key identity

- UID: `vakt Test <vakt-test@example.invalid>`
- Fingerprint: `7730 903A 805C 0D49 3397 875F B873 50FF 1FF6 6545`

## How to regenerate

If the key needs to be replaced, generate a new one with:

```bash
export GNUPGHOME=$(mktemp -d)
gpg --batch --gen-key <<'EOF'
%no-protection
Key-Type: RSA
Key-Length: 4096
Subkey-Type: RSA
Subkey-Length: 4096
Name-Real: vakt Test
Name-Email: vakt-test@example.invalid
Expire-Date: 0
%commit
EOF
gpg --armor --export-secret-keys vakt-test@example.invalid > tests/fixtures/gpg/test-key.asc
rm -rf "$GNUPGHOME"
```

Then update the fingerprint in this README.
