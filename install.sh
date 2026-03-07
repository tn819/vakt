#!/usr/bin/env bash
# One-line installer for agentctl
# Usage: curl -fsSL https://raw.githubusercontent.com/yourorg/agentctl/main/install.sh | bash

set -euo pipefail

REPO_URL="https://github.com/yourorg/agentctl"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.agentctl}"
AGENTS_DIR="${AGENTS_DIR:-$HOME/.agents}"

BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
CYAN='\033[0;36m'; DIM='\033[2m'; RESET='\033[0m'

ok()   { echo -e "${GREEN}✓${RESET} $*"; }
info() { echo -e "${CYAN}→${RESET} $*"; }

echo ""
echo -e "${BOLD}agentctl installer${RESET}"
echo ""

check_deps() {
  local missing=()
  command -v git   &>/dev/null || missing+=("git")
  command -v python3 &>/dev/null || missing+=("python3")
  
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo -e "${YELLOW}Missing dependencies: ${missing[*]}${RESET}"
    echo ""
    echo "Install them with:"
    if [[ "$OSTYPE" == "darwin"* ]]; then
      echo "  brew install ${missing[*]}"
    elif [[ "$OSTYPE" == "linux"* ]]; then
      echo "  sudo apt install ${missing[*]}"
    fi
    exit 1
  fi
}

install() {
  info "Checking dependencies..."
  check_deps
  ok "Dependencies satisfied"
  
  echo ""
  info "Installing agentctl..."
  
  if [[ -d "$INSTALL_DIR" ]]; then
    info "Updating existing installation..."
    git -C "$INSTALL_DIR" pull
  else
    info "Cloning repository..."
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi
  ok "Installed to $INSTALL_DIR"
  
  echo ""
  info "Setting up CLI..."
  
  local bin_link="/usr/local/bin/agentctl"
  if [[ -w "/usr/local/bin" ]]; then
    ln -sf "$INSTALL_DIR/src/agentctl.sh" "$bin_link"
    ok "Linked CLI to $bin_link"
  else
    echo ""
    echo -e "${YELLOW}Note: Add to your shell config:${RESET}"
    echo -e "  ${DIM}export PATH=\"\$PATH:$INSTALL_DIR/src\"${RESET}"
    echo ""
    echo "Or run:"
    echo -e "  ${DIM}sudo ln -s $INSTALL_DIR/src/agentctl.sh /usr/local/bin/agentctl${RESET}"
  fi
  
  echo ""
  info "Setting up shell completion..."
  for shell in bash zsh fish; do
    local comp_dir=""
    case "$shell" in
      bash) comp_dir="$HOME/.bash_completion.d" ;;
      zsh)  comp_dir="$HOME/.zsh/completion" ;;
      fish) comp_dir="$HOME/.config/fish/completions" ;;
    esac
    if [[ -d "$(dirname "$comp_dir")" ]]; then
      mkdir -p "$comp_dir"
      cat > "$comp_dir/agentctl" << 'COMPLETION'
_agents_mcp_completion() {
  local cur prev words cword
  _init_completion || return
  case $prev in
    agentctl)
      COMPREPLY=($(compgen -W "init sync secrets config add-server add-skill list upgrade" -- "$cur"))
      ;;
    secrets)
      COMPREPLY=($(compgen -W "set get delete list" -- "$cur"))
      ;;
    config)
      COMPREPLY=($(compgen -W "get set list" -- "$cur"))
      ;;
  esac
}
complete -F _agents_mcp_completion agentctl
COMPLETION
      ok "Installed $shell completion"
    fi
  done
  
  echo ""
  echo -e "${BOLD}Installation complete!${RESET}"
  echo ""
  echo "Next steps:"
  echo ""
  echo "  1. Initialize:"
  echo -e "     ${CYAN}agentctl init${RESET}"
  echo ""
  echo "  2. Configure paths in ~/.agents/config.json"
  echo ""
  echo "  3. Add your secrets:"
  echo -e "     ${CYAN}agentctl secrets${RESET}"
  echo ""
  echo "  4. Sync to all providers:"
  echo -e "     ${CYAN}agentctl sync${RESET}"
  echo ""
}

uninstall() {
  echo "Uninstalling agentctl..."
  rm -rf "$INSTALL_DIR"
  rm -f "/usr/local/bin/agentctl"
  echo "Done. Your ~/.agents/ directory was preserved."
}

case "${1:-install}" in
  install)  install ;;
  uninstall) uninstall ;;
  *)
    echo "Usage: $0 [install|uninstall]"
    exit 1
    ;;
esac
