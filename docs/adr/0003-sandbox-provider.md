---
status: accepted
date: 2026-03-16
---

# 0003 — SandboxProvider: backend-agnostic container abstraction for coding agent sessions

## Context

vakt already moves MCP server processes into isolated runtimes (`local`, `e2b`). The existing
`src/lib/runtime.ts` is a set of flat functions with no typed abstraction — adding a third backend
requires duplicating call-site switches everywhere.

For container-based coding agents the security model requires MCP tool servers to run **inside**
the sandbox. Network isolation, filesystem isolation, and resource limits are meaningless if tool
execution stays on the host.

Eight sandbox backends are now in scope (Docker, E2B, Daytona, microsandbox, Kata, Fly, gVisor,
Coder — tracked in #62). A typed interface is required to keep call-sites clean and backends
interchangeable.

The multi-agent swarm layer (#73) must sit above the container runtime without caring which backend
is in use, so the interface must expose enough metadata (labels, name) for a coordinator to
discover and manage agent sets.

## Decision

Introduce `SandboxProvider` in `src/lib/sandbox.ts` as the single seam between vakt's agent
lifecycle logic and any container runtime.

### Interface

```typescript
interface SandboxCreateOpts {
  image?:   string;
  repo?:    string;           // host path — bind-mounted at /workspace
  name?:    string;           // {swarm-id}-{role}-{index} or freeform
  labels?:  Record<string, string>;
  cpus?:    number;
  memory?:  string;           // "512m", "1g", etc.
  network?: "none" | "bridge";
}

interface SandboxHandle {
  id:       string;           // backend-native ID
  provider: string;           // "docker" | "e2b" | ...
}

interface ExecResult {
  stdout:   string;
  stderr:   string;
  exitCode: number;
}

interface SandboxProvider {
  readonly name: string;
  create(opts: SandboxCreateOpts): Promise<SandboxHandle>;
  exec(handle: SandboxHandle, cmd: string[], env?: Record<string, string>): Promise<ExecResult>;
  writeFile(handle: SandboxHandle, path: string, content: string): Promise<void>;
  readFile(handle: SandboxHandle, path: string): Promise<string>;
  destroy(handle: SandboxHandle): Promise<void>;
  // Swarm extensions — optional (#73)
  list?(filter?: { namePrefix?: string; labels?: Record<string, string> }): Promise<SandboxHandle[]>;
  createMany?(opts: SandboxCreateOpts[]): Promise<SandboxHandle[]>;
}
```

### Session persistence

A `CodingAgentSession` wraps a `SandboxHandle`. When `vakt agent start` is called, a UUID session
ID is written to the existing AuditStore SQLite DB (new `sandbox_sessions` table) with the
backend-native container ID as a foreign key. All subsequent operations are recorded against that
UUID.

This makes sessions backend-agnostic, audit-correlated, and re-attachable — a new container can
be created for an existing session UUID after a crash, preserving full history and any host
bind-mounted workspace state.

### Docker backend

The Docker backend (`src/lib/sandbox/docker.ts`) talks to the Docker Engine HTTP API over the Unix
socket using Bun's `fetch({ unix })`. No Docker SDK, no new runtime dependency.

File I/O uses `exec` with base64 encoding to avoid a tar dependency: `writeFile` runs
`printf '%s' BASE64 | base64 -d > PATH`; `readFile` runs `base64 PATH` and decodes stdout.

`list()` is implemented using Docker label filters. `createMany()` is a TODO stub that falls back
to `Promise.all(opts.map(o => this.create(o)))`.

### Config schema

`runtime.default` expands to `z.enum(["local", "e2b", "docker"])`. A `runtime.docker` block is
added for socket path, default image, and resource limits.

## Alternatives Considered

### Keep flat functions per backend

Simple, but call-sites multiply with each new backend. Ruled out.

### Docker SDK (`dockerode`)

Adds a runtime dependency and introduces N-SDK drift across providers. The Docker Engine REST API
is stable, well-documented, and accessible with Bun's built-in fetch over Unix socket.

### Proxy tool calls to container (tool servers stay on host)

Simpler to implement but provides no meaningful security isolation — bash still runs on the host
filesystem. Ruled out.

## Consequences

**Positive:**
- Single typed seam for all container backends
- Sessions are audit-correlated and re-attachable after crash
- Session UUID enables backend migration (Docker → E2B) with continuous audit history
- `list(labels)` gives #73 the discovery primitive it needs without a new abstraction layer
- No new runtime dependencies (Bun handles the HTTP primitives)

**Negative / trade-offs:**
- `sandbox_sessions` table can drift from actual container state if container dies unexpectedly;
  `vakt agent status` must reconcile against the backend
- File I/O via base64+exec is correct but not efficient for large files; revisit if needed
- `createMany` is a stub — bulk optimisation deferred to per-backend issues

**Neutral / to monitor:**
- Session branching (fork session to new container, diverging from that point) is architecturally
  possible with the UUID model; deferred to a future issue
