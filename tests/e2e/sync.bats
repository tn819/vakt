#!/usr/bin/env bats
# End-to-end tests for agentctl sync command

load '../test_helper'

setup() {
  setup_test_env
  mock_secrets_backend
  agentctl init
}

teardown() {
  teardown_test_env
}

@test "sync runs without errors" {
  run agentctl sync --dry-run
  
  [ "$status" -eq 0 ]
}

@test "sync --dry-run shows what would be synced" {
  run agentctl sync --dry-run
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"DRY RUN"* ]] || [[ "$output" == *"dry-run"* ]] || [[ "$output" == *"Would"* ]]
}

@test "sync --mcp-only skips skills" {
  run agentctl sync --mcp-only --dry-run
  
  [ "$status" -eq 0 ]
}

@test "sync --skills-only skips MCP servers" {
  local skill_dir="$(mktemp -d)"
  create_test_skill "$skill_dir" "test-skill"
  agentctl add-skill "$skill_dir"
  
  run agentctl sync --skills-only --dry-run
  
  [ "$status" -eq 0 ]
  
  rm -rf "$skill_dir"
}

@test "sync resolves secret references" {
  agentctl secrets set TEST_TOKEN "secret_value_123"
  agentctl add-server test-server npx -y test-mcp
  # Manually add secret reference to config
  python3 << PYEOF
import json
with open('$AGENTS_DIR/mcp-config.json', 'r') as f:
    config = json.load(f)
config['test-server']['env'] = {'TEST_TOKEN': 'secret:TEST_TOKEN'}
with open('$AGENTS_DIR/mcp-config.json', 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')
PYEOF
  
  run agentctl sync --dry-run
  
  [ "$status" -eq 0 ]
}

@test "sync expands path variables" {
  agentctl config set paths.code "~/MyCode"
  
  run agentctl sync --dry-run
  
  [ "$status" -eq 0 ]
}

@test "sync fails before init" {
  rm -rf "$AGENTS_DIR"
  
  run agentctl sync
  
  [ "$status" -eq 1 ]
}

@test "sync handles empty skills directory" {
  run agentctl sync --dry-run
  
  [ "$status" -eq 0 ]
}

@test "sync handles multiple MCP servers" {
  agentctl add-server server1 npx -y mcp1
  agentctl add-server server2 npx -y mcp2
  agentctl add-server server3 npx -y mcp3
  
  run agentctl sync --dry-run
  
  [ "$status" -eq 0 ]
}

@test "sync handles multiple skills" {
  for i in 1 2 3; do
    local skill_dir="$(mktemp -d)"
    create_test_skill "$skill_dir" "skill-$i"
    agentctl add-skill "$skill_dir"
    rm -rf "$skill_dir"
  done
  
  run agentctl sync --dry-run
  
  [ "$status" -eq 0 ]
}

@test "sync shows progress" {
  run agentctl sync --dry-run
  
  [ "$status" -eq 0 ]
  # Should show some indication of what's happening
  [ -n "$output" ]
}

@test "sync handles missing secret gracefully" {
  # Add secret reference without setting the secret
  python3 << PYEOF
import json
with open('$AGENTS_DIR/mcp-config.json', 'r') as f:
    config = json.load(f)
config['test-server'] = {
    'command': 'npx',
    'args': ['-y', 'test-mcp'],
    'env': {'MISSING_TOKEN': 'secret:MISSING_TOKEN'}
}
with open('$AGENTS_DIR/mcp-config.json', 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')
PYEOF
  
  run agentctl sync --dry-run
  
  # Should either fail or warn, not crash
  [ "$status" -eq 0 ] || [ "$status" -eq 1 ]
}

@test "sync creates provider config directories" {
  skip "Requires write access to home directory"
  
  run agentctl sync
  
  [ "$status" -eq 0 ]
  # Would check for provider config files if not dry-run
}

@test "sync preserves existing provider configs" {
  skip "Requires testing actual provider config merging"
  
  # Create a mock provider config
  local opencode_dir
  opencode_dir=$(mock_provider_config "opencode")
  echo '{"existing": "config"}' > "$opencode_dir/opencode.json"
  
  run agentctl sync
  
  [ "$status" -eq 0 ]
  # Would verify existing config is preserved/merged
}

# ── syncMethod and configFormat separation tests ─────────────────────────────

@test "sync JSON provider writes config file (not CLI commands)" {
  # Cursor uses configFormat=json + syncMethod=file
  # Stub the cursor binary so isInstalled() returns true
  local bin_dir="$HOME/bin"
  mkdir -p "$bin_dir"
  printf '#!/bin/sh\n' > "$bin_dir/cursor"
  chmod +x "$bin_dir/cursor"
  export PATH="$bin_dir:$PATH"

  agentctl add-server test-server npx -y test-mcp

  run agentctl sync --dry-run

  [ "$status" -eq 0 ]
  # File-sync path emits "Would write <path>" for the cursor provider
  [[ "$output" == *"Would write"* ]]
  # Cursor section specifically should show "Would write", not CLI invocation
  [[ "$output" == *"Cursor"* ]] || [[ "$output" == *"cursor"* ]]
}

@test "sync CLI provider (claude) skips file write and uses CLI pathway" {
  # Claude has syncMethod=cli
  # Stub the claude binary so isInstalled() returns true
  local bin_dir="$HOME/bin"
  mkdir -p "$bin_dir"
  printf '#!/bin/sh\n' > "$bin_dir/claude"
  chmod +x "$bin_dir/claude"
  export PATH="$bin_dir:$PATH"

  agentctl add-server test-server npx -y test-mcp

  run agentctl sync --dry-run

  [ "$status" -eq 0 ]
  # CLI-sync dry-run path emits "Would run claude mcp add/remove"
  [[ "$output" == *"Would run claude mcp add/remove"* ]]
  # Must NOT emit "Would write <file path>" for a CLI-sync provider
  [[ "$output" != *"Would write $HOME/.claude"* ]]
}

@test "sync provider configFormat json writes config file to registry path" {
  # Cursor uses configFormat=json — after a real sync, the config file should exist
  local bin_dir="$HOME/bin"
  mkdir -p "$bin_dir"
  printf '#!/bin/sh\n' > "$bin_dir/cursor"
  chmod +x "$bin_dir/cursor"
  export PATH="$bin_dir:$PATH"

  local cursor_config="$HOME/.cursor/mcp.json"
  mkdir -p "$(dirname "$cursor_config")"

  agentctl add-server test-server npx -y test-mcp

  run agentctl sync

  [ "$status" -eq 0 ]
  # The config file at the registry path must now exist
  [ -f "$cursor_config" ]
  # And it must contain our server
  grep -q "test-server" "$cursor_config"
}

# ── Output format ─────────────────────────────────────────────────────────────

@test "sync writes provider JSON files with trailing newline" {
  local bin_dir="$HOME/bin"
  mkdir -p "$bin_dir"
  printf '#!/bin/sh\n' > "$bin_dir/cursor"
  chmod +x "$bin_dir/cursor"
  export PATH="$bin_dir:$PATH"

  local cursor_config="$HOME/.cursor/mcp.json"
  mkdir -p "$(dirname "$cursor_config")"

  agentctl add-server test-server npx -y test-mcp

  run agentctl sync
  [ "$status" -eq 0 ]

  [ -f "$cursor_config" ]
  # File must end with a newline character
  last_byte=$(python3 -c "
import sys
data = open('$cursor_config', 'rb').read()
sys.exit(0 if data.endswith(b'\n') else 1)
")
  [ "$?" -eq 0 ]
}

@test "sync preserves non-MCP keys in existing provider JSON file" {
  local bin_dir="$HOME/bin"
  mkdir -p "$bin_dir"
  printf '#!/bin/sh\n' > "$bin_dir/cursor"
  chmod +x "$bin_dir/cursor"
  export PATH="$bin_dir:$PATH"

  local cursor_config="$HOME/.cursor/mcp.json"
  mkdir -p "$(dirname "$cursor_config")"
  echo '{"someOtherKey": {"nested": true}, "mcpServers": {}}' > "$cursor_config"

  agentctl add-server test-server npx -y test-mcp

  run agentctl sync
  [ "$status" -eq 0 ]

  python3 -c "
import json
cfg = json.load(open('$cursor_config'))
assert 'someOtherKey' in cfg, 'non-MCP key was clobbered'
assert cfg['someOtherKey']['nested'] == True
assert 'test-server' in cfg['mcpServers']
"
}

# ── Missing secrets ───────────────────────────────────────────────────────────

@test "sync preserves secret ref string in output when secret is missing" {
  local bin_dir="$HOME/bin"
  mkdir -p "$bin_dir"
  printf '#!/bin/sh\n' > "$bin_dir/cursor"
  chmod +x "$bin_dir/cursor"
  export PATH="$bin_dir:$PATH"

  local cursor_config="$HOME/.cursor/mcp.json"
  mkdir -p "$(dirname "$cursor_config")"

  # Add server with a secret ref that has no corresponding secret set
  agentctl add-server secret-server npx -y secret-mcp
  python3 -c "
import json
with open('$AGENTS_DIR/mcp-config.json') as f:
    cfg = json.load(f)
cfg['secret-server']['env'] = {'MY_TOKEN': 'secret:UNSET_TOKEN_XYZ'}
with open('$AGENTS_DIR/mcp-config.json', 'w') as f:
    json.dump(cfg, f, indent=2)
    f.write('\n')
"

  run agentctl sync
  [ "$status" -eq 0 ]

  # The ref string should be in the output, not an empty string
  python3 -c "
import json
cfg = json.load(open('$cursor_config'))
val = cfg['mcpServers']['secret-server']['env']['MY_TOKEN']
assert val == 'secret:UNSET_TOKEN_XYZ', 'expected ref string, got: ' + repr(val)
assert val != '', 'secret ref was replaced with empty string'
"
}

@test "sync warns about missing secrets but does not fail" {
  agentctl add-server secret-server npx -y secret-mcp
  python3 -c "
import json
with open('$AGENTS_DIR/mcp-config.json') as f:
    cfg = json.load(f)
cfg['secret-server']['env'] = {'MY_TOKEN': 'secret:DEFINITELY_NOT_SET'}
with open('$AGENTS_DIR/mcp-config.json', 'w') as f:
    json.dump(cfg, f, indent=2)
    f.write('\n')
"

  run agentctl sync --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"DEFINITELY_NOT_SET"* ]]
}
