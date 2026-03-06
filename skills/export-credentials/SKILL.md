---
name: export-credentials
version: 0.0.1
description: |
  Securely export credentials from local credential stores without exposing them to the AI.

  Use this skill when the user needs to:
  - Add credentials to GitHub Secrets or other repository secrets
  - Deploy credentials to cloud development environments
  - Manage credentials across multiple repositories or services
  - Create secure configuration files without logging secrets

  The skill reads credentials from the user's local credential store (macOS Keychain,
  Linux pass, Windows Credential Manager, or environment), auto-detects what's available,
  and generates scripts to deploy them securely. Secrets never enter the AI context —
  this is a zero-trust approach where credentials are read and used only locally.
---

# Export Credentials Securely

Manage credentials across repositories and environments without exposing them to the AI.
This skill reads from your local credential store, auto-discovers available credentials, and
generates scripts to deploy them safely.

## How it Works

1. **Read credentials locally** — Queries your credential store (Keychain, pass, Windows CM, etc.)
2. **Never expose secrets to AI** — Only credential names appear in the AI response; values stay local
3. **Generate deployment scripts** — Creates shell scripts that use credentials without exposing them
4. **Execute with approval** — Runs scripts locally on your machine; you review before execution
5. **Report results** — Confirms success/failure (✓ added X secrets) without showing values

## What You Can Do

**Add credentials to GitHub Secrets:**
```
Add my credentials to owner/repo
```

**Create a secure local .env file:**
```
Generate a .env file with my API keys (don't commit this!)
```

**Deploy credentials to a service:**
```
Set up secrets for my repository
```

## How to Use

When you ask the AI to manage credentials, tell it:

1. **What credentials** (or "all credentials" to auto-detect)
2. **Where they're stored** (or rely on defaults: Keychain on macOS, `pass` on Linux, etc.)
3. **What to do with them** (add to GitHub, create .env, deploy, etc.)

### Examples

```
"Add all my credentials from Keychain to github.com/owner/repo"
```

```
"Create a .env file with these API keys: OPENAI_API_KEY, ANTHROPIC_API_KEY"
```

```
"Deploy my credentials to owner/repo"
```

## Behind the Scenes

- Detects available credentials (queries local credential store)
- Generates Bash scripts for execution
- Shows you the script before execution for review
- Executes the script with your approval
- Reports results securely (no credential values logged or exposed)

## Security Guarantees

✓ Credentials read only by local scripts
✓ No credential values exposed to AI or logs
✓ Scripts are human-reviewable before execution
✓ Supports multiple credential stores (Keychain, pass, Windows CM, environment)
✓ Only success/failure reported back

## Supported Credential Stores

The skill auto-detects and uses:
- **macOS**: Keychain (`security` command)
- **Linux**: `pass` (password manager) or environment variables
- **Windows**: Credential Manager (`cmdkey` command)
- **Any OS**: Environment variables as fallback

## Supported Deployment Targets

- GitHub Secrets
- Local `.env` files (with security warnings)
- Future: AWS Secrets Manager, Azure Key Vault, etc.

## Pipeline Integration

Works standalone or as part of the credential skills pipeline:

1. **credential-best-practices** — Set up your credential store and profile
2. **audit-credentials** — Validate compliance, get a score
3. **export-credentials** (this skill) — Deploy only credentials that passed audit

If `~/.agents/audit-report.json` exists, credentials listed as `failed` are
automatically skipped. Use `SKIP_AUDIT=true` to bypass.

## Requirements

- **Shell**: Bash
- **Platforms**: macOS, Linux, WSL
- **Tools**: Requires `gh` CLI for GitHub operations (optional for other operations)

## Works With

This skill is AI-agnostic and works with any assistant on Unix/Linux/macOS:
- Claude (Claude.ai, Claude Code)
- OpenCode
- Gemini
- Any AI with Bash execution capability
