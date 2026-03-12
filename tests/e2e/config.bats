#!/usr/bin/env bats
# End-to-end tests for agentctl config command

load '../test_helper'

setup() {
  setup_test_env
  agentctl init
}

teardown() {
  teardown_test_env
}

@test "config list shows current configuration" {
  run agentctl config list
  
  [ "$status" -eq 0 ]
  assert_file_contains "$AGENTS_DIR/config.json" "paths"
  [[ "$output" == *"paths"* ]]
}

@test "config get retrieves a value" {
  run agentctl config get paths.code
  
  [ "$status" -eq 0 ]
  [ "$output" = "~/Code" ]
}

@test "config set updates a value" {
  run agentctl config set paths.code "~/Projects"
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"Set paths.code"* ]]
  
  run agentctl config get paths.code
  [ "$output" = "~/Projects" ]
}

@test "config set creates nested keys" {
  run agentctl config set paths.custom "~/Custom"
  
  [ "$status" -eq 0 ]
  
  run agentctl config get paths.custom
  [ "$output" = "~/Custom" ]
}

@test "config get fails for non-existent key" {
  run agentctl config get non.existent.key
  
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "config set requires key and value" {
  run agentctl config set
  
  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage"* ]]
}

@test "config without subcommand shows list" {
  run agentctl config
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"paths"* ]]
}

@test "config preserves JSON formatting" {
  agentctl config set paths.code "~/Projects"
  
  run cat "$AGENTS_DIR/config.json"
  [[ "$output" == *'"paths"'* ]]
  [[ "$output" == *'"code"'* ]]
  [[ "$output" == *"}"* ]]
}

@test "config can set providers array" {
  skip "Array handling needs custom implementation"
  run agentctl config set providers '["opencode","claude"]'
  
  [ "$status" -eq 0 ]
}

@test "config can set secretsBackend" {
  run agentctl config set secretsBackend "pass"
  
  [ "$status" -eq 0 ]
  
  run agentctl config get secretsBackend
  [ "$output" = "pass" ]
}

@test "config handles paths with spaces" {
  run agentctl config set paths.code "~/My Projects"
  
  [ "$status" -eq 0 ]
  
  run agentctl config get paths.code
  [ "$output" = "~/My Projects" ]
}

@test "config fails before init" {
  rm -rf "$AGENTS_DIR"
  
  run agentctl config list
  
  [ "$status" -eq 1 ]
  [[ "$output" == *"Run 'vakt init' first"* ]]
}
