---
layout: default
title: Getting Started
---

# Getting Started

Install vakt, initialize your config, and sync to all your AI tools in under 5 minutes.

## Installation

### macOS / Linux (Homebrew)

```bash
brew tap tn819/vakt https://github.com/tn819/vakt
brew install vakt
```

### Binary (any platform)

```bash
curl -fsSL https://github.com/tn819/vakt/releases/latest/download/vakt -o /usr/local/bin/vakt
chmod +x /usr/local/bin/vakt
```

### From source

```bash
git clone https://github.com/tn819/vakt
cd vakt && bun install
export PATH="$PATH:$(pwd)/src"
```

## Initialize

```bash
vakt init
```

This creates `~/.agents/` with the basic structure:

```
~/.agents/
├── mcp-config.json      # Your MCP servers
├── policy.json          # Runtime policy rules
├── config.json          # vakt settings
├── audit.db            # Audit log (SQLite)
└── skills/             # Your skills
```

## Import existing configs

Already using Claude, Cursor, or other tools? Import their configs:

```bash
vakt import-from-everywhere
```

This reads existing provider configs and merges them into vakt's unified format.

## Store secrets securely

Add your API keys to the system keychain (not in JSON files):

```bash
vakt secrets set GITHUB_TOKEN ghp_xxxxx
vakt secrets set ANTHROPIC_API_KEY sk-ant-xxxxx
vakt secrets set OPENAI_API_KEY sk-xxxxx
```

## Add an MCP server

```bash
# From the official registry
vakt add-server github io.github.modelcontextprotocol/server-github

# Or manually
vakt add-server fs npx -y @modelcontextprotocol/server-filesystem ~/Code ~/Documents
```

## Sync to all providers

```bash
vakt sync
```

vakt writes your complete MCP configuration to every installed AI tool:
- Claude Code (`~/.claude.json`)
- Cursor (`~/.cursor/mcp.json`)
- Gemini CLI (`~/.gemini/settings.json`)
- Codex (`~/.codex/config.toml`)
- OpenCode (`~/.config/opencode/opencode.json`)
- Windsurf (`~/.codeium/windsurf/mcp_config.json`)

## Set a policy

Edit `~/.agents/policy.json`:

```json
{
  "version": "1",
  "default": "allow",
  "tools": {
    "allow": ["Read", "Edit", "Bash"],
    "deny": ["WebSearch", "Delete"]
  }
}
```

Then enable the proxy:

```bash
vakt sync --with-proxy
```

Now all MCP calls route through vakt's policy engine.

## Next steps

- [Configure policy](/docs/policy)
- [Set up audit logging](/docs/audit)
- [Use cloud sandboxes](/docs/sandbox)
- [Configure model router](/docs/router)
