# Security Policy

## Reporting a vulnerability

Use GitHub's private vulnerability reporting — no public issues for security reports.

**→ [Open a private advisory](https://github.com/tn819/vakt/security/advisories/new)**

We'll acknowledge within 48 hours and aim to ship a fix within 14 days for confirmed vulnerabilities.

---

## Scope

vakt manages the **configuration and credential layer** for MCP tooling. It controls what secrets are stored, where they live, and which tool calls are allowed to reach MCP servers. It does not manage the MCP servers themselves, the AI clients, or the content of tool call arguments.

---

## Trust boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│  IN SCOPE                                                       │
│                                                                 │
│  ~/.agents/mcp-config.json   (never contains secret values)    │
│  OS keychain / pass / env    (secret storage backends)         │
│  vakt proxy                  (JSON-RPC interception layer)     │
│  policy.json                 (tool allow/deny enforcement)     │
│  audit.db                    (tool call audit log)             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  OUT OF SCOPE                                                   │
│                                                                 │
│  MCP server implementations  (third-party code)                │
│  AI client processes         (Claude Code, Cursor, etc.)       │
│  OS keychain integrity       (vakt inherits its trust)         │
│  Network transport security  (handled by MCP servers/TLS)      │
└─────────────────────────────────────────────────────────────────┘
```

---

## What vakt protects against

| Threat | Mechanism |
|--------|-----------|
| Dotfiles repo accidentally made public | `mcp-config.json` contains only named references (`secret:KEY`), never credential values — the file is safe to commit |
| iCloud / Dropbox syncing `~/.cursor/`, `~/.claude.json`, etc. | Resolved credential values are written to provider configs transiently at sync time; `~/.agents/` holds no values |
| AI tool process reading its own config to exfiltrate keys | Provider configs written by vakt contain references, not values, for the duration between syncs |
| Unauthorised MCP tool invocations | Policy engine evaluates every `tools/call` before it reaches the server; fail-closed by default (`"default": "deny"`) |
| Execution of unverified MCP servers | `registryPolicy: "registry-only"` blocks sync for any server not present in the official MCP registry |
| Audit gap — no record of what AI tools invoked | Every tool call (allowed and denied) is recorded in `~/.agents/audit.db` with server, tool, policy result, session ID, and timing |

---

## What vakt does NOT protect against

These are explicit non-goals. Knowing the boundary is part of using the tool safely.

| Threat | Why it is out of scope |
|--------|------------------------|
| **Compromised OS keychain** | vakt delegates secret storage to the OS keychain or `pass`. If either is compromised, so are the stored secrets. This is the same trust level as your SSH agent or browser password store. |
| **Malicious tool with a compliant name but dangerous arguments** | Policy enforces tool *names* via glob matching, not argument content. A tool named `create_issue` that accepts `{"action": "exec"}` in its parameters is not caught. For argument-level DLP, pair vakt with [crust](https://github.com/BakeLens/crust). |
| **vakt binary replacement in PATH** | If an attacker can replace the vakt binary, they have arbitrary code execution on your machine. This is below the trust boundary vakt can enforce. Verify binary integrity via the checksums published with each release. |
| **No `policy.json` configured** | Without a policy file, the proxy passes all tool calls through without evaluation. Policy enforcement is opt-in. Run `vakt sync --with-proxy` and create `~/.agents/policy.json` to enable enforcement. |
| **Prompt injection causing an agent to invoke allowed tools** | Policy controls which tools *can* be called, not the reasoning behind calling them. A prompt injection that causes an agent to call `list_repos` (an explicitly allowed tool) is not blocked. |
| **Secrets in process environment at runtime** | When vakt resolves secrets and spawns an MCP server, the secret values exist in the child process's environment for the lifetime of that process. Any process that can read `/proc/<pid>/environ` (Linux) or equivalent can extract them. |

---

## Known limitations

**`env` fallback backend stores secrets as base64, not encrypted.**
The `env` backend (`~/.agents/secrets.env`) is intended for ephemeral CI environments where a keychain is unavailable. Values are base64-encoded, not encrypted. Do not use this backend for long-lived developer machines. The backend in use is shown by `vakt list secrets`.

**`keychainList()` calls `security dump-keychain`.**
On macOS, listing stored secret keys (`vakt secrets list`) calls `/usr/bin/security dump-keychain`, which dumps metadata for all items in the login keychain and parses it with a regex filtered by the vakt service name. This requires the keychain to be unlocked and produces a broad system call. No secret *values* are read during a list operation.

**Remote policy merge trust.**
When a `policy.remote.json` is present (written by `vakt pull`), it is merged with `policy.json` with remote taking precedence for any keys listed in `_meta.lockedKeys`. If an attacker can write an arbitrary `policy.remote.json`, they can lock any policy field. Protect the remote policy source accordingly.

**Policy bypass if proxy is not active.**
`vakt sync --with-proxy` rewrites provider configs so all MCP traffic routes through the proxy. Without this flag, provider configs point directly at MCP servers and policy enforcement does not apply. The proxy must be running for runtime enforcement.

---

## Release integrity

Each release publishes SHA-256 checksums alongside the binaries. Verify before installing:

```bash
curl -fsSL https://github.com/tn819/vakt/releases/latest/download/vakt -o vakt
curl -fsSL https://github.com/tn819/vakt/releases/latest/download/checksums.txt -o checksums.txt
sha256sum --check --ignore-missing checksums.txt
```

---

## Supported versions

Only the latest release receives security fixes.
