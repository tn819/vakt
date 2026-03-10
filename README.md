# agentctl

> One config. Every AI tool. Zero credential exposure.

```
 your mcps & skills
  ┌────────────────┐
  │  ~/.agents/    │
  │  mcp-config    │──► Claude Code   ~/.claude.json
  │  secrets       │──► Cursor        ~/.cursor/mcp.json
  │  skills/       │──► Gemini CLI    ~/.gemini/settings.json
  │  config.json   │──► Codex         ~/.codex/config.toml
  └────────────────┘──► OpenCode      ~/.config/opencode/opencode.json
                   └──► Windsurf      ~/.codeium/windsurf/mcp_config.json
```

The agent CLI landscape is fragmented. Every tool invented its own config format, its own secrets story, its own place to drop skills. You copy-paste MCP server definitions across six files, scatter API keys in plaintext JSON, and start over every time a new tool ships.

**agentctl is the missing standard layer.** One directory (`~/.agents/`) is your single source of truth, aligned to open specs. Secrets live in your OS keychain and nowhere else. Skills and servers are instantly portable across every tool you use today and every tool that ships tomorrow.

---

## Three principles

### 🔐 Security — credentials belong in a keychain, not a JSON file

Most AI tools write your API keys directly into dotfiles like `~/.cursor/mcp.json`. Those files get swept into iCloud, Dropbox, dotfile repos, and screenshots. **agentctl treats this as unacceptable by design.**

`~/.agents/mcp-config.json` contains only named references — `secret:GITHUB_TOKEN` — never the values. Secrets are resolved from your OS keychain at sync time and exist in memory only. You can commit, share, or `cat` your entire `~/.agents/` directory with zero risk.

### 📐 Standardization — one schema, one source of truth

Every provider uses a different shape for the same data. Cursor wants `mcpServers`. OpenCode wants `mcp` with combined `command` arrays. Codex wants TOML. Gemini wants `mcpServers` but with different HTTP field names.

agentctl defines a single canonical schema for MCP servers and translates to each provider's format at sync time. You write config once. The translation layer handles the rest — today and when new providers ship.

### 🔗 Interoperability — switch tools without losing context

Skills, server definitions, and preferences are stored in `~/.agents/` against open formats, not inside any vendor's directory. `agentctl sync` populates every installed tool from the same source. `agentctl import-from-everywhere` reads any tool's existing config and consolidates it. Your setup is fully portable across CLIs, machines, and teammates.

---

## Get started in 60 seconds

```bash
git clone https://github.com/tn819/agentctl ~/.agentctl
export PATH="$PATH:$HOME/.agentctl/src"

agentctl init                    # scaffold ~/.agents/
agentctl import-from-everywhere  # pull in your existing provider configs
agentctl secrets set GITHUB_TOKEN ghp_...  # store in keychain, not in a file
agentctl sync                    # write to every installed CLI
```

On first run, `init` auto-detects your existing Claude, Cursor, Gemini, and other configs and imports them — so you're not starting from scratch.

---

## Why this exists

| Problem | How agentctl solves it |
|---|---|
| MCP config scattered across 6 tools | Single `~/.agents/mcp-config.json` synced everywhere |
| API keys in plaintext JSON files | Resolved from OS keychain at sync time, never persisted |
| Every tool uses a different config format | Canonical schema with per-provider translation layer |
| Skills only work in one tool | Symlinked into every provider's skills directory |
| Starting over when trying a new CLI | `agentctl sync` populates any new tool instantly |
| Config tied to a single machine | `~/.agents/` is safe to version-control and share — no secrets inside |
| Can't audit what credentials you've handed to AI tools | Every secret is a named reference — full visibility, zero exposure |

---

## 🔐 Security in depth

### Guarantees

- **Zero plaintext secrets on disk.** `~/.agents/mcp-config.json` never contains credential values — only named references (`secret:MY_KEY`). Resolved values exist in memory only, for the duration of a sync.
- **OS keychain by default.** macOS Keychain on macOS, `pass` (GPG-encrypted) on Linux. No custom encryption — the same store your browser and SSH agent trust.
- **Provider configs are not the source of truth.** What agentctl writes to `~/.cursor/mcp.json` etc. is the resolved output for that tool's process. It can be regenerated at any time. `~/.agents/` is the only thing you need to protect — and it contains no secrets.
- **No secrets in shell profiles.** `GITHUB_TOKEN=...` in `.bashrc` is a credential leak. agentctl's keychain backend bypasses shell profiles entirely.
- **Auditable by design.** `cat ~/.agents/mcp-config.json` and share it freely. Every credential is a named reference you can audit without exposing anything.

### Threat model

| Threat | agentctl's defence |
|--------|-------------------|
| Dotfiles repo accidentally public | `mcp-config.json` is safe to commit — no secrets inside |
| iCloud / Dropbox syncing `~/.cursor/` | Credentials come from keychain at sync time, not stored long-term in provider dirs |
| Screenshot or screen share leaks config | Nothing sensitive in any file agentctl owns |
| Compromised AI tool reads its own config | No credentials in `~/.agents/` — only opaque named references |
| Shoulder surfing during `agentctl list` | List output never prints secret values |

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

agentctl's canonical schema maps cleanly to all of these. Adding a new provider is a JSON entry in `providers.json` — no code changes. The translation layer is data-driven and fully inspectable.

Path variables in `mcp-config.json` are also standardized:

```json
{ "paths": { "code": "~/Projects", "vault": "~/Documents/vault" } }
```

```json
{ "command": "npx", "args": ["server-filesystem", "{{paths.code}}"] }
```

---

## 🔗 Interoperability in depth

### Any tool, instantly

```bash
# Just installed Windsurf for the first time
agentctl sync
# → ~/.codeium/windsurf/mcp_config.json written with all your servers
# → ~/.codeium/windsurf/skills/ symlinked to your skills
# Done. Full context, zero setup.
```

### Import from anywhere

```bash
agentctl import-from-everywhere
# Reads: ~/.cursor/mcp.json, ~/.gemini/settings.json, ~/.mcp.json,
#        ~/.codex/config.toml, ~/.config/opencode/opencode.json ...
# Merges into ~/.agents/mcp-config.json (skips duplicates)
# Links any skills it finds
```

### Share with a teammate

```bash
# On your machine
cat ~/.agents/mcp-config.json  # safe to share — no secrets
git push

# On their machine
git pull
agentctl secrets set GITHUB_TOKEN ghp_...  # they use their own keychain
agentctl sync
# → identical MCP setup, their own credentials
```

### Compare CLIs fairly

Every AI coding tool gets identical MCP server configuration and identical skills. When you evaluate Claude Code vs Cursor vs Gemini CLI, you're comparing the tools — not comparing whose config you spent more time on.

---

## Commands

```
agentctl init                        Scaffold ~/.agents/, import existing configs
agentctl import-from-everywhere      Pull MCP servers and skills from all detected providers
agentctl sync                        Write config to every installed provider
agentctl sync --dry-run              Preview what would be written

agentctl add-server NAME CMD [ARGS]  Register a stdio MCP server
agentctl add-server NAME --http URL  Register an HTTP MCP server
agentctl add-skill ./path/to/skill   Link a local skill directory
agentctl add-skill https://...       Clone and link a skill from git

agentctl list                        Show servers, skills, and secrets
agentctl list servers
agentctl list skills
agentctl list secrets

agentctl secrets set KEY VALUE       Store a secret in your OS keychain
agentctl secrets get KEY             Retrieve a secret
agentctl secrets delete KEY          Remove a secret
agentctl secrets list                List all stored secret keys (values never shown)

agentctl config list                 Show current config
agentctl config set paths.code ~/Projects
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
├── AGENTS.md            # shared agent preferences / persona
└── skills/
    ├── gh-cli/          # symlinked into every provider
    ├── sql-reviewer/
    └── ...
```

---

## Skills

Skills are `SKILL.md` files with YAML frontmatter — instructions that travel with the agent into any context. agentctl symlinks `~/.agents/skills/` into every provider's skills directory.

```markdown
---
name: sql-reviewer
description: Review SQL queries for performance and safety issues
---

When reviewing SQL, always check for...
```

```bash
agentctl add-skill https://github.com/vercel-labs/agent-skills react-best-practices
```

Browse: [skills.sh](https://skills.sh) · Spec: [agentskills.io](https://agentskills.io)

---

## Testing

```bash
bats --recursive tests/
```

Tests run in a fully sandboxed `HOME` — nothing touches your real config files or keychain.

---

## License

MIT
