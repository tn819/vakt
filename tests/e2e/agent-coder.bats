#!/usr/bin/env bats
# Coder.com sandbox backend — e2e tests
# Docs: docs/playbooks/sandbox-coder.md
#
# Live workspace tests require CODER_URL and CODER_TOKEN.
# Run a local Coder server with:
#   docker run --rm -p 7080:7080 ghcr.io/coder/coder:latest server --in-memory
#
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

@test "runtime config: set coder url reference" {
  run vakt config set runtime.coder.url secret:CODER_URL
  [ "$status" -eq 0 ]

  run vakt config get runtime.coder.url
  [[ "$output" == *"CODER_URL"* ]]
}

@test "runtime config: set coder token reference" {
  run vakt config set runtime.coder.token secret:CODER_TOKEN
  [ "$status" -eq 0 ]

  run vakt config get runtime.coder.token
  [[ "$output" == *"CODER_TOKEN"* ]]
}

@test "runtime config: set coder org" {
  run vakt config set runtime.coder.org default
  [ "$status" -eq 0 ]

  run vakt config get runtime.coder.org
  [ "$output" = "default" ]
}

@test "runtime config: set coder workspace template" {
  run vakt config set runtime.coder.template my-agent-template
  [ "$status" -eq 0 ]

  run vakt config get runtime.coder.template
  [ "$output" = "my-agent-template" ]
}

@test "runtime config: stop_after_session defaults to false" {
  run vakt config get runtime.coder.stop_after_session
  # unset → false or empty is acceptable
  [ "$status" -eq 0 ]
}

@test "runtime config: set stop_after_session true" {
  run vakt config set runtime.coder.stop_after_session true
  [ "$status" -eq 0 ]

  run vakt config get runtime.coder.stop_after_session
  [ "$output" = "true" ]
}

@test "runtime config: route server to coder" {
  vakt add-server my-coder npx some-mcp-server

  run vakt runtime set my-coder coder
  [ "$status" -eq 0 ]

  run vakt runtime list
  [ "$status" -eq 0 ]
  [[ "$output" == *"my-coder"* ]]
  [[ "$output" == *"coder"* ]]
}

# ── Coder CLI availability check ─────────────────────────────────────────────

@test "coder cli is installed" {
  skip_if_missing coder

  run coder version
  [ "$status" -eq 0 ]
}

@test "coder deployment is reachable" {
  skip_if_missing coder
  if [[ -z "${CODER_URL:-}" ]] || [[ -z "${CODER_TOKEN:-}" ]]; then
    skip "CODER_URL / CODER_TOKEN not set"
  fi

  run env CODER_URL="$CODER_URL" CODER_SESSION_TOKEN="$CODER_TOKEN" coder ping --wait 5s
  [ "$status" -eq 0 ]
}

# ── Agent lifecycle (requires Coder deployment) ───────────────────────────────

@test "agent start: creates or re-attaches Coder workspace and returns session id" {
  if [[ -z "${CODER_URL:-}" ]] || [[ -z "${CODER_TOKEN:-}" ]]; then
    skip "CODER_URL / CODER_TOKEN not set"
  fi
  skip "vakt agent command not yet implemented — see issue #62"

  set_test_secret CODER_URL   "$CODER_URL"
  set_test_secret CODER_TOKEN "$CODER_TOKEN"
  vakt config set runtime.coder.url   secret:CODER_URL
  vakt config set runtime.coder.token secret:CODER_TOKEN
  vakt config set runtime.coder.org      default
  vakt config set runtime.coder.template "${CODER_TEMPLATE:-docker-workspace}"

  run vakt agent start --provider coder
  [ "$status" -eq 0 ]
  [[ "$output" == *"session"* ]] || [[ "$output" == *"workspace"* ]]
}

@test "agent start: re-attaches existing stopped workspace (idempotent)" {
  if [[ -z "${CODER_URL:-}" ]] || [[ -z "${CODER_TOKEN:-}" ]]; then
    skip "CODER_URL / CODER_TOKEN not set"
  fi
  skip "vakt agent command not yet implemented — see issue #62"

  # Start, stop, start again — should re-attach, not create a second workspace
  local session1 session2
  session1=$(vakt agent start --provider coder --name test-idempotent --format id)
  vakt agent destroy --stop-only "$session1"   # stop, don't delete
  session2=$(vakt agent start --provider coder --name test-idempotent --format id)

  # Both sessions should reference the same underlying workspace
  [ "$session1" = "$session2" ]
  vakt agent destroy "$session2"
}

@test "agent exec: runs command in Coder workspace" {
  if [[ -z "${CODER_URL:-}" ]] || [[ -z "${CODER_TOKEN:-}" ]]; then
    skip "CODER_URL / CODER_TOKEN not set"
  fi
  skip "vakt agent command not yet implemented — see issue #62"

  local session_id
  session_id=$(vakt agent start --provider coder --format id)

  run vakt agent exec "$session_id" "node --version"
  [ "$status" -eq 0 ]
  [[ "$output" == v* ]]

  vakt agent destroy "$session_id"
}

@test "agent exec: workspace state persists across exec calls" {
  if [[ -z "${CODER_URL:-}" ]] || [[ -z "${CODER_TOKEN:-}" ]]; then
    skip "CODER_URL / CODER_TOKEN not set"
  fi
  skip "vakt agent command not yet implemented — see issue #62"

  local session_id
  session_id=$(vakt agent start --provider coder --format id)

  # Write a file in one exec, read it back in the next — state must persist
  vakt agent exec "$session_id" "sh -c 'echo vakt-persist > /tmp/state.txt'"

  run vakt agent exec "$session_id" "cat /tmp/state.txt"
  [ "$status" -eq 0 ]
  [[ "$output" == *"vakt-persist"* ]]

  vakt agent destroy "$session_id"
}

@test "agent destroy --stop-only: workspace is stopped but not deleted" {
  if [[ -z "${CODER_URL:-}" ]] || [[ -z "${CODER_TOKEN:-}" ]]; then
    skip "CODER_URL / CODER_TOKEN not set"
  fi
  skip "vakt agent command not yet implemented — see issue #62"

  local session_id
  session_id=$(vakt agent start --provider coder --format id)

  run vakt agent destroy --stop-only "$session_id"
  [ "$status" -eq 0 ]

  # Workspace should still exist in stopped state
  run env CODER_URL="$CODER_URL" CODER_SESSION_TOKEN="$CODER_TOKEN" \
    coder show "$session_id" --output json
  [ "$status" -eq 0 ]
  [[ "$output" == *"stopped"* ]]
}

@test "agent destroy: workspace is fully deleted" {
  if [[ -z "${CODER_URL:-}" ]] || [[ -z "${CODER_TOKEN:-}" ]]; then
    skip "CODER_URL / CODER_TOKEN not set"
  fi
  skip "vakt agent command not yet implemented — see issue #62"

  local session_id
  session_id=$(vakt agent start --provider coder --format id)

  run vakt agent destroy "$session_id"
  [ "$status" -eq 0 ]

  # Workspace should no longer exist
  run env CODER_URL="$CODER_URL" CODER_SESSION_TOKEN="$CODER_TOKEN" \
    coder show "$session_id" 2>&1
  [ "$status" -ne 0 ]
}

@test "agent audit: Coder tool calls recorded in audit.db" {
  if [[ -z "${CODER_URL:-}" ]] || [[ -z "${CODER_TOKEN:-}" ]]; then
    skip "CODER_URL / CODER_TOKEN not set"
  fi
  skip "vakt agent command not yet implemented — see issue #62"

  local session_id
  session_id=$(vakt agent start --provider coder --format id)
  vakt agent exec "$session_id" "echo audit-test"

  run vakt audit show
  [ "$status" -eq 0 ]
  [[ "$output" == *"coder"* ]]

  vakt agent destroy "$session_id"
}
