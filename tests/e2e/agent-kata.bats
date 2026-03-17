#!/usr/bin/env bats
# Kata Containers backend — e2e tests
# Docs: docs/playbooks/sandbox-kata-containers.md
#
# Tests require kubectl access to a cluster with the kata-qemu RuntimeClass.
# All live tests skip automatically without a valid kubeconfig.

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

@test "runtime config: set kata kubeconfig path" {
  run vakt config set runtime.kata.kubeconfig ~/.kube/config
  [ "$status" -eq 0 ]

  run vakt config get runtime.kata.kubeconfig
  [[ "$output" == *".kube/config"* ]]
}

@test "runtime config: set kata namespace" {
  run vakt config set runtime.kata.namespace vakt-agents
  [ "$status" -eq 0 ]

  run vakt config get runtime.kata.namespace
  [ "$output" = "vakt-agents" ]
}

@test "runtime config: set kata runtime class" {
  run vakt config set runtime.kata.runtime_class kata-qemu
  [ "$status" -eq 0 ]

  run vakt config get runtime.kata.runtime_class
  [ "$output" = "kata-qemu" ]
}

@test "runtime config: route server to kata" {
  vakt add-server secure-coder npx some-mcp-server

  run vakt runtime set secure-coder kata
  [ "$status" -eq 0 ]

  run vakt runtime list
  [ "$status" -eq 0 ]
  [[ "$output" == *"secure-coder"* ]]
  [[ "$output" == *"kata"* ]]
}

# ── Cluster availability check ────────────────────────────────────────────────

@test "kubectl can reach cluster" {
  skip_if_missing kubectl

  run kubectl cluster-info
  [ "$status" -eq 0 ]
}

@test "kata-qemu RuntimeClass exists in cluster" {
  skip_if_missing kubectl

  run kubectl get runtimeclass kata-qemu
  if [ "$status" -ne 0 ]; then
    skip "kata-qemu RuntimeClass not found in cluster"
  fi
  [ "$status" -eq 0 ]
}

# ── Agent lifecycle (requires Kata cluster) ───────────────────────────────────

@test "agent start: creates Kata pod and returns session id" {
  skip_if_missing kubectl

  run kubectl get runtimeclass kata-qemu 2>/dev/null
  if [ "$status" -ne 0 ]; then
    skip "kata-qemu RuntimeClass not found"
  fi
  skip "vakt agent command not yet implemented — see issue #62"

  run vakt agent start --provider kata
  [ "$status" -eq 0 ]
  [[ "$output" == *"session"* ]] || [[ "$output" == *"pod"* ]]
}

@test "agent exec: runs command in Kata pod" {
  skip_if_missing kubectl

  run kubectl get runtimeclass kata-qemu 2>/dev/null
  if [ "$status" -ne 0 ]; then skip "kata-qemu RuntimeClass not found"; fi
  skip "vakt agent command not yet implemented — see issue #62"

  local session_id
  session_id=$(vakt agent start --provider kata --format id)

  run vakt agent exec "$session_id" "node --version"
  [ "$status" -eq 0 ]
  [[ "$output" == v* ]]

  vakt agent destroy "$session_id"
}

@test "agent destroy: Kata pod is removed after session ends" {
  skip_if_missing kubectl

  run kubectl get runtimeclass kata-qemu 2>/dev/null
  if [ "$status" -ne 0 ]; then skip "kata-qemu RuntimeClass not found"; fi
  skip "vakt agent command not yet implemented — see issue #62"

  local session_id
  session_id=$(vakt agent start --provider kata --format id)

  run vakt agent destroy "$session_id"
  [ "$status" -eq 0 ]

  run kubectl get pod "$session_id" -n vakt-agents 2>&1
  [ "$status" -ne 0 ]
}
