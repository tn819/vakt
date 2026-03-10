#!/usr/bin/env bats
# End-to-end tests for agentctl import-from-everywhere command

load '../test_helper'

setup() {
  setup_test_env
  mock_secrets_backend
  agentctl init
}

teardown() {
  teardown_test_env
}

# ── MCP server import ────────────────────────────────────────────────────────

@test "import-from-everywhere exits 0 with no providers present" {
  run agentctl import-from-everywhere

  [ "$status" -eq 0 ]
}

@test "import-from-everywhere reports nothing new when no providers present" {
  run agentctl import-from-everywhere

  [ "$status" -eq 0 ]
  [[ "$output" == *"nothing new to import"* ]]
}

@test "import-from-everywhere imports MCP servers from cursor config" {
  local cursor_dir
  cursor_dir="$(mock_provider_config cursor)"

  cat > "$cursor_dir/mcp.json" << 'JSON'
{
  "mcpServers": {
    "browser-tools": {
      "command": "npx",
      "args": ["-y", "@agentdeskai/browser-tools-mcp"]
    }
  }
}
JSON

  run agentctl import-from-everywhere

  [ "$status" -eq 0 ]
  [[ "$output" == *"browser-tools"* ]]
  assert_json_key_exists "$AGENTS_DIR/mcp-config.json" "browser-tools"
}

@test "import-from-everywhere imports HTTP MCP servers from claude config" {
  cat > "$HOME/.claude.json" << 'JSON'
{
  "mcpServers": {
    "my-http-server": {
      "type": "http",
      "url": "https://example.com/mcp"
    }
  }
}
JSON

  run agentctl import-from-everywhere

  [ "$status" -eq 0 ]
  [[ "$output" == *"my-http-server"* ]]
  assert_json_key_exists "$AGENTS_DIR/mcp-config.json" "my-http-server"
}

@test "import-from-everywhere imports stdio MCP servers from claude dir config" {
  mkdir -p "$HOME/.claude"
  cat > "$HOME/.claude/claude.json" << 'JSON'
{
  "mcpServers": {
    "my-stdio-server": {
      "command": "uv",
      "args": ["run", "python", "-m", "myserver"]
    }
  }
}
JSON

  run agentctl import-from-everywhere

  [ "$status" -eq 0 ]
  [[ "$output" == *"my-stdio-server"* ]]
  assert_json_key_exists "$AGENTS_DIR/mcp-config.json" "my-stdio-server"
}

@test "import-from-everywhere imports from multiple providers in one run" {
  local cursor_dir
  cursor_dir="$(mock_provider_config cursor)"
  cat > "$cursor_dir/mcp.json" << 'JSON'
{
  "mcpServers": {
    "cursor-server": {"command": "npx", "args": ["-y", "cursor-mcp"]}
  }
}
JSON

  cat > "$HOME/.claude.json" << 'JSON'
{
  "mcpServers": {
    "claude-server": {"type": "http", "url": "https://example.com/mcp"}
  }
}
JSON

  run agentctl import-from-everywhere

  [ "$status" -eq 0 ]
  assert_json_key_exists "$AGENTS_DIR/mcp-config.json" "cursor-server"
  assert_json_key_exists "$AGENTS_DIR/mcp-config.json" "claude-server"
}

@test "import-from-everywhere does not overwrite existing servers" {
  # Pre-populate mcp-config with a server
  python3 << PYEOF
import json
with open('$AGENTS_DIR/mcp-config.json') as f:
    config = json.load(f)
config['existing-server'] = {'command': 'original', 'args': []}
with open('$AGENTS_DIR/mcp-config.json', 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')
PYEOF

  local cursor_dir
  cursor_dir="$(mock_provider_config cursor)"
  cat > "$cursor_dir/mcp.json" << 'JSON'
{
  "mcpServers": {
    "existing-server": {"command": "override-attempt", "args": []}
  }
}
JSON

  agentctl import-from-everywhere

  # Original value must be preserved
  assert_json_equals "$AGENTS_DIR/mcp-config.json" "['existing-server']['command']" "original"
}

@test "import-from-everywhere is idempotent" {
  local cursor_dir
  cursor_dir="$(mock_provider_config cursor)"
  cat > "$cursor_dir/mcp.json" << 'JSON'
{
  "mcpServers": {
    "idempotent-server": {"command": "npx", "args": ["-y", "some-mcp"]}
  }
}
JSON

  agentctl import-from-everywhere
  run agentctl import-from-everywhere

  [ "$status" -eq 0 ]
  [[ "$output" == *"nothing new to import"* ]]
  assert_json_key_exists "$AGENTS_DIR/mcp-config.json" "idempotent-server"
}

# ── Skills import ────────────────────────────────────────────────────────────

@test "import-from-everywhere imports skills from cursor skills dir" {
  local cursor_dir
  cursor_dir="$(mock_provider_config cursor)"
  local skill_dir="$cursor_dir/skills/my-skill"
  mkdir -p "$skill_dir"
  create_test_skill "$skill_dir" "my-skill"

  run agentctl import-from-everywhere

  [ "$status" -eq 0 ]
  [[ "$output" == *"my-skill"* ]]
  assert_dir_exists "$AGENTS_DIR/skills/my-skill"
  [ -L "$AGENTS_DIR/skills/my-skill" ]
}

@test "import-from-everywhere skips skills already present" {
  local cursor_dir
  cursor_dir="$(mock_provider_config cursor)"
  local skill_dir="$cursor_dir/skills/existing-skill"
  mkdir -p "$skill_dir"
  create_test_skill "$skill_dir" "existing-skill"

  agentctl import-from-everywhere
  run agentctl import-from-everywhere

  [ "$status" -eq 0 ]
  # Should not error on already-linked skill
  assert_dir_exists "$AGENTS_DIR/skills/existing-skill"
}

@test "import-from-everywhere does not circular-link gemini native skills dir" {
  # Gemini reads ~/.agents/skills natively — import must not link it to itself
  run agentctl import-from-everywhere

  [ "$status" -eq 0 ]
  # No symlink pointing back to itself should exist
  [ ! -L "$AGENTS_DIR/skills/skills" ]
}

# ── Summary output ───────────────────────────────────────────────────────────

@test "import-from-everywhere reports count of imported servers" {
  local cursor_dir
  cursor_dir="$(mock_provider_config cursor)"
  cat > "$cursor_dir/mcp.json" << 'JSON'
{
  "mcpServers": {
    "server-a": {"command": "npx", "args": []},
    "server-b": {"command": "npx", "args": []}
  }
}
JSON

  run agentctl import-from-everywhere

  [ "$status" -eq 0 ]
  [[ "$output" == *"2 server(s)"* ]]
}
