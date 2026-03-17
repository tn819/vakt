---
provider: microsandbox
status: planned (#62)
---

# Sandbox Playbook — microsandbox

microsandbox is a lightweight self-hosted sandbox using libkrun microVMs. It starts faster than full VMs (~100 ms), has no cloud dependency, and is the recommended option for air-gapped or on-premises deployments.

## Architecture

```
vakt agent start --provider microsandbox --repo <path>
         │
         ▼
src/lib/sandbox/microsandbox.ts → microsandbox HTTP API (localhost)
         │
         ▼
libkrun microVM (kernel + minimal rootfs)
         │
   Full process isolation, ~100ms cold start
   No Docker daemon required
```

## Prerequisites

| Requirement | Platform | Notes |
|-------------|----------|-------|
| microsandbox daemon | Linux, macOS (via Rosetta) | See install below |
| `msb` CLI | same | Installed with the daemon |
| Linux kernel ≥ 5.4 | Linux only | For KVM acceleration |
| Rosetta 2 | macOS Apple Silicon | For x86 images |

## Install microsandbox

```bash
# Linux (x86_64)
curl -fsSL https://github.com/microsandbox/microsandbox/releases/latest/download/microsandbox-linux-x86_64.tar.gz \
  | tar -xz -C /usr/local/bin

# macOS Apple Silicon (Rosetta)
brew install microsandbox/tap/microsandbox

# Start the daemon
msb daemon start

# Verify
msb version
msb daemon status
```

## Local setup

```bash
# No API key needed for local daemon
vakt config set runtime.microsandbox.socket /var/run/microsandbox.sock

# Or HTTP if daemon is remote
vakt config set runtime.microsandbox.api_url http://localhost:7681

# Route a server
vakt runtime set filesystem microsandbox
```

## Configuration reference

```json
// ~/.agents/config.json
{
  "runtime": {
    "microsandbox": {
      "api_url": "http://localhost:7681",
      "rootfs": "ghcr.io/microsandbox/node:20",
      "cpus": 1,
      "mem_mb": 512
    },
    "servers": {
      "filesystem": "microsandbox"
    }
  }
}
```

## How to implement — `SandboxProvider` backend (issue #62)

microsandbox exposes a local HTTP API. The implementation mirrors the Daytona backend but talks to localhost:

```typescript
// src/lib/sandbox/microsandbox.ts  (to be created — see issue #62)
import type { SandboxProvider, SandboxHandle, SandboxCreateOpts } from '../sandbox.ts';

export class MicrosandboxProvider implements SandboxProvider {
  readonly name = 'microsandbox';

  constructor(private apiUrl = 'http://localhost:7681') {}

  async create(opts: SandboxCreateOpts): Promise<SandboxHandle> {
    const res = await fetch(`${this.apiUrl}/sandboxes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rootfs: opts.image ?? 'ghcr.io/microsandbox/node:20',
        cpus: opts.cpus ?? 1,
        mem_mb: opts.memMb ?? 512,
      }),
    });
    const { id } = await res.json();
    return { id, raw: null };
  }

  async exec(handle: SandboxHandle, cmd: string[], env?: Record<string, string>) {
    const res = await fetch(`${this.apiUrl}/sandboxes/${handle.id}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ argv: cmd, env }),
    });
    return res.json();
  }

  async destroy(handle: SandboxHandle) {
    await fetch(`${this.apiUrl}/sandboxes/${handle.id}`, { method: 'DELETE' });
  }

  // writeFile / readFile via /sandboxes/{id}/files
}
```

## Local testing without microsandbox installed

Fall back to the Docker local backend:

```bash
vakt runtime set filesystem docker
bats tests/e2e/agent-docker.bats
```

Tests that require the microsandbox daemon are skipped automatically via `skip_if_missing msb`.

## Running the e2e tests

```bash
# Full suite — requires msb daemon running
msb daemon start
bats tests/e2e/agent-microsandbox.bats

# Without daemon — live sandbox tests skipped
bats tests/e2e/agent-microsandbox.bats
```

See `tests/e2e/agent-microsandbox.bats` for the full suite.
