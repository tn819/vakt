#!/usr/bin/env bash
# Cross-platform secrets management for agentctl
# Supports: macOS Keychain, Linux pass, environment variables

set -euo pipefail

# Detect OS and available secret backends
detect_backend() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    if command -v security &>/dev/null; then
      echo "keychain"
      return 0
    fi
  elif [[ "$OSTYPE" == "linux"* ]]; then
    if command -v pass &>/dev/null; then
      echo "pass"
      return 0
    fi
  fi
  echo "env"
}

# Get the current backend (from config or auto-detect)
get_backend() {
  local config_file="${AGENTS_DIR:-$HOME/.agents}/config.json"
  if [[ -f "$config_file" ]]; then
    local backend=$(python3 -c "import json; print(json.load(open('$config_file')).get('secretsBackend', 'auto'))" 2>/dev/null || echo "auto")
    if [[ "$backend" != "auto" ]]; then
      echo "$backend"
      return 0
    fi
  fi
  detect_backend
}

# Store a secret
# Usage: secrets_set <key> <value>
secrets_set() {
  local key="$1"
  local value="$2"
  local backend=$(get_backend)
  local service="${AGENTS_SERVICE:-agentctl}"
  
  case "$backend" in
    keychain)
      security add-generic-password -s "$service" -a "$key" -w "$value" -U 2>/dev/null
      ;;
    pass)
      echo "$value" | pass insert -e "${service}/${key}" 2>/dev/null
      ;;
    env)
      # Store in ~/.agents/secrets.env (not recommended for production)
      local secrets_file="${AGENTS_DIR:-$HOME/.agents}/secrets.env"
      mkdir -p "$(dirname "$secrets_file")"
      # Remove existing key if present
      grep -v "^${key}=" "$secrets_file" 2>/dev/null > "${secrets_file}.tmp" || true
      echo "${key}=${value}" >> "${secrets_file}.tmp"
      mv "${secrets_file}.tmp" "$secrets_file"
      chmod 600 "$secrets_file"
      ;;
    *)
      echo "ERROR: Unknown secrets backend: $backend" >&2
      return 1
      ;;
  esac
}

# Retrieve a secret
# Usage: secrets_get <key>
secrets_get() {
  local key="$1"
  local backend=$(get_backend)
  local service="${AGENTS_SERVICE:-agentctl}"
  
  case "$backend" in
    keychain)
      security find-generic-password -s "$service" -a "$key" -w 2>/dev/null || echo ""
      ;;
    pass)
      pass show "${service}/${key}" 2>/dev/null || echo ""
      ;;
    env)
      local secrets_file="${AGENTS_DIR:-$HOME/.agents}/secrets.env"
      if [[ -f "$secrets_file" ]]; then
        grep "^${key}=" "$secrets_file" 2>/dev/null | cut -d'=' -f2- || echo ""
      else
        echo ""
      fi
      ;;
    *)
      echo "" ;;
  esac
}

# Delete a secret
# Usage: secrets_delete <key>
secrets_delete() {
  local key="$1"
  local backend=$(get_backend)
  local service="${AGENTS_SERVICE:-agentctl}"
  
  case "$backend" in
    keychain)
      security delete-generic-password -s "$service" -a "$key" 2>/dev/null || true
      ;;
    pass)
      pass rm -f "${service}/${key}" 2>/dev/null || true
      ;;
    env)
      local secrets_file="${AGENTS_DIR:-$HOME/.agents}/secrets.env"
      if [[ -f "$secrets_file" ]]; then
        grep -v "^${key}=" "$secrets_file" > "${secrets_file}.tmp" 2>/dev/null || true
        mv "${secrets_file}.tmp" "$secrets_file"
      fi
      ;;
  esac
}

# List all secrets keys (not values)
# Usage: secrets_list
secrets_list() {
  local backend=$(get_backend)
  local service="${AGENTS_SERVICE:-agentctl}"
  
  case "$backend" in
    keychain)
      security dump-keychain 2>/dev/null | grep -A2 "agrp:\"${service}\"" | grep "acct" | sed 's/.*acct:<blob>="//;s/"$//' | sort -u
      ;;
    pass)
      pass ls "${service}/" 2>/dev/null | tail -n +2 | sed 's/├── //;s/└── //;s/\.gpg$//'
      ;;
    env)
      local secrets_file="${AGENTS_DIR:-$HOME/.agents}/secrets.env"
      if [[ -f "$secrets_file" ]]; then
        cut -d'=' -f1 "$secrets_file"
      fi
      ;;
  esac
}

# Check if a secret exists
# Usage: secrets_has <key>
secrets_has() {
  local key="$1"
  local value=$(secrets_get "$key")
  [[ -n "$value" ]]
}

# Resolve "secret:<key>" references in a string
# Usage: secrets_resolve "<value with secret:KEY>"
secrets_resolve() {
  local input="$1"
  echo "$input" | python3 -c "
import re, sys, subprocess
val = sys.stdin.read()
def lookup(key):
    result = subprocess.run(['bash', '-c', f'source \"\${0}\" && secrets_get \"{key}\"', '$0'], 
                          capture_output=True, text=True)
    return result.stdout.strip()
output = re.sub(r'secret:([A-Z0-9_]+)', lambda m: lookup(m.group(1)), val)
print(output)
"
}

# Interactive secret setup
# Usage: secrets_interactive
secrets_interactive() {
  local backend=$(get_backend)
  echo ""
  echo -e "\033[1mSecrets Management\033[0m"
  echo -e "Backend: \033[36m$backend\033[0m"
  echo ""
  
  # Get required keys from mcp-config.json
  local mcp_config="${AGENTS_DIR:-$HOME/.agents}/mcp-config.json"
  if [[ ! -f "$mcp_config" ]]; then
    echo "No mcp-config.json found. Run 'agentctl init' first."
    return 1
  fi
  
  local required_keys=$(python3 -c "
import json, re
with open('$mcp_config') as f:
    raw = f.read()
keys = sorted(set(re.findall(r'secret:([A-Z0-9_]+)', raw)))
print('\n'.join(keys))
" 2>/dev/null)
  
  if [[ -z "$required_keys" ]]; then
    echo "No secret references found in mcp-config.json"
    return 0
  fi
  
  echo "Keys referenced in mcp-config.json:"
  echo ""
  while IFS= read -r key; do
    [[ -z "$key" ]] && continue
    local existing=$(secrets_get "$key")
    if [[ -n "$existing" ]]; then
      echo -e "  \033[32m✓\033[0m $key \033[2m(already set)\033[0m"
    else
      echo -e "  \033[33m⚠\033[0m $key \033[33m(not set)\033[0m"
    fi
  done <<< "$required_keys"
  
  echo ""
  echo "Enter values for unset/rotated keys (leave blank to skip):"
  echo ""
  
  while IFS= read -r key; do
    [[ -z "$key" ]] && continue
    local existing=$(secrets_get "$key")
    local prompt="\033[1m$key\033[0m"
    [[ -n "$existing" ]] && prompt="$prompt \033[2m(press enter to keep current)\033[0m"
    echo -ne "  $prompt: "
    IFS= read -rs value </dev/tty
    echo ""
    if [[ -n "$value" ]]; then
      secrets_set "$key" "$value"
      echo -e "  \033[32m✓\033[0m Stored: $key"
    elif [[ -z "$existing" ]]; then
      echo -e "  \033[33m⚠\033[0m Skipped: $key (MCP servers using this key will receive empty value)"
    fi
  done <<< "$required_keys"
  
  echo ""
  echo -e "\033[32mDone.\033[0m Run 'agentctl sync' to apply to all providers."
}

# Export functions for use by other scripts
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
  export -f detect_backend get_backend secrets_set secrets_get secrets_delete secrets_list secrets_has secrets_resolve secrets_interactive
fi
