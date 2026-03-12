#!/usr/bin/env bats
# End-to-end tests for agentctl add-server command

load '../test_helper'

setup() {
  setup_test_env
  agentctl init
}

teardown() {
  teardown_test_env
}

@test "add-server adds stdio MCP server" {
  run agentctl add-server my-server npx -y my-mcp
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"Added server: my-server"* ]]
  
  assert_json_key_exists "$AGENTS_DIR/mcp-config.json" "my-server"
}

@test "add-server adds HTTP MCP server" {
  run agentctl add-server http-server --http https://example.com/mcp
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"Added HTTP server: http-server"* ]]
  
  assert_json_key_exists "$AGENTS_DIR/mcp-config.json" "http-server"
}

@test "add-server stores command and args" {
  agentctl add-server test-server npx -y test-mcp --option value
  
  run cat "$AGENTS_DIR/mcp-config.json"
  [[ "$output" == *"\"command\": \"npx\""* ]]
  [[ "$output" == *"\"args\":"* ]]
}

@test "add-server requires server name" {
  run agentctl add-server
  
  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage"* ]]
}

@test "add-server requires command for stdio" {
  run agentctl add-server test-server
  
  [ "$status" -eq 1 ]
}

@test "add-server requires URL for HTTP" {
  run agentctl add-server test-server --http
  
  [ "$status" -eq 1 ]
}

@test "add-server can overwrite existing server" {
  agentctl add-server my-server npx -y first-mcp
  agentctl add-server my-server npx -y second-mcp
  
  run cat "$AGENTS_DIR/mcp-config.json"
  [[ "$output" == *"second-mcp"* ]]
}

@test "add-server shows sync reminder" {
  run agentctl add-server my-server npx -y my-mcp
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"Run 'vakt sync'"* ]]
}

@test "add-server fails before init" {
  rm -rf "$AGENTS_DIR"
  
  run agentctl add-server my-server npx -y my-mcp
  
  [ "$status" -eq 1 ]
  [[ "$output" == *"Run 'vakt init' first"* ]]
}

@test "add-server handles server name with hyphens" {
  run agentctl add-server my-test-server npx -y test-mcp
  
  [ "$status" -eq 0 ]
  assert_json_key_exists "$AGENTS_DIR/mcp-config.json" "my-test-server"
}

@test "add-server handles server name with underscores" {
  run agentctl add-server my_test_server npx -y test-mcp
  
  [ "$status" -eq 0 ]
  assert_json_key_exists "$AGENTS_DIR/mcp-config.json" "my_test_server"
}

@test "add-server HTTP stores transport and url" {
  agentctl add-server http-server --http https://api.example.com/mcp
  
  run cat "$AGENTS_DIR/mcp-config.json"
  [[ "$output" == *"\"transport\": \"http\""* ]]
  [[ "$output" == *"\"url\": \"https://api.example.com/mcp\""* ]]
}
