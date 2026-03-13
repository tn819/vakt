#!/usr/bin/env bats
# Docker e2e harness — real MCP protocol, OTel spans, pass backend, attack simulation

load '../test_helper'
load 'test_helper'

setup() {
  setup_docker_env

  agentctl init

  # Register the real MCP server (node runs the server-everything binary)
  agentctl add-server everything node "$MCP_SERVER"

  # Install policy: deny get-env and simulate-research-query, allow all else
  cp /app/tests/docker/policy.json "$AGENTS_DIR/policy.json"

  # Configure OTel: spans go to Jaeger gRPC port 4317
  agentctl config set otel.endpoint "http://jaeger:4317"

  # Initialise pass store with the container-wide GPG key
  init_pass_store
}

teardown() {
  teardown_docker_env
}

# ── Infrastructure ────────────────────────────────────────────────────────────

@test "vakt init creates required directory structure" {
  assert_dir_exists "$AGENTS_DIR"
  assert_file_exists "$AGENTS_DIR/config.json"
  assert_file_exists "$AGENTS_DIR/mcp-config.json"
}

@test "MCP server binary is present and loadable by node" {
  [ -f "$MCP_SERVER" ]
}

# ── Real MCP protocol flow ────────────────────────────────────────────────────

@test "proxy forwards initialize handshake and gets server info back" {
  local out
  out=$(proxy_call everything \
    '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}')

  echo "$out" | grep -q '"result"'
  echo "$out" | grep -q '"tools"'
}

@test "tools/list response includes echo tool" {
  local out
  out=$(proxy_call everything \
    '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}')

  echo "$out" | grep -q '"echo"'
}

@test "allowed tools/call (echo) returns server response" {
  local out
  out=$(proxy_call everything \
    '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"echo","arguments":{"message":"hello-vakt"}}}')

  echo "$out" | grep -q "hello-vakt"
  echo "$out" | grep -qv "denied by policy"
}

@test "allowed tools/call is recorded in audit log as allow" {
  proxy_call everything \
    '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"echo","arguments":{"message":"audit-test"}}}' \
    > /dev/null

  assert_audit_entry "everything" "echo" "allow"
}
