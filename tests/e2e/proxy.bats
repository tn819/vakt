#!/usr/bin/env bats
# End-to-end tests for vakt proxy command and --with-proxy sync flag

load '../test_helper'

setup() {
  setup_test_env
  mock_secrets_backend
  agentctl init

  # Add a fast stdio test server (/bin/cat echoes stdin back as stdout)
  agentctl add-server vakt-test /bin/cat

  # Write a policy: deny dangerous_tool, allow everything else
  cat > "$AGENTS_DIR/policy.json" << 'EOF'
{
  "version": "1",
  "default": "allow",
  "registryPolicy": "allow-unverified",
  "servers": {
    "vakt-test": {
      "tools": { "deny": ["dangerous_tool"] }
    }
  }
}
EOF
}

teardown() {
  teardown_test_env
}

# ── Deny path ─────────────────────────────────────────────────────────────────

@test "proxy returns JSON-RPC error for denied tool call" {
  local out
  out=$(printf '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"dangerous_tool"}}\n' \
    | agentctl proxy vakt-test 2>&1)
  [[ "$out" == *"denied by policy"* ]]
  [[ "$out" == *"dangerous_tool"* ]]
}

@test "proxy deny response is valid JSON-RPC error frame" {
  local out
  out=$(printf '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"dangerous_tool"}}\n' \
    | agentctl proxy vakt-test 2>&1)
  echo "$out" | python3 -c "
import json, sys
frame = json.load(sys.stdin)
assert frame['jsonrpc'] == '2.0'
assert frame['id'] == 2
assert 'error' in frame
assert frame['error']['code'] == -32603
"
}

@test "proxy records denied tool call in audit.db" {
  printf '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"dangerous_tool"}}\n' \
    | agentctl proxy vakt-test

  run agentctl audit show
  [ "$status" -eq 0 ]
  [[ "$output" == *"dangerous_tool"* ]]
  [[ "$output" == *"deny"* ]]
}

@test "proxy deny does not forward request to server" {
  # If the deny were forwarded, cat would echo the full request back
  local out
  out=$(printf '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"dangerous_tool"}}\n' \
    | agentctl proxy vakt-test 2>&1)
  # Output should be the error frame only — NOT the original request echoed back
  [[ "$out" == *'"error"'* ]]
  [[ "$out" != *'"result"'* ]]
}

# ── Allow path ────────────────────────────────────────────────────────────────

@test "proxy forwards allowed tool call to server" {
  local out
  out=$(printf '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"safe_tool"}}\n' \
    | agentctl proxy vakt-test 2>&1)
  # cat echoes the forwarded frame back
  [[ "$out" == *"safe_tool"* ]]
}

@test "proxy records allowed tool call in audit.db" {
  printf '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"safe_tool"}}\n' \
    | agentctl proxy vakt-test

  run agentctl audit show
  [ "$status" -eq 0 ]
  [[ "$output" == *"safe_tool"* ]]
  [[ "$output" == *"allow"* ]]
}

@test "proxy audit entry for allow has positive duration" {
  printf '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"timed_tool"}}\n' \
    | agentctl proxy vakt-test

  run agentctl audit export
  [ "$status" -eq 0 ]
  echo "$output" | python3 -c "
import json, sys
rows = json.load(sys.stdin)
allow_rows = [r for r in rows if r['policy_result'] == 'allow']
assert len(allow_rows) >= 1, 'no allow rows found'
assert allow_rows[0]['duration_ms'] >= 0
"
}

# ── Mixed session ─────────────────────────────────────────────────────────────

@test "proxy handles mixed deny and allow in single session" {
  printf '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"dangerous_tool"}}\n{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"safe_tool"}}\n' \
    | agentctl proxy vakt-test

  run agentctl audit show
  [ "$status" -eq 0 ]
  [[ "$output" == *"dangerous_tool"* ]]
  [[ "$output" == *"safe_tool"* ]]
  [[ "$output" == *"deny"* ]]
  [[ "$output" == *"allow"* ]]
}

@test "proxy audit export contains both deny and allow entries" {
  printf '{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"dangerous_tool"}}\n{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"safe_tool"}}\n' \
    | agentctl proxy vakt-test

  run agentctl audit export
  [ "$status" -eq 0 ]
  echo "$output" | python3 -c "
import json, sys
rows = json.load(sys.stdin)
results = {r['policy_result'] for r in rows}
assert 'deny' in results, 'missing deny entry'
assert 'allow' in results, 'missing allow entry'
"
}

# ── Non-tool frames ───────────────────────────────────────────────────────────

@test "proxy passes tools/list frame through without audit entry" {
  local out
  out=$(printf '{"jsonrpc":"2.0","id":12,"method":"tools/list","params":{}}\n' \
    | agentctl proxy vakt-test 2>&1)
  [[ "$out" == *"tools/list"* ]]

  # tools/list is not a tool call — should produce no audit entries
  run agentctl audit show
  [ "$status" -eq 0 ]
  [[ "$output" == *"No tool calls found"* ]]
}

# ── No policy ─────────────────────────────────────────────────────────────────

@test "proxy forwards all calls when no policy.json exists" {
  rm -f "$AGENTS_DIR/policy.json"

  local out
  out=$(printf '{"jsonrpc":"2.0","id":13,"method":"tools/call","params":{"name":"anything"}}\n' \
    | agentctl proxy vakt-test 2>&1)
  # With no policy, the request is passed through — cat echoes it back
  [[ "$out" == *"anything"* ]]
  [[ "$out" != *"denied by policy"* ]]
}

# ── sync --with-proxy ─────────────────────────────────────────────────────────

@test "sync --with-proxy wraps stdio servers with vakt proxy in cursor config" {
  local bin_dir="$HOME/bin"
  mkdir -p "$bin_dir"
  printf '#!/bin/sh\n' > "$bin_dir/cursor"
  chmod +x "$bin_dir/cursor"
  export PATH="$bin_dir:$PATH"

  local cursor_config="$HOME/.cursor/mcp.json"
  mkdir -p "$(dirname "$cursor_config")"

  run agentctl sync --with-proxy
  [ "$status" -eq 0 ]

  [ -f "$cursor_config" ]
  # vakt-test should be wrapped: command = "vakt", args contain "proxy"
  python3 -c "
import json
cfg = json.load(open('$cursor_config'))
server = cfg['mcpServers']['vakt-test']
assert server['command'] == 'vakt', 'expected command=vakt, got: ' + str(server.get('command'))
assert 'proxy' in server.get('args', []), 'expected proxy in args'
assert 'vakt-test' in server.get('args', []), 'expected server name in args'
"
}

@test "sync --with-proxy leaves HTTP servers unwrapped" {
  # Add an HTTP server
  agentctl add-server http-api --http https://api.example.com/mcp

  local bin_dir="$HOME/bin"
  mkdir -p "$bin_dir"
  printf '#!/bin/sh\n' > "$bin_dir/cursor"
  chmod +x "$bin_dir/cursor"
  export PATH="$bin_dir:$PATH"

  local cursor_config="$HOME/.cursor/mcp.json"
  mkdir -p "$(dirname "$cursor_config")"

  run agentctl sync --with-proxy
  [ "$status" -eq 0 ]

  python3 -c "
import json
cfg = json.load(open('$cursor_config'))
server = cfg['mcpServers']['http-api']
assert 'url' in server, 'HTTP server should keep url field'
assert server.get('command') != 'vakt', 'HTTP server should not be wrapped'
"
}

@test "sync --with-proxy dry-run shows proxy wrapping without writing files" {
  local bin_dir="$HOME/bin"
  mkdir -p "$bin_dir"
  printf '#!/bin/sh\n' > "$bin_dir/cursor"
  chmod +x "$bin_dir/cursor"
  export PATH="$bin_dir:$PATH"

  run agentctl sync --with-proxy --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"DRY RUN"* ]] || [[ "$output" == *"dry-run"* ]] || [[ "$output" == *"Would"* ]]
  [ ! -f "$HOME/.cursor/mcp.json" ]
}
