---
provider: fly-io
status: planned (#62)
---

# Sandbox Playbook — Fly.io

Fly.io runs OCI containers on Firecracker microVMs across a global edge network. It combines fast cold starts with persistent storage and global networking, making it a good fit for MCP servers that need geographic proximity to the agent's data sources.

## Architecture

```
vakt agent start --provider fly --repo <url>
         │
         ▼
src/lib/sandbox/fly.ts → Fly Machines API (api.machines.dev)
         │
         ▼
Fly Machine (Firecracker + OCI image)
├── ephemeral: created per session, destroyed on agent stop
└── persistent: volume-backed, reused across sessions (optional)
```

Fly Machines differ from E2B in two key ways:
- **Persistent volumes** — a Fly volume can be attached and persist across agent sessions
- **Global routing** — `fly regions set` controls which edge region runs the machine

## Prerequisites

| Requirement | Install |
|-------------|---------|
| Fly.io account | https://fly.io — pay-as-you-go, free allowance |
| `flyctl` CLI | `brew install flyctl` or `curl -L https://fly.io/install.sh \| sh` |
| Fly API token | `fly auth token` |

## Local setup

```bash
# Authenticate
fly auth login

# Store the token
vakt secrets set FLY_API_TOKEN $(fly auth token)
vakt config set runtime.fly.api_token secret:FLY_API_TOKEN

# Optional: pin to a specific region (default: nearest)
vakt config set runtime.fly.region iad   # Washington D.C.

# Route a server to Fly
vakt runtime set my-coder fly
```

## Configuration reference

```json
// ~/.agents/config.json
{
  "runtime": {
    "fly": {
      "api_token": "secret:FLY_API_TOKEN",
      "org": "personal",
      "region": "iad",
      "image": "node:20-slim",
      "cpu_kind": "shared",
      "cpus": 1,
      "memory_mb": 512,
      "auto_stop": true
    },
    "servers": {
      "my-coder": "fly"
    }
  }
}
```

## How to implement — `SandboxProvider` backend (issue #62)

Fly exposes the Machines API at `https://api.machines.dev`. A Machine maps directly to a sandbox:

| SandboxProvider method | Fly Machines API |
|------------------------|-----------------|
| `create()` | `POST /v1/apps/{app}/machines` |
| `exec()` | `POST /v1/apps/{app}/machines/{id}/exec` |
| `writeFile()` | exec `tee` / `base64` or volume mount |
| `readFile()` | exec `cat` |
| `destroy()` | `DELETE /v1/apps/{app}/machines/{id}` |

```typescript
// src/lib/sandbox/fly.ts  (to be created — see issue #62)
import type { SandboxProvider, SandboxHandle, SandboxCreateOpts } from '../sandbox.ts';

const MACHINES_API = 'https://api.machines.dev';

export class FlySandboxProvider implements SandboxProvider {
  readonly name = 'fly';

  constructor(
    private token: string,
    private appName: string,
    private region = 'iad',
  ) {}

  private headers() {
    return { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' };
  }

  async create(opts: SandboxCreateOpts): Promise<SandboxHandle> {
    const res = await fetch(`${MACHINES_API}/v1/apps/${this.appName}/machines`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        config: {
          image: opts.image ?? 'node:20-slim',
          auto_destroy: true,
          restart: { policy: 'no' },
          guest: { cpu_kind: 'shared', cpus: 1, memory_mb: 512 },
        },
        region: this.region,
      }),
    });
    const { id } = await res.json();
    return { id, raw: null };
  }

  async exec(handle: SandboxHandle, cmd: string[]) {
    const res = await fetch(`${MACHINES_API}/v1/apps/${this.appName}/machines/${handle.id}/exec`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ cmd }),
    });
    return res.json();
  }

  async destroy(handle: SandboxHandle) {
    await fetch(`${MACHINES_API}/v1/apps/${this.appName}/machines/${handle.id}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
  }
}
```

**Pre-requisite**: a Fly app must exist before creating machines.

```bash
fly apps create vakt-agent-sandbox --org personal
vakt config set runtime.fly.app vakt-agent-sandbox
```

## Local testing without a Fly account

Use the Docker backend:

```bash
vakt runtime set my-coder docker
bats tests/e2e/agent-docker.bats
```

The Fly e2e tests skip automatically if `FLY_API_TOKEN` is not set.

## Running the e2e tests

```bash
# Full suite — requires FLY_API_TOKEN and an existing app
FLY_API_TOKEN=$(fly auth token) bats tests/e2e/agent-fly.bats

# Without token — live Machine tests skipped
bats tests/e2e/agent-fly.bats
```

See `tests/e2e/agent-fly.bats` for the full suite.
