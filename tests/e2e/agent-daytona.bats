#!/usr/bin/env bats
# Daytona sandbox backend — e2e tests
# Docs: docs/playbooks/sandbox-daytona.md
#
# Live workspace tests require DAYTONA_API_URL and DAYTONA_API_KEY.
# Without credentials all live tests are skipped.

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

@test "runtime config: set daytona api url" {
  run vakt config set runtime.daytona.api_url https://app.daytona.io/api
  [ "$status" -eq 0 ]

  run vakt config get runtime.daytona.api_url
  [ "$output" = "https://app.daytona.io/api" ]
}

@test "runtime config: set daytona api key reference" {
  run vakt config set runtime.daytona.api_key secret:DAYTONA_API_KEY
  [ "$status" -eq 0 ]

  run vakt config get runtime.daytona.api_key
  [[ "$output" == *"DAYTONA_API_KEY"* ]]
}

@test "runtime config: set daytona workspace image" {
  run vakt config set runtime.daytona.image daytonaio/workspace-project:latest
  [ "$status" -eq 0 ]

  run vakt config get runtime.daytona.image
  [ "$output" = "daytonaio/workspace-project:latest" ]
}

@test "runtime config: route server to daytona" {
  vakt add-server my-coder npx some-mcp-server

  run vakt runtime set my-coder daytona
  [ "$status" -eq 0 ]

  run vakt runtime list
  [ "$status" -eq 0 ]
  [[ "$output" == *"my-coder"* ]]
  [[ "$output" == *"daytona"* ]]
}

# ── Self-hosted availability check ───────────────────────────────────────────

@test "daytona api is reachable (self-hosted)" {
  if [[ -z "${DAYTONA_API_URL:-}" ]] || [[ -z "${DAYTONA_API_KEY:-}" ]]; then
    skip "DAYTONA_API_URL / DAYTONA_API_KEY not set"
  fi
  skip_if_missing curl

  run curl -sf -H "Authorization: Bearer ${DAYTONA_API_KEY}" \
    "${DAYTONA_API_URL}/health"
  [ "$status" -eq 0 ]
}

# ── Agent lifecycle (requires Daytona) ───────────────────────────────────────

@test "agent start: creates Daytona workspace and returns session id" {
  if [[ -z "${DAYTONA_API_URL:-}" ]] || [[ -z "${DAYTONA_API_KEY:-}" ]]; then
    skip "DAYTONA_API_URL / DAYTONA_API_KEY not set"
  fi
  skip "vakt agent command not yet implemented — see issue #62"

  set_test_secret DAYTONA_API_KEY "$DAYTONA_API_KEY"
  vakt config set runtime.daytona.api_url "$DAYTONA_API_URL"
  vakt config set runtime.daytona.api_key secret:DAYTONA_API_KEY

  run vakt agent start --provider daytona
  [ "$status" -eq 0 ]
  [[ "$output" == *"session"* ]] || [[ "$output" == *"workspace"* ]]
}

@test "agent exec: runs command in Daytona workspace" {
  if [[ -z "${DAYTONA_API_URL:-}" ]] || [[ -z "${DAYTONA_API_KEY:-}" ]]; then
    skip "DAYTONA_API_URL / DAYTONA_API_KEY not set"
  fi
  skip "vakt agent command not yet implemented — see issue #62"

  local session_id
  session_id=$(vakt agent start --provider daytona --format id)

  run vakt agent exec "$session_id" "node --version"
  [ "$status" -eq 0 ]
  [[ "$output" == v* ]]

  vakt agent destroy "$session_id"
}

@test "agent destroy: Daytona workspace is removed after session ends" {
  if [[ -z "${DAYTONA_API_URL:-}" ]] || [[ -z "${DAYTONA_API_KEY:-}" ]]; then
    skip "DAYTONA_API_URL / DAYTONA_API_KEY not set"
  fi
  skip "vakt agent command not yet implemented — see issue #62"

  local session_id
  session_id=$(vakt agent start --provider daytona --format id)

  run vakt agent destroy "$session_id"
  [ "$status" -eq 0 ]
}
