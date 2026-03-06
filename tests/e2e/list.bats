#!/usr/bin/env bats
# End-to-end tests for agentctl list command

load '../test_helper'

setup() {
  setup_test_env
  agentctl init
}

teardown() {
  teardown_test_env
}

@test "list shows MCP servers section" {
  run agentctl list
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"MCP Servers"* ]]
}

@test "list shows Skills section" {
  run agentctl list
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"Skills"* ]]
}

@test "list shows Secrets section" {
  run agentctl list
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"Secrets"* ]]
}

@test "list shows configured servers" {
  agentctl add-server test-server npx -y test-mcp
  
  run agentctl list
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"test-server"* ]]
}

@test "list shows installed skills" {
  local skill_dir="$(mktemp -d)"
  create_test_skill "$skill_dir" "test-skill"
  agentctl add-skill "$skill_dir"
  
  run agentctl list
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"test-skill"* ]]
  
  rm -rf "$skill_dir"
}

@test "list shows skill descriptions" {
  local skill_dir="$(mktemp -d)"
  create_test_skill "$skill_dir" "test-skill"
  agentctl add-skill "$skill_dir"
  
  run agentctl list
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"A test skill"* ]]
  
  rm -rf "$skill_dir"
}

@test "list shows secrets backend" {
  mock_secrets_backend
  
  run agentctl list
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"Backend"* ]]
}

@test "list shows stored secrets" {
  mock_secrets_backend
  agentctl secrets set TEST_KEY "test_value"
  
  run agentctl list
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"TEST_KEY"* ]]
}

@test "list servers shows command" {
  agentctl add-server my-server npx -y my-mcp
  
  run agentctl list servers
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"my-server"* ]]
  [[ "$output" == *"npx"* ]]
}

@test "list skills only" {
  local skill_dir="$(mktemp -d)"
  create_test_skill "$skill_dir" "test-skill"
  agentctl add-skill "$skill_dir"
  
  run agentctl list skills
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"test-skill"* ]]
  [[ "$output" != *"MCP Servers"* ]]
  
  rm -rf "$skill_dir"
}

@test "list secrets only" {
  mock_secrets_backend
  agentctl secrets set KEY1 "value1"
  
  run agentctl list secrets
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"KEY1"* ]]
  [[ "$output" != *"MCP Servers"* ]]
  [[ "$output" != *"Skills"* ]]
}

@test "list empty state" {
  run agentctl list
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"~/.agents/"* ]]
}

@test "list shows HTTP server URL" {
  agentctl add-server http-server --http https://example.com/mcp
  
  run agentctl list
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"https://example.com/mcp"* ]]
}

@test "list handles multiple skills" {
  for i in 1 2 3; do
    local skill_dir="$(mktemp -d)"
    create_test_skill "$skill_dir" "skill-$i"
    agentctl add-skill "$skill_dir"
    rm -rf "$skill_dir"
  done
  
  run agentctl list
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"skill-1"* ]]
  [[ "$output" == *"skill-2"* ]]
  [[ "$output" == *"skill-3"* ]]
}
