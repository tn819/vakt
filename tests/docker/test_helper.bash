#!/usr/bin/env bash

DOCKER_TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$DOCKER_TEST_DIR/../.." && pwd)"
export AGENTCTL="${PROJECT_ROOT}/src/agentctl.sh"
MCP_SERVER="${PROJECT_ROOT}/tests/fixtures/mcp/node_modules/@modelcontextprotocol/server-everything/dist/index.js"
export MCP_SERVER

setup_docker_env() {
  export SANDBOX_HOME="$(mktemp -d)"
  export HOME="$SANDBOX_HOME"
  export AGENTS_DIR="$SANDBOX_HOME/.agents"
  export AGENTS_SECRETS_BACKEND="env"
  # Reuse the container-wide GNUPGHOME set by entrypoint.sh
  # GNUPGHOME must already be set in the environment
  export PASSWORD_STORE_DIR="$SANDBOX_HOME/.password-store"
}

teardown_docker_env() {
  if [[ -n "${SANDBOX_HOME:-}" && -d "$SANDBOX_HOME" ]]; then
    rm -rf "$SANDBOX_HOME" 2>/dev/null || true
  fi
}

agentctl() {
  "$AGENTCTL" "$@"
}

# Send JSON-RPC messages to `agentctl proxy <server>` with MCP initialize handshake prepended.
# Usage: proxy_call <server-name> <json-rpc-line> [<json-rpc-line>...]
proxy_call() {
  local server_name="$1"
  shift
  {
    printf '%s\n' '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"vakt-e2e","version":"1.0"}}}'
    printf '%s\n' '{"jsonrpc":"2.0","method":"notifications/initialized"}'
    for msg in "$@"; do
      printf '%s\n' "$msg"
    done
  } | agentctl proxy "$server_name" 2>&1
}

# Assert the audit log contains an entry for the given tool and policy result.
# Usage: assert_audit_entry <server-name> <tool-name> <allow|deny>
assert_audit_entry() {
  local server="$1"
  local tool="$2"
  local result="$3"
  local output
  output=$(agentctl audit show --server "$server" 2>&1)
  if ! echo "$output" | grep -qw "$tool"; then
    echo "Expected audit entry for tool '$tool' on server '$server'" >&2
    echo "Audit output: $output" >&2
    return 1
  fi
  if ! echo "$output" | grep -w "$tool" | grep -qi "$result"; then
    echo "Expected audit entry for '$tool' to have result '$result'" >&2
    echo "Audit output: $output" >&2
    return 1
  fi
}

# Initialise the pass store using the container-wide GPG key and switch to
# the pass backend.  Call this at the start of any test that exercises secrets
# via pass (rather than the default env backend).
init_pass_store() {
  export AGENTS_SECRETS_BACKEND="pass"
  local key_id
  key_id=$(gpg --list-secret-keys --with-colons 2>/dev/null \
    | awk -F: '/^sec/{print $5; exit}')
  if [[ -z "$key_id" ]]; then
    echo "No GPG key found in GNUPGHOME=$GNUPGHOME" >&2
    return 1
  fi
  pass init "$key_id"
}

# Wait until Jaeger REST API is reachable (up to 30s).
wait_for_jaeger() {
  local url="${JAEGER_URL:-http://jaeger:16686}"
  local i=0
  until curl -sf "$url/api/services" > /dev/null 2>&1; do
    sleep 1
    ((i++))
    if [[ $i -ge 30 ]]; then
      echo "Jaeger not reachable at $url after 30s" >&2
      return 1
    fi
  done
}

# Query Jaeger for all vakt traces (returns JSON).
jaeger_traces() {
  local url="${JAEGER_URL:-http://jaeger:16686}"
  curl -sf "${url}/api/traces?service=vakt&limit=100" 2>/dev/null
}
