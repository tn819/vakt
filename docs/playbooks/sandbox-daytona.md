---
provider: daytona
status: planned (#62)
---

# Sandbox Playbook — Daytona

Daytona provides container-based dev environments with sub-200 ms cold starts. It has both a SaaS offering and a self-hosted option, making it well-suited for teams that want cloud convenience with the option to move on-prem.

## Architecture

```
vakt agent start --provider daytona --repo <url>
         │
         ▼
src/lib/sandbox/daytona.ts → Daytona REST API
         │
         ▼
Container workspace (your repo cloned inside)
         │
   Tool calls via exec API
   File I/O via workspace files API
```

## Prerequisites

| Requirement | Check |
|-------------|-------|
| Daytona account | https://daytona.io or self-hosted |
| API key | Dashboard → Settings → API Keys |
| Daytona CLI (optional) | `npm install -g @daytonaio/cli` |

## Local setup

```bash
# Store the API key
vakt secrets set DAYTONA_API_KEY dt_...

# Point vakt at your Daytona instance
vakt config set runtime.daytona.api_url https://app.daytona.io/api
vakt config set runtime.daytona.api_key secret:DAYTONA_API_KEY

# (Self-hosted)
vakt config set runtime.daytona.api_url http://daytona.internal:3986/api

# Route a server to Daytona
vakt runtime set my-coder daytona
```

## Configuration reference

```json
// ~/.agents/config.json
{
  "runtime": {
    "daytona": {
      "api_url": "https://app.daytona.io/api",
      "api_key": "secret:DAYTONA_API_KEY",
      "image": "daytonaio/workspace-project:latest"
    },
    "servers": {
      "my-coder": "daytona"
    }
  }
}
```

## How to implement — `SandboxProvider` backend (issue #62)

Daytona exposes a REST API. The key operations map cleanly to the `SandboxProvider` interface:

| SandboxProvider method | Daytona API endpoint |
|------------------------|----------------------|
| `create()` | `POST /workspace` |
| `exec()` | `POST /workspace/{id}/exec` |
| `writeFile()` | `PUT /workspace/{id}/files` |
| `readFile()` | `GET /workspace/{id}/files?path=…` |
| `destroy()` | `DELETE /workspace/{id}` |

```typescript
// src/lib/sandbox/daytona.ts  (to be created — see issue #62)
import type { SandboxProvider, SandboxHandle, SandboxCreateOpts } from '../sandbox.ts';

export class DaytonaSandboxProvider implements SandboxProvider {
  readonly name = 'daytona';

  constructor(private apiUrl: string, private apiKey: string) {}

  async create(opts: SandboxCreateOpts): Promise<SandboxHandle> {
    const res = await fetch(`${this.apiUrl}/workspace`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: opts.image ?? 'daytonaio/workspace-project:latest', repo: opts.repo }),
    });
    const { id } = await res.json();
    return { id, raw: null };
  }

  async exec(handle: SandboxHandle, cmd: string[], env?: Record<string, string>) {
    const res = await fetch(`${this.apiUrl}/workspace/${handle.id}/exec`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd, env }),
    });
    return res.json();
  }

  async destroy(handle: SandboxHandle) {
    await fetch(`${this.apiUrl}/workspace/${handle.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }

  // writeFile / readFile: similar fetch calls to /workspace/{id}/files
}
```

## Local testing without a Daytona account

Two options:

**Option A — Docker local backend** (recommended for inner loop):
```bash
# The Docker backend implements the same SandboxProvider interface.
# Use it while building the Daytona integration — switch back with:
vakt runtime set my-coder docker
```

**Option B — Daytona self-hosted in Docker Compose**:
```bash
# Official single-node compose (requires Docker)
curl -fsSL https://raw.githubusercontent.com/daytonaio/daytona/main/hack/compose.yml \
  | docker compose -f - up -d

vakt config set runtime.daytona.api_url http://localhost:3986/api
vakt config set runtime.daytona.api_key local-dev-key
```

## Running the e2e tests

```bash
# Full suite — requires DAYTONA_API_KEY or local Daytona instance
DAYTONA_API_URL=http://localhost:3986/api DAYTONA_API_KEY=local-dev-key \
  bats tests/e2e/agent-daytona.bats

# Without credentials — live workspace tests are skipped automatically
bats tests/e2e/agent-daytona.bats
```

See `tests/e2e/agent-daytona.bats` for the full suite.
