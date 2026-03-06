#!/usr/bin/env bats
# End-to-end tests for agentctl init command

load '../test_helper'

setup() {
  setup_test_env
}

teardown() {
  teardown_test_env
}

@test "init creates ~/.agents/ directory structure" {
  run agentctl init
  
  [ "$status" -eq 0 ]
  assert_dir_exists "$AGENTS_DIR"
  assert_dir_exists "$AGENTS_DIR/skills"
}

@test "init creates default config files" {
  run agentctl init
  
  [ "$status" -eq 0 ]
  assert_file_exists "$AGENTS_DIR/config.json"
  assert_file_exists "$AGENTS_DIR/mcp-config.json"
  assert_file_exists "$AGENTS_DIR/AGENTS.md"
}

@test "init config.json has correct structure" {
  agentctl init
  
  assert_json_key_exists "$AGENTS_DIR/config.json" "paths"
  assert_json_key_exists "$AGENTS_DIR/config.json" "providers"
  assert_json_key_exists "$AGENTS_DIR/config.json" "secretsBackend"
}

@test "init mcp-config.json has default servers" {
  agentctl init
  
  assert_json_key_exists "$AGENTS_DIR/mcp-config.json" "filesystem"
  assert_json_key_exists "$AGENTS_DIR/mcp-config.json" "github"
}

@test "init config.json has correct default paths" {
  agentctl init
  
  assert_json_equals "$AGENTS_DIR/config.json" "['paths']['code']" "~/Code"
  assert_json_equals "$AGENTS_DIR/config.json" "['paths']['documents']" "~/Documents"
  assert_json_equals "$AGENTS_DIR/config.json" "['paths']['vault']" "~/Documents/vault"
}

@test "init shows success message with checkmarks" {
  run agentctl init
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"✓"* ]]
  [[ "$output" == *"Created $AGENTS_DIR"* ]]
}

@test "init prompts before overwriting existing directory" {
  agentctl init
  run agentctl init <<< "n"
  
  [ "$status" -eq 1 ]
  [[ "$output" == *"already exists"* ]]
}

@test "init --dry-run shows what would be created" {
  run agentctl init --dry-run
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"dry-run"* ]]
  [[ "$output" == *"Would create"* ]]
  [ ! -d "$AGENTS_DIR" ]
}

@test "init can overwrite existing directory when confirmed" {
  agentctl init
  echo "modified" > "$AGENTS_DIR/config.json"
  
  run agentctl init <<< "y"
  
  [ "$status" -eq 0 ]
  assert_file_contains "$AGENTS_DIR/config.json" '"paths"'
}

@test "init AGENTS.md has correct content" {
  agentctl init
  
  assert_file_contains "$AGENTS_DIR/AGENTS.md" "Agent Standards"
  assert_file_contains "$AGENTS_DIR/AGENTS.md" "~/.agents/skills/"
}

@test "init creates empty skills directory" {
  agentctl init
  
  [ "$(ls -A "$AGENTS_DIR/skills" 2>/dev/null | wc -l)" -eq 0 ]
}

@test "init outputs next steps" {
  run agentctl init
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"Next steps"* ]]
  [[ "$output" == *"agentctl secrets"* ]]
  [[ "$output" == *"agentctl sync"* ]]
}
