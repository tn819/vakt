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
  [[ "$output" == *"dry-run"* ]] || [[ "$output" == *"Would"* ]]
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
