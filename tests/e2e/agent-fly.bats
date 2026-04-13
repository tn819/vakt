#!/usr/bin/env bats
# Fly.io sandbox backend — e2e tests
# Docs: docs/playbooks/sandbox-fly-io.md
#
# Live Machine tests require FLY_API_TOKEN and FLY_APP.
# Tests skip automatically without credentials.

load '../test_helper'

setup() {
  setup_test_env
  mock_secrets_backend
  vakt init
}

teardown() {
  teardown_test_env
}

# ── Configuration ─────────────────────────────────────────────────────────────

@test "runtime config: set fly api token reference" {
  run vakt config set runtime.fly.api_token secret:FLY_API_TOKEN
  [ "$status" -eq 0 ]

  run vakt config get runtime.fly.api_token
  [[ "$output" == *"FLY_API_TOKEN"* ]]
}

@test "runtime config: set fly app name" {
  run vakt config set runtime.fly.app vakt-agent-sandbox
  [ "$status" -eq 0 ]

  run vakt config get runtime.fly.app
  [ "$output" = "vakt-agent-sandbox" ]
}

@test "runtime config: set fly region" {
  run vakt config set runtime.fly.region iad
  [ "$status" -eq 0 ]

  run vakt config get runtime.fly.region
  [ "$output" = "iad" ]
}

@test "runtime config: route server to fly" {
  vakt add-server my-coder npx some-mcp-server

  run vakt runtime set my-coder fly
  [ "$status" -eq 0 ]

  run vakt runtime list
  [ "$status" -eq 0 ]
  [[ "$output" == *"my-coder"* ]]
  [[ "$output" == *"fly"* ]]
}

# ── flyctl availability check ─────────────────────────────────────────────────

@test "flyctl is installed and authenticated" {
  skip_if_missing fly

  if [[ -z "${FLY_API_TOKEN:-}" ]]; then
    skip "FLY_API_TOKEN not set"
  fi

  run fly auth whoami
  [ "$status" -eq 0 ]
}

# ── Agent lifecycle (requires Fly account) ────────────────────────────────────

@test "agent start: creates Fly Machine and returns session id" {
  if [[ -z "${FLY_API_TOKEN:-}" ]]; then
    skip "FLY_API_TOKEN not set"
  fi
  skip "vakt agent command not yet implemented — see issue #62"

  set_test_secret FLY_API_TOKEN "$FLY_API_TOKEN"
  vakt config set runtime.fly.api_token secret:FLY_API_TOKEN
  vakt config set runtime.fly.app "${FLY_APP:-vakt-agent-sandbox}"

  run vakt agent start --provider fly
  [ "$status" -eq 0 ]
  [[ "$output" == *"session"* ]] || [[ "$output" == *"machine"* ]]
}

@test "agent exec: runs command in Fly Machine" {
  if [[ -z "${FLY_API_TOKEN:-}" ]]; then skip "FLY_API_TOKEN not set"; fi
  skip "vakt agent command not yet implemented — see issue #62"

  local session_id
  session_id=$(vakt agent start --provider fly --format id)

  run vakt agent exec "$session_id" "node --version"
  [ "$status" -eq 0 ]
  [[ "$output" == v* ]]

  vakt agent destroy "$session_id"
}

@test "agent destroy: Fly Machine is stopped and removed" {
  if [[ -z "${FLY_API_TOKEN:-}" ]]; then skip "FLY_API_TOKEN not set"; fi
  skip "vakt agent command not yet implemented — see issue #62"

  local session_id
  session_id=$(vakt agent start --provider fly --format id)

  run vakt agent destroy "$session_id"
  [ "$status" -eq 0 ]
}
