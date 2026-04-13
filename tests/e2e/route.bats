#!/usr/bin/env bats
load '../test_helper'

setup() {
  setup_test_env
  mock_secrets_backend
  vakt init
}

teardown() { teardown_test_env; }

@test "route --help shows usage" {
  run vakt route --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"Start OpenAI-compatible model router proxy"* ]]
  [[ "$output" == *"--port"* ]]
  [[ "$output" == *"--test"* ]]
}

@test "route --test requires modelRouter config" {
  run vakt route --test
  [ "$status" -eq 1 ]
  [[ "$output" == *"not configured"* ]]
}

@test "route --test with config shows routing decision" {
  # Create config with modelRouter
  cat > "$AGENTS_DIR/config.json" << 'EOF'
{
  "modelRouter": {
    "port": 4000,
    "backends": {
      "local": { "url": "http://localhost:8000" },
      "remote": { "url": "https://api.example.com" }
    },
    "rules": [
      { "if": { "promptTokens": { "gt": 1000 } }, "use": "remote" },
      { "use": "local" }
    ]
  }
}
EOF
  
  run vakt route --test --tokens 500
  [ "$status" -eq 0 ]
  [[ "$output" == *"Routed to:"* ]] || [[ "$output" == *"local"* ]]
}

@test "route --test respects token threshold" {
  cat > "$AGENTS_DIR/config.json" << 'EOF'
{
  "modelRouter": {
    "port": 4000,
    "backends": {
      "local": { "url": "http://localhost:8000" },
      "remote": { "url": "https://api.example.com" }
    },
    "rules": [
      { "if": { "promptTokens": { "gt": 1000 } }, "use": "remote" },
      { "use": "local" }
    ]
  }
}
EOF
  
  run vakt route --test --tokens 1500
  [ "$status" -eq 0 ]
  [[ "$output" == *"remote"* ]]
}

@test "route --test with --has-code flag" {
  cat > "$AGENTS_DIR/config.json" << 'EOF'
{
  "modelRouter": {
    "port": 4000,
    "backends": {
      "local": { "url": "http://localhost:8000" },
      "remote": { "url": "https://api.example.com" }
    },
    "rules": [
      { "if": { "hasCode": true }, "use": "remote" },
      { "use": "local" }
    ]
  }
}
EOF
  
  run vakt route --test --has-code
  [ "$status" -eq 0 ]
  [[ "$output" == *"remote"* ]]
}

@test "route --test displays all signals" {
  cat > "$AGENTS_DIR/config.json" << 'EOF'
{
  "modelRouter": {
    "port": 4000,
    "backends": {
      "local": { "url": "http://localhost:8000" }
    },
    "rules": [{ "use": "local" }]
  }
}
EOF
  
  run vakt route --test --tokens 1000 --tools 5 --has-code --has-math
  [ "$status" -eq 0 ]
  [[ "$output" == *"promptTokens: 1000"* ]]
  [[ "$output" == *"toolCount: 5"* ]]
  [[ "$output" == *"hasCode: true"* ]]
  [[ "$output" == *"hasMath: true"* ]]
}
