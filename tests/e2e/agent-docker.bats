#!/usr/bin/env bats
# Docker sandbox backend — e2e tests (local development / CI)
# Docs: docs/playbooks/sandbox-docker.md
#
# NOTE: These tests REQUIRE Docker to be running. They will FAIL (not skip)
# if Docker is unavailable. This is intentional to ensure CI properly tests
# the Docker sandbox functionality.

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

@test "runtime config: set docker as default backend" {
  run vakt config set runtime.default docker
  [ "$status" -eq 0 ]

  run vakt config get runtime.default
  [ "$output" = "docker" ]
}

@test "runtime config: set docker socket path" {
  run vakt config set runtime.docker.socket /var/run/docker.sock
  [ "$status" -eq 0 ]

  run vakt config get runtime.docker.socket
  [ "$output" = "/var/run/docker.sock" ]
}

@test "runtime config: set docker image" {
  run vakt config set runtime.docker.image node:20-slim
  [ "$status" -eq 0 ]

  run vakt config get runtime.docker.image
  [ "$output" = "node:20-slim" ]
}

@test "runtime config: set memory limit" {
  run vakt config set runtime.docker.memory 512m
  [ "$status" -eq 0 ]

  run vakt config get runtime.docker.memory
  [ "$output" = "512m" ]
}

@test "runtime config: route specific server to docker" {
  vakt add-server my-coder npx some-mcp-server

  run vakt runtime set my-coder docker
  [ "$status" -eq 0 ]

  run vakt runtime list
  [ "$status" -eq 0 ]
  [[ "$output" == *"my-coder"* ]]
  [[ "$output" == *"docker"* ]]
}

# ── Docker availability check ─────────────────────────────────────────────────

@test "docker daemon is accessible" {
  run docker info
  [ "$status" -eq 0 ]
}

# ── Agent lifecycle (requires Docker) ────────────────────────────────────────

@test "agent start: creates Docker container and returns session id" {
  run vakt agent start --provider docker
  [ "$status" -eq 0 ]
  [[ "$output" == *"session"* ]] || [[ "$output" == *"container"* ]]
}

@test "agent exec: runs command in Docker container" {
  local session_id
  session_id=$(vakt agent start --provider docker --format id)

  run vakt agent exec "$session_id" "node --version"
  [ "$status" -eq 0 ]
  [[ "$output" == v* ]]

  vakt agent destroy "$session_id"
}

@test "agent write-file: writes file into container workspace" {
  local session_id
  session_id=$(vakt agent start --provider docker --format id)

  vakt agent write-file "$session_id" /workspace/hello.txt "hello from vakt"

  run vakt agent exec "$session_id" "cat /workspace/hello.txt"
  [ "$status" -eq 0 ]
  [[ "$output" == *"hello from vakt"* ]]

  vakt agent destroy "$session_id"
}

@test "agent read-file: reads file from container workspace" {
  local session_id
  session_id=$(vakt agent start --provider docker --format id)
  vakt agent exec "$session_id" "sh -c 'echo vakt-content > /workspace/out.txt'"

  run vakt agent read-file "$session_id" /workspace/out.txt
  [ "$status" -eq 0 ]
  [[ "$output" == *"vakt-content"* ]]

  vakt agent destroy "$session_id"
}

@test "agent audit: Docker tool calls recorded in audit.db" {
  local session_id
  session_id=$(vakt agent start --provider docker --format id)
  vakt agent exec "$session_id" "echo audit-test"

  run vakt audit show
  [ "$status" -eq 0 ]
  [[ "$output" == *"docker"* ]]

  vakt agent destroy "$session_id"
}

@test "agent destroy: container is removed after session ends" {
  local session_id
  session_id=$(vakt agent start --provider docker --format id)

  run vakt agent destroy "$session_id"
  [ "$status" -eq 0 ]

  # Container should no longer exist
  run docker inspect "$session_id" 2>&1
  [ "$status" -ne 0 ]
}

@test "agent: container network is isolated by default" {
  local session_id
  session_id=$(vakt agent start --provider docker --format id)

  # Default network=none — outbound should fail (curl may not exist = 127, or network unreachable)
  run -127 vakt agent exec "$session_id" "curl --max-time 2 https://example.com"
  [ "$status" -ne 0 ]

  vakt agent destroy "$session_id"
}
