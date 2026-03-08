#!/usr/bin/env bash
# Sync MCP servers and skills to all AI providers

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/secrets.sh"

AGENTS_DIR="${AGENTS_DIR:-$HOME/.agents}"
MCP_CONFIG="$AGENTS_DIR/mcp-config.json"
SKILLS_DIR="$AGENTS_DIR/skills"
USER_CONFIG="$AGENTS_DIR/config.json"
RESOLVER="$SCRIPT_DIR/../lib/config_resolver.py"

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

if [[ ! -d "$AGENTS_DIR" ]]; then
  echo "Error: ~/.agents/ not initialized. Run 'agentctl init' first." >&2
  exit 1
fi

BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
RED='\033[0;31m'; CYAN='\033[0;36m'; DIM='\033[2m'; RESET='\033[0m'
ok()   { echo -e "  ${GREEN}✓${RESET}  $*"; }
warn() { echo -e "  ${YELLOW}⚠${RESET}  $*"; }
info() { echo -e "  ${CYAN}→${RESET}  $*"; }
dry()  { echo -e "  ${DIM}[dry-run]${RESET} $*"; }

echo ""
echo -e "${BOLD}agentctl sync${RESET}"
echo -e "${DIM}Source: $AGENTS_DIR${RESET}"
$DRY_RUN && echo -e "${YELLOW}DRY RUN — no changes will be made${RESET}"
echo ""

base_args=(
  --mcp-config  "$MCP_CONFIG"
  --user-config "$USER_CONFIG"
  --secrets-sh  "$SCRIPT_DIR/../lib/secrets.sh"
)
$DRY_RUN && base_args+=(--dry-run)

PROVIDER_INFO=$(python3 "$RESOLVER" "${base_args[@]}" --action list-providers 2>/dev/null || true)

if [[ "$SKILLS_ONLY" == false ]] && [[ -f "$MCP_CONFIG" ]]; then
  echo -e "${BOLD}── MCP Servers ─────────────────────────────────────────────${RESET}"

  while IFS='|' read -r provider detect_cmd _skills_path _skills_method; do
    [[ -z "$provider" ]] && continue
    echo -e "\n  ${BOLD}${provider}${RESET}"
    if command -v "$detect_cmd" &>/dev/null; then
      if python3 "$RESOLVER" "${base_args[@]}" --action sync --provider "$provider"; then
        ok "synced to $provider"
      else
        warn "sync failed for $provider"
      fi
    else
      warn "$detect_cmd not found, skipping"
    fi
  done <<< "$PROVIDER_INFO"
fi

if [[ "$MCP_ONLY" == false ]]; then
  echo -e "\n${BOLD}── Skills ──────────────────────────────────────────────────${RESET}"

  SKILL_NAMES=()
  while IFS= read -r skill_path; do
    SKILL_NAMES+=("$(basename "$(dirname "$skill_path")")")
  done < <(find -L "$SKILLS_DIR" -maxdepth 2 -name "SKILL.md" 2>/dev/null | sort)

  if [[ ${#SKILL_NAMES[@]} -eq 0 ]]; then
    warn "No skills found in $SKILLS_DIR"
  else
    info "Found ${#SKILL_NAMES[@]} skill(s): ${SKILL_NAMES[*]}"
  fi

  while IFS='|' read -r provider detect_cmd skills_path skills_method; do
    [[ -z "$provider" ]] && continue
    if ! command -v "$detect_cmd" &>/dev/null; then
      warn "$detect_cmd not found"
      continue
    fi
    if [[ "$skills_method" == "native" ]]; then
      info "$provider reads $SKILLS_DIR natively"
      continue
    fi
    echo -e "\n  ${BOLD}$provider${RESET}  ${DIM}($skills_path)${RESET}"
    python3 "$RESOLVER" "${base_args[@]}" \
      --action sync-skills \
      --skills-dir    "$SKILLS_DIR" \
      --skills-target "$skills_path" \
      --provider      "$provider" \
      || warn "skills sync failed for $provider"
  done <<< "$PROVIDER_INFO"
fi

echo ""
echo -e "${BOLD}── Summary ─────────────────────────────────────────────────${RESET}"
if [[ "$DRY_RUN" == true ]]; then
  echo -e "  ${YELLOW}Dry run complete — no changes made.${RESET}"
else
  echo -e "  ${GREEN}Sync complete.${RESET}"
fi
echo ""
