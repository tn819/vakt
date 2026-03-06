#!/usr/bin/env bash
# Main CLI entry point for agentctl

set -euo pipefail

AGENTS_DIR="${AGENTS_DIR:-$HOME/.agents}"
AGENTS_SERVICE="${AGENTS_SERVICE:-agentctl}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "$SCRIPT_DIR/lib/secrets.sh"

version() {
  echo "agentctl 0.0.1"
}

usage() {
  cat << 'EOF'
agentctl - Provider-agnostic MCP and skills manager

USAGE:
  agentctl <command> [options]

COMMANDS:
  init                  Initialize ~/.agents/ directory
  sync                  Sync MCP servers and skills to all providers
  secrets               Manage secrets (keychain/pass/env)
  config                View or edit configuration
  add-server            Add a new MCP server
  add-skill             Add a new skill
  list                  List configured servers and skills
  upgrade               Upgrade to latest version

OPTIONS:
  --dry-run             Preview changes without applying
  --mcp-only            Sync MCP servers only
  --skills-only         Sync skills only
  -h, --help            Show this help message
  -v, --version         Show version

EXAMPLES:
  agentctl init
  agentctl sync
  agentctl secrets set GITHUB_TOKEN
  agentctl add-server my-server npx -y my-mcp
  agentctl config set paths.code ~/Projects

EOF
}

init() {
  local dry_run=false
  [[ "${1:-}" == "--dry-run" ]] && dry_run=true
  
  echo ""
  echo -e "\033[1mInitializing ~/.agents/\033[0m"
  echo ""
  
  if [[ -d "$AGENTS_DIR" ]]; then
    echo -e "  \033[33m⚠\033[0m $AGENTS_DIR already exists"
    if [[ "$dry_run" == "false" ]]; then
      read -p "  Overwrite? [y/N] " -n 1 -r
      echo
      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "  Aborted."
        return 1
      fi
    fi
  fi
  
  if [[ "$dry_run" == "true" ]]; then
    echo "  [dry-run] Would create: $AGENTS_DIR/"
    echo "  [dry-run] Would create: $AGENTS_DIR/mcp-config.json"
    echo "  [dry-run] Would create: $AGENTS_DIR/config.json"
    echo "  [dry-run] Would create: $AGENTS_DIR/AGENTS.md"
    echo "  [dry-run] Would create: $AGENTS_DIR/skills/"
    return 0
  fi
  
  mkdir -p "$AGENTS_DIR/skills"
  
  # Create default config
  cat > "$AGENTS_DIR/config.json" << 'CONFIG'
{
  "paths": {
    "code": "~/Code",
    "documents": "~/Documents",
    "vault": "~/Documents/vault"
  },
  "providers": ["opencode", "claude", "gemini", "codex"],
  "secretsBackend": "auto"
}
CONFIG
  
  # Create default MCP config
  cat > "$AGENTS_DIR/mcp-config.json" << 'MCP'
{
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "{{paths.code}}"]
  },
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "secret:GITHUB_PERSONAL_ACCESS_TOKEN"
    }
  }
}
MCP
  
  # Create default AGENTS.md
  cat > "$AGENTS_DIR/AGENTS.md" << 'AGENTS'
# Agent Standards

This file contains global preferences for AI agent interactions.

## Open Standards Preference

- Use `AGENTS.md` instead of provider-specific names
- Use `.agents/` directory instead of provider-specific directories
- Use `~/.agents/skills/` for skill installations

## Skills

Reference domain-specific expertise from `~/.agents/skills/`.

## MCP Servers

All MCP servers are configured in `~/.agents/mcp-config.json`.
AGENTS
  
  echo -e "  \033[32m✓\033[0m Created $AGENTS_DIR/"
  echo -e "  \033[32m✓\033[0m Created $AGENTS_DIR/mcp-config.json"
  echo -e "  \033[32m✓\033[0m Created $AGENTS_DIR/config.json"
  echo -e "  \033[32m✓\033[0m Created $AGENTS_DIR/AGENTS.md"
  echo -e "  \033[32m✓\033[0m Created $AGENTS_DIR/skills/"
  echo ""
  echo -e "Next steps:"
  echo -e "  1. Edit \033[36m~/.agents/config.json\033[0m to set your paths"
  echo -e "  2. Run \033[36magentctl secrets\033[0m to add your API keys"
  echo -e "  3. Run \033[36magentctl sync\033[0m to sync to all providers"
  echo ""
}

config() {
  local action="${1:-}"
  local key="${2:-}"
  local value="${3:-}"
  
  local config_file="$AGENTS_DIR/config.json"
  
  if [[ ! -f "$config_file" ]]; then
    echo "Config not found. Run 'agentctl init' first."
    return 1
  fi
  
  case "$action" in
    get)
      python3 -c "import json; print(json.load(open('$config_file')).get('$key', ''))"
      ;;
    set)
      if [[ -z "$key" || -z "$value" ]]; then
        echo "Usage: agentctl config set <key> <value>"
        return 1
      fi
      python3 << PYEOF
import json
with open('$config_file') as f:
    config = json.load(f)
keys = '$key'.split('.')
obj = config
for k in keys[:-1]:
    obj = obj.setdefault(k, {})
obj[keys[-1]] = '$value'
with open('$config_file', 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')
print(f"Set $key = $value")
PYEOF
      ;;
    list|"")
      cat "$config_file"
      ;;
    *)
      echo "Usage: agentctl config [get|set|list] [key] [value]"
      return 1
      ;;
  esac
}

add_server() {
  local name="$1"
  shift
  
  if [[ -z "$name" ]]; then
    echo "Usage: agentctl add-server <name> <command> [args...]"
    echo "       agentctl add-server <name> --http <url>"
    return 1
  fi
  
  local mcp_config="$AGENTS_DIR/mcp-config.json"
  if [[ ! -f "$mcp_config" ]]; then
    echo "Run 'agentctl init' first."
    return 1
  fi
  
  if [[ "${1:-}" == "--http" ]]; then
    local url="$2"
    python3 << PYEOF
import json
with open('$mcp_config') as f:
    config = json.load(f)
config['$name'] = {"transport": "http", "url": "$url"}
with open('$mcp_config', 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')
print(f"Added HTTP server: $name")
PYEOF
  else
    local cmd="$1"
    shift
    local args="$*"
    python3 << PYEOF
import json
with open('$mcp_config') as f:
    config = json.load(f)
config['$name'] = {"command": "$cmd", "args": '$args'.split() if '$args' else []}
with open('$mcp_config', 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')
print(f"Added server: $name")
PYEOF
  fi
  
  echo ""
  echo "Run 'agentctl sync' to apply changes."
}

add_skill() {
  local source="$1"
  local name="${2:-}"
  
  if [[ -z "$source" ]]; then
    echo "Usage: agentctl add-skill <path> [name]"
    echo "       agentctl add-skill ./my-skill"
    echo "       agentctl add-skill https://github.com/user/skill-repo skill-name"
    return 1
  fi
  
  local skills_dir="$AGENTS_DIR/skills"
  mkdir -p "$skills_dir"
  
  if [[ "$source" == http* ]]; then
    name="${name:-$(basename "$source" .git)}"
    if [[ -d "$skills_dir/$name" ]]; then
      echo "Skill '$name' already exists. Remove it first to reinstall."
      return 1
    fi
    git clone "$source" "$skills_dir/$name"
    echo -e "\033[32m✓\033[0m Cloned skill: $name"
  else
    source="$(cd "$source" && pwd)"
    name="${name:-$(basename "$source")}"
    if [[ -L "$skills_dir/$name" ]]; then
      echo "Skill '$name' already linked."
      return 0
    fi
    ln -s "$source" "$skills_dir/$name"
    echo -e "\033[32m✓\033[0m Linked skill: $name"
  fi
  
  echo ""
  echo "Run 'agentctl sync --skills-only' to apply to all providers."
}

list_cmd() {
  local what="${1:-all}"
  
  echo ""
  echo -e "\033[1m~/.agents/\033[0m"
  echo ""
  
  if [[ "$what" == "all" || "$what" == "servers" ]]; then
    echo -e "\033[1mMCP Servers:\033[0m"
    local mcp_config="$AGENTS_DIR/mcp-config.json"
    if [[ -f "$mcp_config" ]]; then
      python3 -c "
import json
with open('$mcp_config') as f:
    for name, cfg in json.load(f).items():
        transport = cfg.get('transport', 'stdio')
        if transport == 'http':
            print(f'  {name}: {cfg[\"url\"]}')
        else:
            cmd = cfg.get('command', '')
            print(f'  {name}: {cmd}')
"
    fi
    echo ""
  fi
  
  if [[ "$what" == "all" || "$what" == "skills" ]]; then
    echo -e "\033[1mSkills:\033[0m"
    local skills_dir="$AGENTS_DIR/skills"
    if [[ -d "$skills_dir" ]]; then
      for skill_path in "$skills_dir"/*/SKILL.md; do
        [[ -f "$skill_path" ]] || continue
        local skill_name=$(basename "$(dirname "$skill_path")")
        local desc=$(grep -A1 "^description:" "$skill_path" 2>/dev/null | tail -1 | sed 's/^[ ]*//' || echo "")
        echo -e "  \033[36m$skill_name\033[0m${desc:+: $desc}"
      done
    fi
    echo ""
  fi
  
  if [[ "$what" == "all" || "$what" == "secrets" ]]; then
    echo -e "\033[1mSecrets:\033[0m"
    local backend=$(get_backend)
    echo -e "  Backend: \033[36m$backend\033[0m"
    for key in $(secrets_list); do
      echo -e "  \033[32m✓\033[0m $key"
    done
    echo ""
  fi
}

sync() {
  local dry_run=false
  local mcp_only=false
  local skills_only=false
  
  for arg in "$@"; do
    case "$arg" in
      --dry-run)     dry_run=true ;;
      --mcp-only)    mcp_only=true ;;
      --skills-only) skills_only=true ;;
    esac
  done
  
  "$SCRIPT_DIR/commands/sync.sh" \
    ${dry_run:+--dry-run} \
    ${mcp_only:+--mcp-only} \
    ${skills_only:+--skills-only}
}

secrets_cmd() {
  local action="${1:-}"
  shift || true
  
  case "$action" in
    set)
      local key="$1"
      local value="$2"
      if [[ -z "$value" ]]; then
        echo -n "Enter value for $key: "
        read -rs value
        echo
      fi
      secrets_set "$key" "$value"
      echo "Stored: $key"
      ;;
    get)
      secrets_get "$1"
      ;;
    delete)
      secrets_delete "$1"
      echo "Deleted: $1"
      ;;
    list)
      secrets_list
      ;;
    "")
      secrets_interactive
      ;;
    *)
      echo "Usage: agentctl secrets [set|get|delete|list] [key] [value]"
      return 1
      ;;
  esac
}

upgrade() {
  local repo_url="https://github.com/yourorg/agentctl"
  echo "Upgrading agentctl..."
  if [[ -d "$SCRIPT_DIR/.git" ]]; then
    git -C "$SCRIPT_DIR" pull
    echo "Upgraded successfully."
  else
    echo "Manual upgrade required. Visit: $repo_url"
  fi
}

main() {
  if [[ $# -eq 0 ]]; then
    usage
    exit 0
  fi
  
  local command="$1"
  shift || true
  
  case "$command" in
    init)        init "$@" ;;
    sync)        sync "$@" ;;
    secrets)     secrets_cmd "$@" ;;
    config)      config "$@" ;;
    add-server)  add_server "$@" ;;
    add-skill)   add_skill "$@" ;;
    list)        list_cmd "$@" ;;
    upgrade)     upgrade "$@" ;;
    -v|--version) version ;;
    -h|--help)   usage ;;
    *)
      echo "Unknown command: $command"
      usage
      exit 1
      ;;
  esac
}

main "$@"
