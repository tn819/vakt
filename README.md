# vakt

> Secure MCP runtime for AI coding tools — policy enforcement, audit logging, registry verification, and multi-provider sync.

[![releases](https://img.shields.io/github/v/release/tn819/vakt?label=latest&color=0a0a0a)](https://github.com/tn819/vakt/releases)
[![license](https://img.shields.io/badge/license-MIT-0a0a0a)](LICENSE)

```
 configure once
  ┌─────────────────┐
  │   ~/.agents/    │
  │   mcp-config    │──► Claude Code   ~/.claude.json
  │   policy.json   │──► Cursor        ~/.cursor/mcp.json
  │   secrets       │──► Gemini CLI    ~/.gemini/settings.json
  │   skills/       │──► Codex         ~/.codex/config.toml
  └─────────────────┘──► OpenCode      ~/.config/opencode/opencode.json
                    └──► Windsurf      ~/.codeium/windsurf/mcp_config.json
```

Building a good MCP server takes real work — authentication, tool design, testing. The AI tool ecosystem repays that effort by scattering it: different config formats, different secrets stories, different skill directories. Your carefully crafted GitHub MCP lives in Cursor but not Gemini. Your SQL reviewer skill works in Claude Code but not Windsurf.

**vakt ends that.** One source of truth in `~/.agents/`, synced everywhere — with keychain-backed secrets, per-server tool policy, a full audit trail, and direct integration with the official MCP registry.

---

## Get started

```bash
# Install (download a single binary from GitHub releases)
curl -fsSL https://github.com/tn819/vakt/releases/latest/download/vakt -o /usr/local/bin/vakt
chmod +x /usr/local/bin/vakt

# Or run from source
git clone https://github.com/tn819/vakt
cd vakt && bun install
export PATH="$PATH:$(pwd)/src"

vakt init                             # scaffold ~/.agents/
vakt import-from-everywhere           # pull in your existing provider configs
vakt secrets set GITHUB_TOKEN ghp_... # store in keychain, not in a file
vakt sync                             # write to every installed CLI
```

---

## Three principles

### 🔐 Security — credentials belong in a keychain, not a JSON file

Most AI tools write your API keys directly into dotfiles like `~/.cursor/mcp.json`. Those files get swept into iCloud, Dropbox, dotfile repos, and screenshots. **vakt treats this as unacceptable by design.**

`~/.agents/mcp-config.json` contains only named references — `secret:GITHUB_TOKEN` — never the values. Secrets are resolved from your OS keychain at sync time and exist in memory only. You can commit, share, or `cat` your entire `~/.agents/` directory with zero risk.

### 📐 Standardization — one schema, one source of truth

Every provider uses a different shape for the same data. Cursor wants `mcpServers`. OpenCode wants `mcp` with combined `command` arrays. Codex wants TOML. Gemini wants `mcpServers` but with different HTTP field names.

vakt defines a single canonical schema and translates to each provider's format at sync time. Adding a new provider is a JSON entry in `providers.json` — no code changes. The translation layer is data-driven and fully inspectable.

### 🔗 Interoperability — the work you put in travels with you

Skills, server definitions, and preferences live in `~/.agents/` in open formats — not locked inside any vendor's directory. `vakt sync` populates every installed tool instantly. `vakt import-from-everywhere` consolidates anything you've already built. Your setup is fully portable across CLIs, machines, and teammates.

---

## Why this exists

| Problem | How vakt solves it |
|---|---|
| Built a great MCP server — only works in one tool | `vakt sync` instantly deploys it to every installed CLI |
| Spent hours perfecting a skill — not portable | Symlinked from `~/.agents/skills/` into every provider |
| New AI tool ships — start over from scratch | One sync command, full context, zero setup |
| MCP config scattered and duplicated across 6 tools | Single `~/.agents/mcp-config.json` as source of truth |
| API keys in plaintext JSON files | Resolved from OS keychain at sync time, never persisted |
| Every tool uses a different config format | Canonical schema with per-provider translation layer |
| Config tied to a single machine | `~/.agents/` is safe to version-control and share — no secrets inside |
| Can't audit what credentials you've handed to AI tools | Every secret is a named reference — full visibility, zero exposure |
| No control over which tools MCP servers can invoke | Per-server tool policy with glob matching and fail-closed defaults |

---

## 🔐 Security in depth

### Guarantees

- **Zero plaintext secrets on disk.** `~/.agents/mcp-config.json` never contains credential values — only named references (`secret:MY_KEY`). Resolved values exist in memory only, for the duration of a sync.
- **OS keychain by default.** macOS Keychain on macOS, `pass` (GPG-encrypted) on Linux. No custom encryption — the same store your browser and SSH agent trust.
- **Provider configs are not the source of truth.** What vakt writes to `~/.cursor/mcp.json` etc. is the resolved output for that tool's process. It can be regenerated at any time. `~/.agents/` is the only thing you need to protect — and it contains no secrets.
- **No secrets in shell profiles.** `GITHUB_TOKEN=...` in `.bashrc` is a credential leak. vakt's keychain backend bypasses shell profiles entirely.
- **Auditable by design.** `cat ~/.agents/mcp-config.json` and share it freely. Every credential is a named reference you can audit without exposing anything.

### Threat model

| Threat | vakt's defence |
|--------|----------------|
| Dotfiles repo accidentally public | `mcp-config.json` is safe to commit — no secrets inside |
| iCloud / Dropbox syncing `~/.cursor/` | Credentials come from keychain at sync time, not stored long-term in provider dirs |
| Screenshot or screen share leaks config | Nothing sensitive in any file vakt owns |
| Compromised AI tool reads its own config | No credentials in `~/.agents/` — only opaque named references |
| Shoulder surfing during `vakt list` | List output never prints secret values |

### How secret references work

```json
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "secret:GITHUB_TOKEN"
    }
  },
  "my-api": {
    "transport": "http",
    "url": "https://api.example.com/mcp",
    "headers": {
      "Authorization": "Bearer secret:MY_API_KEY"
    }
  }
}
```

At sync time, `secret:GITHUB_TOKEN` is resolved from your keychain and written into the provider config. **The reference string is what lives on disk, gets committed, and gets shared — never the value.**

**Backends:** macOS Keychain · `pass` / GPG (Linux) · base64 env file (CI / fallback)

### Runtime log security with crust

vakt secures the **configuration layer** — secrets never reach a config file. But MCP servers can still leak sensitive data at runtime: a tool response that echoes back an API key, a log line that includes a token, an agent that exfiltrates data through a seemingly innocuous output.

[**crust**](https://github.com/BakeLens/crust) covers the **runtime layer**. It wraps any MCP server as a stdio proxy, intercepting JSON-RPC traffic in both directions and scanning it against 34 built-in DLP patterns before it reaches the agent or gets written to logs.

| Layer | Tool | What it protects |
|-------|------|-----------------|
| Configuration | **vakt** | Secrets never written to config files or `~/.agents/` |
| Runtime / logs | **[crust](https://github.com/BakeLens/crust)** | Secrets and sensitive data scrubbed from MCP traffic and logs |

---

## 📐 Standardization in depth

The AI tool ecosystem has no agreed config standard. Each provider invented its own:

| Provider | Format | Server key | HTTP field | stdio shape |
|---|---|---|---|---|
| Cursor | JSON | `mcpServers` | `url` | `command` + `args` |
| OpenCode | JSON | `mcp` | `url` | combined `command` array |
| Gemini | JSON | `mcpServers` | `httpUrl` | `command` + `args` |
| Codex | TOML | `mcp_servers` | `url` | `command` + `args` |
| Windsurf | JSON | `mcpServers` | `serverUrl` | `command` + `args` |

vakt's canonical schema maps cleanly to all of these. Adding a new provider is a JSON entry in `providers.json` — no code changes.

Path variables in `mcp-config.json` are also standardized:

```json
{ "paths": { "code": "~/Projects", "vault": "~/Documents/vault" } }
```

```json
{ "command": "npx", "args": ["server-filesystem", "{{paths.code}}"] }
```

---

## 🔒 Policy engine

vakt enforces per-server tool policy at sync time and (via the daemon proxy) at runtime. Policy lives in `~/.agents/policy.json`:

```json
{
  "version": "1",
  "default": "deny",
  "registryPolicy": "warn-unverified",
  "servers": {
    "github": {
      "tools": {
        "allow": ["list_repos", "get_file", "create_issue"],
        "deny":  ["delete_repo"]
      }
    },
    "*": {
      "tools": { "deny": ["*exec*", "*shell*", "*eval*"] }
    }
  }
}
```

Rules use glob matching (`*` as wildcard). Priority: specific deny > wildcard deny > specific allow > wildcard allow > default. Fail-closed by default.

`registryPolicy` options:
- `allow-unverified` — sync any server (default)
- `warn-unverified` — warn on servers not in the MCP registry
- `registry-only` — block sync if any server is unverified

---

## 📦 MCP Registry

vakt integrates with the [official MCP registry](https://registry.modelcontextprotocol.io). Search and install servers by registry ID — secrets are pre-wired automatically:

```bash
vakt search github
#   io.github.modelcontextprotocol/server-github   The official GitHub MCP server
#   ...

vakt add-server gh io.github.modelcontextprotocol/server-github
# ✓ Added gh from registry
# Secrets needed:
#   vakt secrets set GITHUB_PERSONAL_ACCESS_TOKEN <value>
```

Registry-resolved servers store their `registry` and `version` fields in `mcp-config.json`, enabling policy enforcement and future upgrade detection.

---

## 🔗 Interoperability in depth

### Any tool, instantly

```bash
# Just installed Windsurf for the first time
vakt sync
# → ~/.codeium/windsurf/mcp_config.json written with all your servers
# → ~/.codeium/windsurf/skills/ symlinked to your skills
# Done. Full context, zero setup.
```

### Import from anywhere

```bash
vakt import-from-everywhere
# Reads: ~/.cursor/mcp.json, ~/.gemini/settings.json, ~/.mcp.json,
#        ~/.codex/config.toml, ~/.config/opencode/opencode.json ...
# Merges into ~/.agents/mcp-config.json (skips duplicates)
```

### Share with a teammate

```bash
# On your machine
cat ~/.agents/mcp-config.json  # safe to share — no secrets
git push

# On their machine
git pull
vakt secrets set GITHUB_TOKEN ghp_...  # they use their own keychain
vakt sync
# → identical MCP setup, their own credentials
```

---

## Commands

```
vakt init                        Scaffold ~/.agents/, import existing configs
vakt import-from-everywhere      Pull MCP servers and skills from all detected providers
vakt sync                        Write config to every installed provider
vakt sync --dry-run              Preview what would be written

vakt search <query>              Search the MCP registry
vakt add-server NAME REGISTRY-ID Add a server from the MCP registry
vakt add-server NAME CMD [ARGS]  Register a stdio MCP server directly
vakt add-server NAME --http URL  Register an HTTP MCP server
vakt add-skill ./path/to/skill   Link a local skill directory
vakt add-skill https://...       Clone and link a skill from git

vakt list                        Show servers, skills, and secrets
vakt list servers
vakt list skills
vakt list secrets

vakt secrets set KEY VALUE       Store a secret in your OS keychain
vakt secrets get KEY             Retrieve a secret
vakt secrets delete KEY          Remove a secret
vakt secrets list                List all stored secret keys (values never shown)

vakt config list                 Show current config
vakt config set paths.code ~/Projects
```

---

## Supported providers

| Provider | Config written | Skills |
|---|---|---|
| **Claude Code** | `~/.claude.json` | `~/.claude/skills/` |
| **Cursor** | `~/.cursor/mcp.json` | `~/.cursor/skills/` |
| **Gemini CLI** | `~/.gemini/settings.json` | native (`~/.agents/skills/`) |
| **Codex** | `~/.codex/config.toml` | `~/.codex/skills/` |
| **OpenCode** | `~/.config/opencode/opencode.json` | `~/.config/opencode/skills/` |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` | `~/.codeium/windsurf/skills/` |

New provider? Add an entry to `providers.json`. No code changes required.

---

## Directory structure

```
~/.agents/
├── config.json          # paths, provider list, secrets backend
├── mcp-config.json      # MCP server definitions (safe to commit — no secrets)
├── policy.json          # tool allow/deny rules per server (optional)
├── AGENTS.md            # shared agent preferences / persona
└── skills/
    ├── gh-cli/          # symlinked into every provider
    ├── sql-reviewer/
    └── ...
```

---

## Skills

Skills are `SKILL.md` files with YAML frontmatter — instructions that travel with the agent into any context. vakt symlinks `~/.agents/skills/` into every provider's skills directory.

```markdown
---
name: sql-reviewer
description: Review SQL queries for performance and safety issues
---

When reviewing SQL, always check for...
```

```bash
vakt add-skill https://github.com/vercel-labs/agent-skills react-best-practices
```

Browse: [skills.sh](https://skills.sh) · Spec: [agentskills.io](https://agentskills.io)

---

## Testing

```bash
bun test tests/unit/        # fast unit tests (~30ms)
bats --recursive tests/     # full e2e suite (~2min)
```

Tests run in a fully sandboxed `HOME` — nothing touches your real config files or keychain.

---

## License

MIT
