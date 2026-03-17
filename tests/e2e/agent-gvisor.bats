#!/usr/bin/env bats
# gVisor sandbox backend — e2e tests
# Docs: docs/playbooks/sandbox-gvisor.md
#
# Three sub-modes:
#   1. docker/runsc (Linux only) — requires runsc installed and Docker configured
#   2. GKE (kubernetes) — requires kubectl + gke-sandbox RuntimeClass
#   3. Cloud Run — requires GOOGLE_APPLICATION_CREDENTIALS + GCP_PROJECT
#
# Tests skip automatically when the required environment is not available.

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

@test "runtime config: set gvisor backend to docker/runsc" {
  run vakt config set runtime.gvisor.backend docker
  [ "$status" -eq 0 ]

  run vakt config get runtime.gvisor.backend
  [ "$output" = "docker" ]
}

@test "runtime config: set gvisor runtime class" {
  run vakt config set runtime.gvisor.runtime_class runsc
  [ "$status" -eq 0 ]

  run vakt config get runtime.gvisor.runtime_class
  [ "$output" = "runsc" ]
}

@test "runtime config: set gvisor cloud run project" {
  run vakt config set runtime.gvisor.project my-gcp-project
  [ "$status" -eq 0 ]

  run vakt config get runtime.gvisor.project
  [ "$output" = "my-gcp-project" ]
}

@test "runtime config: route server to gvisor" {
  vakt add-server trusted-coder npx some-mcp-server

  run vakt runtime set trusted-coder gvisor
  [ "$status" -eq 0 ]

  run vakt runtime list
  [ "$status" -eq 0 ]
  [[ "$output" == *"trusted-coder"* ]]
  [[ "$output" == *"gvisor"* ]]
}

# ── runsc availability check (Linux/Docker sub-mode) ─────────────────────────

@test "runsc binary is installed" {
  skip_if_missing runsc

  run runsc --version
  [ "$status" -eq 0 ]
}

@test "docker is configured to use runsc runtime" {
  skip_if_missing docker
  skip_if_missing runsc

  run docker run --runtime=runsc --rm hello-world
  if [ "$status" -ne 0 ]; then
    skip "Docker not configured for runsc runtime"
  fi
  [ "$status" -eq 0 ]
}

# ── Agent lifecycle — Docker/runsc sub-mode ───────────────────────────────────

@test "agent start: creates gVisor (runsc) container and returns session id" {
  skip_if_missing docker
  skip_if_missing runsc
  skip "vakt agent command not yet implemented — see issue #62"

  vakt config set runtime.gvisor.backend docker
  vakt config set runtime.gvisor.runtime_class runsc

  run vakt agent start --provider gvisor
  [ "$status" -eq 0 ]
  [[ "$output" == *"session"* ]]
}

@test "agent exec: runs command in gVisor container" {
  skip_if_missing docker
  skip_if_missing runsc
  skip "vakt agent command not yet implemented — see issue #62"

  vakt config set runtime.gvisor.backend docker
  vakt config set runtime.gvisor.runtime_class runsc
  local session_id
  session_id=$(vakt agent start --provider gvisor --format id)

  run vakt agent exec "$session_id" "node --version"
  [ "$status" -eq 0 ]
  [[ "$output" == v* ]]

  vakt agent destroy "$session_id"
}

# ── Agent lifecycle — Cloud Run sub-mode ─────────────────────────────────────

@test "agent start: deploys Cloud Run job and returns session id" {
  if [[ -z "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]] || [[ -z "${GCP_PROJECT:-}" ]]; then
    skip "GOOGLE_APPLICATION_CREDENTIALS / GCP_PROJECT not set"
  fi
  skip "vakt agent command not yet implemented — see issue #62"

  vakt config set runtime.gvisor.backend cloud-run
  vakt config set runtime.gvisor.project "$GCP_PROJECT"

  run vakt agent start --provider gvisor
  [ "$status" -eq 0 ]
  [[ "$output" == *"session"* ]]
}

@test "agent destroy: gVisor session cleaned up after use" {
  skip_if_missing docker
  skip_if_missing runsc
  skip "vakt agent command not yet implemented — see issue #62"

  vakt config set runtime.gvisor.backend docker
  vakt config set runtime.gvisor.runtime_class runsc
  local session_id
  session_id=$(vakt agent start --provider gvisor --format id)

  run vakt agent destroy "$session_id"
  [ "$status" -eq 0 ]
}
