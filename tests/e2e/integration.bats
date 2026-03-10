#!/usr/bin/env bats
# Integration test: Full agentctl workflow

load '../test_helper'

setup() {
  setup_test_env
  mock_secrets_backend
}

teardown() {
  teardown_test_env
}

@test "full workflow: init -> config -> secrets -> add-server -> add-skill -> sync" {
  # 1. Initialize
  run agentctl init
  [ "$status" -eq 0 ]
  assert_dir_exists "$AGENTS_DIR"
  
  # 2. Configure paths
  run agentctl config set paths.code "~/Projects"
  [ "$status" -eq 0 ]
  
  run agentctl config get paths.code
  [ "$output" = "~/Projects" ]
  
  # 3. Add secrets
  run agentctl secrets set GITHUB_TOKEN "ghp_test123"
  [ "$status" -eq 0 ]
  
  run agentctl secrets get GITHUB_TOKEN
  [ "$output" = "ghp_test123" ]
  
  # 4. Add MCP server
  run agentctl add-server my-github npx -y @modelcontextprotocol/server-github
  [ "$status" -eq 0 ]
  
  # 5. Add skill
  local skill_base="$(mktemp -d)"
  local skill_dir="$skill_base/test-skill"
  mkdir -p "$skill_dir"
  create_test_skill "$skill_dir" "test-skill"

  run agentctl add-skill "$skill_dir"
  [ "$status" -eq 0 ]

  # 6. List everything (skill_base kept alive so symlink resolves)
  run agentctl list
  rm -rf "$skill_base"
  [ "$status" -eq 0 ]
  [[ "$output" == *"my-github"* ]]
  [[ "$output" == *"test-skill"* ]]
  [[ "$output" == *"GITHUB_TOKEN"* ]]
  
  # 7. Sync (dry-run)
  run agentctl sync --dry-run
  [ "$status" -eq 0 ]
}

@test "workflow: multiple servers and skills" {
  agentctl init
  
  # Add multiple servers
  agentctl add-server fs npx -y @modelcontextprotocol/server-filesystem /tmp
  agentctl add-server gh npx -y @modelcontextprotocol/server-github
  agentctl add-server http-server --http https://api.example.com/mcp
  
  # Add multiple skills
  local skill_bases=()
  for i in 1 2 3; do
    local base="$(mktemp -d)"
    skill_bases+=("$base")
    local skill_dir="$base/skill-$i"
    mkdir -p "$skill_dir"
    create_test_skill "$skill_dir" "skill-$i"
    agentctl add-skill "$skill_dir"
  done

  # Verify all are listed (keep dirs alive so symlinks resolve)
  run agentctl list
  for base in "${skill_bases[@]}"; do rm -rf "$base"; done
  [ "$status" -eq 0 ]

  [[ "$output" == *"fs"* ]]
  [[ "$output" == *"gh"* ]]
  [[ "$output" == *"http-server"* ]]
  [[ "$output" == *"skill-1"* ]]
  [[ "$output" == *"skill-2"* ]]
  [[ "$output" == *"skill-3"* ]]
}

@test "workflow: update and re-sync" {
  agentctl init
  
  # Initial setup
  agentctl add-server test-server npx -y test-mcp
  agentctl secrets set TEST_TOKEN "initial_token"
  
  # Sync
  run agentctl sync --dry-run
  [ "$status" -eq 0 ]
  
  # Update config
  agentctl add-server test-server npx -y updated-mcp
  
  # Update secret
  agentctl secrets set TEST_TOKEN "updated_token"
  
  # Re-sync
  run agentctl sync --dry-run
  [ "$status" -eq 0 ]
  
  # Verify updates
  run agentctl secrets get TEST_TOKEN
  [ "$output" = "updated_token" ]
}

@test "workflow: delete and cleanup" {
  agentctl init
  agentctl secrets set TEMP_KEY "temp_value"
  
  # Verify secret exists
  run agentctl secrets get TEMP_KEY
  [ "$output" = "temp_value" ]
  
  # Delete secret
  run agentctl secrets delete TEMP_KEY
  [ "$status" -eq 0 ]
  
  # Verify deletion
  run agentctl secrets get TEMP_KEY
  [ "$status" -eq 1 ]
}

@test "workflow: error recovery" {
  agentctl init
  
  # Try invalid command
  run agentctl add-server
  [ "$status" -eq 1 ]
  
  # System should still work
  run agentctl config list
  [ "$status" -eq 0 ]
  
  # Try adding skill with invalid path
  run agentctl add-skill "/non/existent/path"
  [ "$status" -eq 1 ]
  
  # System should still work
  run agentctl list
  [ "$status" -eq 0 ]
}

@test "workflow: config modifications" {
  agentctl init
  
  # Modify multiple config values
  agentctl config set paths.code "~/MyCode"
  agentctl config set paths.documents "~/MyDocs"
  agentctl config set paths.vault "~/MyVault"
  agentctl config set secretsBackend "env"
  
  # Verify all changes
  run agentctl config get paths.code
  [ "$output" = "~/MyCode" ]
  
  run agentctl config get paths.documents
  [ "$output" = "~/MyDocs" ]
  
  run agentctl config get paths.vault
  [ "$output" = "~/MyVault" ]
  
  run agentctl config get secretsBackend
  [ "$output" = "env" ]
}

@test "workflow: re-initialize" {
  # First init
  agentctl init
  agentctl config set paths.code "~/First"
  
  # Re-init with overwrite
  run agentctl init <<< "y"
  [ "$status" -eq 0 ]
  
  # Should be back to defaults
  run agentctl config get paths.code
  [ "$output" = "~/Code" ]
}

@test "workflow: secrets with special characters" {
  agentctl init

  # Test various special characters — use a stable key per iteration
  local test_values=(
    "value with spaces"
    "value_with_underscores"
    "value-with-hyphens"
    "value.with.dots"
    "value123numbers"
  )

  local i=0
  for value in "${test_values[@]}"; do
    local key="SPECIAL_KEY_$i"
    agentctl secrets set "$key" "$value"

    run agentctl secrets get "$key"
    [ "$status" -eq 0 ]
    [ "$output" = "$value" ]
    (( i++ )) || true
  done
}

@test "workflow: list filtering" {
  agentctl init
  agentctl add-server test-server npx -y test-mcp
  
  local skill_base="$(mktemp -d)"
  local skill_dir="$skill_base/test-skill"
  mkdir -p "$skill_dir"
  create_test_skill "$skill_dir" "test-skill"
  agentctl add-skill "$skill_dir"

  agentctl secrets set TEST_KEY "value"
  
  # List only servers
  run agentctl list servers
  [ "$status" -eq 0 ]
  [[ "$output" == *"test-server"* ]]
  [[ "$output" != *"test-skill"* ]]
  [[ "$output" != *"TEST_KEY"* ]]

  # List only skills (keep skill_base alive so symlink resolves)
  run agentctl list skills
  [ "$status" -eq 0 ]
  [[ "$output" == *"test-skill"* ]]
  [[ "$output" != *"test-server"* ]]

  # List only secrets
  run agentctl list secrets
  rm -rf "$skill_base"
  [ "$status" -eq 0 ]
  [[ "$output" == *"TEST_KEY"* ]]
  [[ "$output" != *"test-server"* ]]
  [[ "$output" != *"test-skill"* ]]
}
