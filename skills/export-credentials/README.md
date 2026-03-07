# Export Credentials Skill

Securely manage credentials across repositories and environments without exposing them to the AI.

**Version:** 0.0.1
**Status:** Production Ready

## Skill Ecosystem

This repository contains three complementary skills that form a secure credential management pipeline:

```
credential-best-practices  →  audit-credentials  →  export-credentials
         ↓                           ↓                       ↓
~/.agents/credential-        ~/.agents/audit-          GitHub Secrets
  profile.json                 report.json              / .env files
```

| Skill | Purpose |
|-------|---------|
| **credential-best-practices** | Interactive wizard to set up secure local credential stores |
| **audit-credentials** | Validates your setup, checks rotation, history, permissions |
| **export-credentials** (this skill) | Deploys credentials to GitHub Secrets without exposing to AI |

Each skill works standalone. Use them in sequence for the strongest guarantees.

### Running the Security Test

Verify credentials never leak through any code path:

```bash
./scripts/test-credential-security.sh           # All three phases
./scripts/test-credential-security.sh --static  # Fast: static code analysis only
./scripts/test-credential-security.sh --canary  # Runtime: canary credential scan
./scripts/test-credential-security.sh --nefarious  # Adversarial prompt resistance test
```

## Quick Start

### Basic Usage

```
"Add my credentials to owner/repo"
```

The skill will:
1. Auto-detect your credential store (Keychain on macOS, `pass` on Linux, environment variables)
2. Find all available credentials
3. Generate a Bash script to add them to GitHub Secrets
4. Show you the script for review
5. Execute with your approval

### Common Tasks

**Add credentials to GitHub:**
```
Add all my credentials from Keychain to github.com/owner/my-project
```

**Create a local .env file:**
```
Generate a .env file with my API keys (don't commit this!)
```

**Deploy to a specific repository:**
```
Set up secrets for owner/repo
```

## How It Works

1. **Read locally** — Credentials are read from your machine's credential store
2. **Never expose** — Secret values never appear in the AI response
3. **Generate scripts** — Bash scripts are created to handle deployment
4. **Review & execute** — You see the script before it runs
5. **Report results** — Only success/failure is reported back

## Requirements

- **Shell:** Bash
- **Platforms:** macOS, Linux, WSL
- **For GitHub operations:** `gh` CLI (GitHub CLI)

## Installation

The skill is centrally managed and synced automatically:

```bash
# Sync to all AI tools
~/.agents/sync.sh --skills-only
```

## Troubleshooting

### "gh CLI not found"

**macOS:**
```bash
brew install gh
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install gh
```

**Linux (Fedora/RHEL):**
```bash
sudo dnf install gh
```

Then authenticate:
```bash
gh auth login
```

### "Keychain access denied" (macOS)

The skill needs permission to access your keychain:

```bash
# Grant access for the 'security' command
security unlock-keychain
```

Or check System Preferences → Security & Privacy → Keychain.

### "pass not installed" (Linux)

```bash
# Ubuntu/Debian
sudo apt install pass

# Fedora/RHEL
sudo dnf install pass

# Arch
sudo pacman -S pass

# macOS
brew install pass
```

Then initialize:
```bash
pass init your-gpg-key-id
```

### Credentials not detected

**Check what store is being used:**

```bash
# List credentials in Keychain (macOS)
security find-generic-password -s credentials

# List credentials in pass (Linux)
pass ls

# Check environment variables
env | grep -i "api\|key\|token"
```

**Add credentials manually:**

```bash
# macOS Keychain
security add-generic-password -s credentials -a MY_API_KEY -w "secret_value"

# Linux pass
echo "secret_value" | pass insert MY_API_KEY

# Environment
export MY_API_KEY="secret_value"
```

### Script failed to execute

Check that:
1. You have write access to the target repository
2. `gh` is authenticated: `gh auth status`
3. The repository exists: `gh repo view owner/repo`

### Still stuck?

- Check the generated script for details: look for the most recent `.github-secrets-result.json`
- Verify credentials exist: `security find-generic-password -s credentials` (macOS)
- Try with `--store` parameter: `STORE=env ./detect-credentials.sh`

## Security

✓ Credentials are read only by local Bash scripts
✓ No credential values are exposed to the AI or logged
✓ Scripts are human-reviewable before execution
✓ Supports multiple secure credential stores
✓ Only success/failure is reported back

## Supported Credential Stores

- **macOS:** Keychain (`security` command)
- **Linux:** `pass` password manager or environment variables
- **Any OS:** Environment variables (fallback)

## Future Enhancements

- AWS Secrets Manager deployment
- Azure Key Vault support
- Environment-specific credential profiles
- Credential rotation workflows

## Support

For issues or questions:
1. Check this README's Troubleshooting section
2. Review the SKILL.md for detailed documentation
3. Check skill logs: `cat ~/.claude/debug/*.log`
