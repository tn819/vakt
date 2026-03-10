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
  import-from-everywhere Import MCP servers and skills from all detected providers
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
  
  if [[ -f "$AGENTS_DIR/config.json" ]]; then
    echo -e "  \033[33m⚠\033[0m $AGENTS_DIR already exists"
    if [[ "$dry_run" == "false" ]]; then
      read -p "  Reinitialize? [y/N] " -n 1 -r
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
  "providers": ["opencode", "claude", "gemini", "codex", "cursor"],
  "secretsBackend": "auto"
}
CONFIG
  
  # Create default MCP config
  cat > "$AGENTS_DIR/mcp-config.json" << 'MCP'
{
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

  local _resolver="$SCRIPT_DIR/lib/config_resolver.py"
  if python3 "$_resolver" \
      --agents-dir "$AGENTS_DIR" \
      --mcp-config "$AGENTS_DIR/mcp-config.json" \
      --user-config "$AGENTS_DIR/config.json" \
      --action validate 2>/dev/null; then
    true
  else
    echo -e "  \033[33m⚠\033[0m Some secret references are not yet set (this is expected)"
  fi
  echo ""
  # Auto-import from all detected providers
  import_from_everywhere

  echo -e "Next steps:"
  echo -e "  1. Edit \033[36m~/.agents/config.json\033[0m to set your paths"
  echo -e "  2. Run \033[36magentctl secrets\033[0m to add your API keys"
  echo -e "  3. Run \033[36magentctl sync\033[0m to sync to all providers"
  echo ""
}

import_from_everywhere() {
  local mcp_config="$AGENTS_DIR/mcp-config.json"
  local skills_dir="$AGENTS_DIR/skills"
  local providers_json="$SCRIPT_DIR/providers.json"

  echo -e "\n\033[1m── Importing from all providers ────────────────────────────\033[0m"

  python3 << PYEOF
import json, os, platform, re, tempfile

mcp_config_path = "$mcp_config"
providers_json_path = "$providers_json"
skills_dir = "$skills_dir"
home = os.path.expanduser("~")

BOLD  = "\033[1m"
GREEN = "\033[32m"
DIM   = "\033[2m"
RESET = "\033[0m"

def plat_path(spec):
    sys_map = {"Darwin": "darwin", "Linux": "linux", "Windows": "win32"}
    plat = sys_map.get(platform.system(), "linux")
    raw = spec if isinstance(spec, str) else spec.get(plat, spec.get("linux", ""))
    return os.path.expanduser(raw.replace("\$HOME", "~"))

def read_toml_mcp(path):
    """Minimal TOML reader for [mcp_servers.*] sections."""
    servers = {}
    current = None
    with open(path) as f:
        for line in f:
            line = line.rstrip()
            m = re.match(r'^\[mcp_servers\.(.+)\]$', line)
            if m:
                current = m.group(1)
                servers[current] = {}
                continue
            if current and "=" in line:
                k, _, v = line.partition("=")
                k = k.strip(); v = v.strip()
                if v.startswith('"') and v.endswith('"'):
                    v = v[1:-1]
                elif v.startswith("[") and v.endswith("]"):
                    v = [x.strip().strip('"') for x in v[1:-1].split(",") if x.strip()]
                servers[current][k] = v
    return servers

def normalize_entry(cfg, fmt):
    """Normalize provider-specific config to agentctl's mcp-config.json schema."""
    entry = {}
    transport = cfg.get("transport") or cfg.get("type", "stdio")
    if transport in ("http", "remote"):
        entry["transport"] = "http"
        entry["url"] = cfg.get("url") or cfg.get("serverUrl") or cfg.get("httpUrl", "")
        if cfg.get("headers"):
            entry["headers"] = cfg["headers"]
    else:
        cmd = cfg.get("command", "")
        args = cfg.get("args") or cfg.get("environment", [])
        # opencode stores command+args combined in "command" list
        if isinstance(cmd, list):
            cmd, *args = cmd
        entry["command"] = cmd
        entry["args"] = args if isinstance(args, list) else []
        if cfg.get("env") or cfg.get("environment"):
            env = cfg.get("env") or cfg.get("environment", {})
            if isinstance(env, dict):
                entry["env"] = env
        if cfg.get("cwd"):
            entry["cwd"] = cfg["cwd"]
    return entry

with open(providers_json_path) as f:
    providers = {k: v for k, v in json.load(f).items()
                 if not k.startswith("\$") and not k.startswith("_")}

with open(mcp_config_path) as f:
    config = json.load(f)

total_servers = 0
total_skills = 0

for pid, p in providers.items():
    fmt = p.get("configFormat", "json")
    skills_spec = p.get("skills", {})
    skills_path = plat_path(skills_spec.get("path", "")) if skills_spec.get("path") else ""
    skills_method = skills_spec.get("method", "symlink")

    # ── MCP servers ──────────────────────────────────────────
    servers_found = {}

    if fmt == "cli":
        # Claude: read both ~/.claude.json and ~/.claude/claude.json
        for src in [os.path.join(home, ".claude.json"),
                    os.path.join(home, ".claude", "claude.json")]:
            if not os.path.exists(src):
                continue
            with open(src) as f:
                data = json.load(f)
            servers_found.update(data.get("mcpServers", {}))
    elif fmt == "toml":
        cfg_path = plat_path(p.get("configPath", ""))
        if os.path.exists(cfg_path):
            try:
                servers_found = read_toml_mcp(cfg_path)
            except Exception as e:
                print(f"  warning: could not parse {cfg_path}: {e}", file=open('/dev/stderr', 'w'))
    elif fmt == "json":
        cfg_path = plat_path(p.get("configPath", ""))
        if os.path.exists(cfg_path):
            try:
                with open(cfg_path) as f:
                    data = json.load(f)
                key = p.get("configStructure", {}).get("serversPropertyName", "mcpServers")
                servers_found = data.get(key, {})
            except Exception as e:
                print(f"  warning: could not parse {cfg_path}: {e}", file=open('/dev/stderr', 'w'))

    imported_from = []
    for name, cfg in servers_found.items():
        if name in config:
            continue
        entry = normalize_entry(cfg, fmt)
        config[name] = entry
        imported_from.append(name)
        total_servers += 1

    if imported_from:
        print(f"\n  {BOLD}{p['displayName']}{RESET}")
        for name in imported_from:
            print(f"  {GREEN}✓{RESET}  server: {name}")

    # ── Skills ───────────────────────────────────────────────
    if skills_method == "native" or not skills_path:
        continue
    if not os.path.isdir(skills_path):
        continue
    # Skip if skills_path IS skills_dir (would create circular links)
    if os.path.realpath(skills_path) == os.path.realpath(skills_dir):
        continue

    provider_header_printed = bool(imported_from)
    for entry in sorted(os.listdir(skills_path)):
        src = os.path.join(skills_path, entry)
        if not os.path.isdir(src):
            continue
        dest = os.path.join(skills_dir, entry)
        if os.path.islink(dest) or os.path.isdir(dest):
            continue
        if not provider_header_printed:
            print(f"\n  {BOLD}{p['displayName']}{RESET}")
            provider_header_printed = True
        os.symlink(src, dest)
        print(f"  {GREEN}✓{RESET}  skill:  {entry}")
        total_skills += 1

tmp = mcp_config_path + ".tmp"
with open(tmp, "w") as f:
    json.dump(config, f, indent=2)
    f.write("\n")
os.replace(tmp, mcp_config_path)

print()
if total_servers == 0 and total_skills == 0:
    print(f"  {DIM}nothing new to import{RESET}")
else:
    parts = []
    if total_servers: parts.append(f"{total_servers} server(s)")
    if total_skills:  parts.append(f"{total_skills} skill(s)")
    print(f"  {GREEN}✓{RESET}  imported {', '.join(parts)}")
PYEOF
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
      python3 << PYEOF
import json
with open('$config_file') as f:
    obj = json.load(f)
for k in '$key'.split('.'):
    if not isinstance(obj, dict):
        obj = None
        break
    obj = obj.get(k)
if obj is not None:
    print(obj)
PYEOF
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
  local name="${1:-}"
  shift || true
  
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
    local cmd="${1:-}"
    if [[ -z "$cmd" ]]; then
      echo "Usage: agentctl add-server <name> <command> [args...]"
      return 1
    fi
    shift || true
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
  local source="${1:-}"
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
  echo "Run 'agentctl sync' to apply to all providers."
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
        local desc=$(grep "^description:" "$skill_path" 2>/dev/null | sed 's/^description:[[:space:]]*//' | head -1)
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
      local value="${2:-}"
      if [[ -z "$value" ]]; then
        echo -n "Enter value for $key: "
        IFS= read -r value
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
    init)              init "$@" ;;
    sync)              sync "$@" ;;
    secrets)           secrets_cmd "$@" ;;
    config)            config "$@" ;;
    add-server)        add_server "$@" ;;
    add-skill)         add_skill "$@" ;;
    list)              list_cmd "$@" ;;
    upgrade)           upgrade "$@" ;;
    import-from-everywhere) import_from_everywhere "$@" ;;
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
