#!/usr/bin/env bash
# Sync MCP servers and skills to all AI providers

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/secrets.sh"

AGENTS_DIR="${AGENTS_DIR:-$HOME/.agents}"
MCP_CONFIG="$AGENTS_DIR/mcp-config.json"
SKILLS_DIR="$AGENTS_DIR/skills"
USER_CONFIG="$AGENTS_DIR/config.json"

DRY_RUN=false
MCP_ONLY=false
SKILLS_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --dry-run)     DRY_RUN=true ;;
    --mcp-only)    MCP_ONLY=true ;;
    --skills-only) SKILLS_ONLY=true ;;
  esac
done

BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
RED='\033[0;31m'; CYAN='\033[0;36m'; DIM='\033[2m'; RESET='\033[0m'
ok()   { echo -e "  ${GREEN}✓${RESET}  $*"; }
warn() { echo -e "  ${YELLOW}⚠${RESET}  $*"; }
err()  { echo -e "  ${RED}✗${RESET}  $*"; }
info() { echo -e "  ${CYAN}→${RESET}  $*"; }
dry()  { echo -e "  ${DIM}[dry-run]${RESET} $*"; }

expand_path() {
  local path="$1"
  path="${path//\{\{paths\.code\}\}/$(python3 -c "import json,os; print(os.path.expanduser(json.load(open('$USER_CONFIG')).get('paths',{}).get('code','~/Code')))" 2>/dev/null || echo "$HOME/Code")}"
  path="${path//\{\{paths\.documents\}\}/$(python3 -c "import json,os; print(os.path.expanduser(json.load(open('$USER_CONFIG')).get('paths',{}).get('documents','~/Documents')))" 2>/dev/null || echo "$HOME/Documents")}"
  path="${path//\{\{paths\.vault\}\}/$(python3 -c "import json,os; print(os.path.expanduser(json.load(open('$USER_CONFIG')).get('paths',{}).get('vault','~/Documents/vault')))" 2>/dev/null || echo "$HOME/Documents/vault")}"
  echo "$path"
}

resolve_env() {
  python3 - "$1" <<'PYEOF'
import json, sys, os
env_json = sys.argv[1]
env = json.loads(env_json) if env_json and env_json != 'null' else {}
resolved = {}
for k, v in env.items():
    if isinstance(v, str) and v.startswith('secret:'):
        key = v[len('secret:'):]
        result = os.popen(f'bash -c "source ~/.agents/src/lib/secrets.sh 2>/dev/null && secrets_get {key}"').read().strip()
        if not result:
            print(f"WARN: secret '{key}' not found", file=sys.stderr)
        resolved[k] = result
    else:
        resolved[k] = v
print(json.dumps(resolved))
PYEOF
}

echo ""
echo -e "${BOLD}agentctl sync${RESET}"
echo -e "${DIM}Source: $AGENTS_DIR${RESET}"
$DRY_RUN && echo -e "${YELLOW}DRY RUN — no changes will be made${RESET}"
echo ""

if [[ "$SKILLS_ONLY" == false ]] && [[ -f "$MCP_CONFIG" ]]; then
  echo -e "${BOLD}── MCP Servers ─────────────────────────────────────────────${RESET}"
  
  MCP_NAMES=$(python3 -c "import json; print(' '.join(json.load(open('$MCP_CONFIG')).keys()))")
  
  sync_opencode() {
    local config="$HOME/.config/opencode/opencode.json"
    echo -e "\n  ${BOLD}opencode${RESET}"
    if command -v opencode &>/dev/null; then
      $DRY_RUN && { dry "would write mcp block to $config"; return; }
      python3 << 'PYEOF'
import json, os, subprocess
mcp_path = os.path.expanduser('~/.agents/mcp-config.json')
user_config = os.path.expanduser('~/.agents/config.json')
out_path = os.path.expanduser('~/.config/opencode/opencode.json')

with open(mcp_path) as f:
    src = json.load(f)

paths = {"code": "~/Code", "documents": "~/Documents", "vault": "~/Documents/vault"}
if os.path.exists(user_config):
    with open(user_config) as f:
        paths.update(json.load(f).get('paths', {}))

def expand(p):
    for k, v in paths.items():
        p = p.replace(f'{{{{paths.{k}}}}}', os.path.expanduser(v))
    return p

def secret_lookup(account):
    r = subprocess.run(['bash', '-c', f'source ~/.agents/src/lib/secrets.sh && secrets_get {account}'],
                      capture_output=True, text=True)
    return r.stdout.strip()

def resolve_env(env):
    resolved = {}
    for k, v in (env or {}).items():
        if isinstance(v, str) and v.startswith('secret:'):
            resolved[k] = secret_lookup(v[len('secret:'):])
        else:
            resolved[k] = v
    return resolved

def resolve_headers(headers):
    import re
    return {k: re.sub(r'secret:([A-Z0-9_]+)', lambda m: secret_lookup(m.group(1)), v)
            for k, v in (headers or {}).items()}

out = {}
for name, cfg in src.items():
    args = [expand(a) for a in cfg.get('args', [])]
    if cfg.get('transport') == 'http':
        entry = {'type': 'remote', 'url': cfg['url']}
        if cfg.get('headers'):
            entry['headers'] = resolve_headers(cfg['headers'])
    else:
        entry = {'type': 'local', 'command': [cfg['command']] + args}
        if cfg.get('env'):
            entry['environment'] = resolve_env(cfg['env'])
    out[name] = entry

existing = {}
if os.path.exists(out_path):
    with open(out_path) as f:
        existing = json.load(f)

existing['mcp'] = out
os.makedirs(os.path.dirname(out_path), exist_ok=True)
with open(out_path, 'w') as f:
    json.dump(existing, f, indent=2)
    f.write('\n')
print(f"wrote {out_path}")
PYEOF
      ok "synced to opencode"
    else
      warn "opencode not found, skipping"
    fi
  }

  sync_claude() {
    echo -e "\n  ${BOLD}claude${RESET}"
    if command -v claude &>/dev/null; then
      $DRY_RUN && { dry "would sync to claude"; return; }
      python3 << 'PYEOF'
import json, os, subprocess, sys
mcp_path = os.path.expanduser('~/.agents/mcp-config.json')
user_config = os.path.expanduser('~/.agents/config.json')

with open(mcp_path) as f:
    src = json.load(f)

paths = {"code": "~/Code", "documents": "~/Documents", "vault": "~/Documents/vault"}
if os.path.exists(user_config):
    with open(user_config) as f:
        paths.update(json.load(f).get('paths', {}))

def expand(p):
    for k, v in paths.items():
        p = p.replace(f'{{{{paths.{k}}}}}', os.path.expanduser(v))
    return p

def secret_lookup(account):
    r = subprocess.run(['bash', '-c', f'source ~/.agents/src/lib/secrets.sh && secrets_get {account}'],
                      capture_output=True, text=True)
    return r.stdout.strip()

def resolve_env(env):
    resolved = {}
    for k, v in (env or {}).items():
        if isinstance(v, str) and v.startswith('secret:'):
            resolved[k] = secret_lookup(v[len('secret:'):])
        else:
            resolved[k] = v
    return resolved

def resolve_header_val(v):
    import re
    return re.sub(r'secret:([A-Z0-9_]+)', lambda m: secret_lookup(m.group(1)), v)

for name, cfg in src.items():
    subprocess.run(['claude', 'mcp', 'remove', name, '--scope', 'user'],
                  capture_output=True)
    
    args = [expand(a) for a in cfg.get('args', [])]
    if cfg.get('transport') == 'http':
        cmd = ['claude', 'mcp', 'add', '--transport', 'http', '--scope', 'user', name, cfg['url']]
        for k, v in (cfg.get('headers') or {}).items():
            cmd += ['-H', f'{k}: {resolve_header_val(v)}']
    else:
        cmd = ['claude', 'mcp', 'add', name, '--scope', 'user']
        for k, v in resolve_env(cfg.get('env', {})).items():
            cmd += ['-e', f'{k}={v}']
        cmd += ['--', cfg['command']] + args
    
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode == 0:
        print(f"  ok: {name}")
    else:
        print(f"  warn: {name}: {(r.stderr or r.stdout).strip()}", file=sys.stderr)
PYEOF
      ok "synced to claude"
    else
      warn "claude not found, skipping"
    fi
  }

  sync_gemini() {
    local settings="$HOME/.gemini/settings.json"
    echo -e "\n  ${BOLD}gemini${RESET}"
    if command -v gemini &>/dev/null; then
      $DRY_RUN && { dry "would write to $settings"; return; }
      python3 << 'PYEOF'
import json, os, subprocess
mcp_path = os.path.expanduser('~/.agents/mcp-config.json')
user_config = os.path.expanduser('~/.agents/config.json')
settings_path = os.path.expanduser('~/.gemini/settings.json')

with open(mcp_path) as f:
    src = json.load(f)

paths = {"code": "~/Code", "documents": "~/Documents", "vault": "~/Documents/vault"}
if os.path.exists(user_config):
    with open(user_config) as f:
        paths.update(json.load(f).get('paths', {}))

def expand(p):
    for k, v in paths.items():
        p = p.replace(f'{{{{paths.{k}}}}}', os.path.expanduser(v))
    return p

def secret_lookup(account):
    r = subprocess.run(['bash', '-c', f'source ~/.agents/src/lib/secrets.sh && secrets_get {account}'],
                      capture_output=True, text=True)
    return r.stdout.strip()

def resolve_env(env):
    resolved = {}
    for k, v in (env or {}).items():
        if isinstance(v, str) and v.startswith('secret:'):
            resolved[k] = secret_lookup(v[len('secret:'):])
        else:
            resolved[k] = v
    return resolved

def resolve_headers(headers):
    import re
    return {k: re.sub(r'secret:([A-Z0-9_]+)', lambda m: secret_lookup(m.group(1)), v)
            for k, v in (headers or {}).items()}

mcp_block = {}
for name, cfg in src.items():
    args = [expand(a) for a in cfg.get('args', [])]
    if cfg.get('transport') == 'http':
        entry = {'url': cfg['url'], 'transport': 'http'}
        if cfg.get('headers'):
            entry['headers'] = resolve_headers(cfg['headers'])
    else:
        entry = {'command': cfg['command'], 'args': args}
        if cfg.get('env'):
            entry['env'] = resolve_env(cfg['env'])
    mcp_block[name] = entry

existing = {}
if os.path.exists(settings_path):
    with open(settings_path) as f:
        existing = json.load(f)

existing['mcpServers'] = mcp_block
os.makedirs(os.path.dirname(settings_path), exist_ok=True)
with open(settings_path, 'w') as f:
    json.dump(existing, f, indent=2)
    f.write('\n')
print(f"wrote {settings_path}")
PYEOF
      ok "synced to gemini"
    else
      warn "gemini not found, skipping"
    fi
  }

  sync_opencode
  sync_claude
  sync_gemini
fi

if [[ "$MCP_ONLY" == false ]]; then
  echo -e "\n${BOLD}── Skills ──────────────────────────────────────────────────${RESET}"
  
  SKILL_NAMES=()
  while IFS= read -r skill_path; do
    SKILL_NAMES+=("$(basename "$(dirname "$skill_path")")")
  done < <(find -L "$SKILLS_DIR" -maxdepth 2 -name "SKILL.md" 2>/dev/null | sort)
  
  if [ ${#SKILL_NAMES[@]} -eq 0 ]; then
    warn "No skills found in $SKILLS_DIR"
  else
    info "Found ${#SKILL_NAMES[@]} skill(s): ${SKILL_NAMES[*]}"
  fi
  
  sync_skills_to_dir() {
    local cli_name="$1"
    local target_dir="$2"
    echo -e "\n  ${BOLD}$cli_name${RESET}  ${DIM}($target_dir)${RESET}"
    [ "$DRY_RUN" = false ] && mkdir -p "$target_dir"
    for skill in "${SKILL_NAMES[@]}"; do
      local src="$SKILLS_DIR/$skill"
      local dest="$target_dir/$skill"
      [ ! -d "$src" ] && continue
      $DRY_RUN && { dry "symlink $skill → $dest"; continue; }
      if [ -L "$dest" ] && [ "$(readlink "$dest")" = "$src" ]; then
        ok "already linked: $skill"; continue
      fi
      [ -L "$dest" ] || [ -d "$dest" ] && rm -rf "$dest"
      ln -s "$src" "$dest"
      ok "linked: $skill"
    done
  }
  
  command -v claude   &>/dev/null && sync_skills_to_dir "claude"   "$HOME/.claude/skills"   || warn "claude not found"
  command -v opencode &>/dev/null && sync_skills_to_dir "opencode" "$HOME/.config/opencode/skills" || warn "opencode not found"
  command -v gemini   &>/dev/null && info "gemini reads ~/.agents/skills/ natively" || warn "gemini not found"
fi

echo ""
echo -e "${BOLD}── Summary ─────────────────────────────────────────────────${RESET}"
if [ "$DRY_RUN" = true ]; then
  echo -e "  ${YELLOW}Dry run complete — no changes made.${RESET}"
else
  echo -e "  ${GREEN}Sync complete.${RESET}"
fi
echo ""
