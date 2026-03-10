#!/usr/bin/env bash

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/.." && pwd)"
AGENTCTL="${PROJECT_ROOT}/src/agentctl.sh"

setup_test_env() {
  # Full HOME sandbox — no real ~/.claude, ~/.cursor, etc. can leak in
  export SANDBOX_HOME="$(mktemp -d)"
  export HOME="$SANDBOX_HOME"
  export AGENTS_DIR="$SANDBOX_HOME/.agents"
}

teardown_test_env() {
  if [[ -n "${SANDBOX_HOME:-}" && -d "$SANDBOX_HOME" ]]; then
    rm -rf "$SANDBOX_HOME"
  fi
}

agentctl() {
  "$AGENTCTL" "$@"
}

assert_file_exists() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "Expected file to exist: $file" >&2
    return 1
  fi
}

assert_dir_exists() {
  local dir="$1"
  if [[ ! -d "$dir" ]]; then
    echo "Expected directory to exist: $dir" >&2
    return 1
  fi
}

assert_file_contains() {
  local file="$1"
  local string="$2"
  if ! grep -q "$string" "$file"; then
    echo "Expected file $file to contain: $string" >&2
    return 1
  fi
}

assert_json_key_exists() {
  local file="$1"
  local key="$2"
  if ! python3 -c "import json, sys; json.load(open('$file'))['$key']" 2>/dev/null; then
    echo "Expected JSON key '$key' in $file" >&2
    return 1
  fi
}

assert_json_equals() {
  local file="$1"
  local key="$2"
  local expected="$3"
  local actual
  actual=$(python3 -c "import json; print(json.load(open('$file'))$key)")
  if [[ "$actual" != "$expected" ]]; then
    echo "Expected $key = '$expected', got '$actual'" >&2
    return 1
  fi
}

create_test_skill() {
  local skill_dir="$1"
  local skill_name="${2:-test-skill}"
  
  mkdir -p "$skill_dir"
  cat > "$skill_dir/SKILL.md" << EOF
---
name: $skill_name
description: A test skill
---

# $skill_name

Test skill for e2e testing.
EOF
}

mock_secrets_backend() {
  export AGENTS_SECRETS_BACKEND="env"
}

set_test_secret() {
  local key="$1"
  local value="$2"
  echo "${key}=${value}" >> "$AGENTS_DIR/secrets.env"
}

skip_if_missing() {
  local cmd="$1"
  if ! command -v "$cmd" &>/dev/null; then
    skip "$cmd not installed"
  fi
}

wait_for_file() {
  local file="$1"
  local timeout="${2:-5}"
  local count=0
  
  while [[ ! -f "$file" && $count -lt $timeout ]]; do
    sleep 1
    ((count++))
  done
  
  if [[ ! -f "$file" ]]; then
    echo "Timeout waiting for file: $file" >&2
    return 1
  fi
}

mock_provider_config() {
  local provider="$1"
  local config_dir
  
  case "$provider" in
    opencode)
      config_dir="$HOME/.config/opencode"
      ;;
    claude)
      config_dir="$HOME"
      ;;
    gemini)
      config_dir="$HOME/.gemini"
      ;;
    codex)
      config_dir="$HOME/.codex"
      ;;
    cursor)
      config_dir="$HOME/.cursor"
      ;;
    windsurf)
      config_dir="$HOME/.codeium/windsurf"
      ;;
    *)
      echo "Unknown provider: $provider" >&2
      return 1
      ;;
  esac
  
  mkdir -p "$config_dir"
  echo "$config_dir"
}
