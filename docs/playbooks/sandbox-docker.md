---
provider: docker
status: planned — recommended local development fallback (#62)
---

# Sandbox Playbook — Docker (local)

The Docker backend is the **recommended inner-loop development environment** for the container agent feature. It requires no credentials, no cloud account, and no microVM support — just a running Docker daemon. Use it to develop and test the `SandboxProvider` abstraction locally before wiring up cloud backends.

## Architecture

```
vakt agent start --provider docker --repo <path>
         │
         ▼
src/lib/sandbox/docker.ts → Docker Engine API (unix socket)
         │
         ▼
OCI container (your image, repo bind-mounted)
         │
   exec via docker exec
   files via docker cp / bind mount
   isolated network by default
```

## Prerequisites

| Requirement | Install |
|-------------|---------|
| Docker Desktop (macOS/Windows) | https://docs.docker.com/desktop/ |
| Docker Engine (Linux) | `apt install docker.io` / `brew install docker` |
| Docker daemon running | `docker info` |

## Local setup

```bash
# No API key needed — Docker socket is used directly
vakt config set runtime.docker.socket /var/run/docker.sock   # default
vakt config set runtime.docker.image  node:20-slim           # default base image

# Optionally set resource limits
vakt config set runtime.docker.cpus   1
vakt config set runtime.docker.memory 512m

# Route a server (or all servers)
vakt runtime set my-coder docker
# or set as default during development:
vakt config set runtime.default docker
```

## Configuration reference

```json
// ~/.agents/config.json
{
  "runtime": {
    "default": "docker",
    "docker": {
      "socket": "/var/run/docker.sock",
      "image": "node:20-slim",
      "cpus": "1",
      "memory": "512m",
      "network": "none"
    }
  }
}
```

## How to implement — `SandboxProvider` backend (issue #62)

The Docker backend uses the Docker Engine HTTP API over the Unix socket. No Docker SDK is needed — the API is straightforward JSON over HTTP.

```typescript
// src/lib/sandbox/docker.ts  (to be created — see issue #62)
import type { SandboxProvider, SandboxHandle, SandboxCreateOpts } from '../sandbox.ts';
import { createConnection } from 'net';

// Simple helper: HTTP over Unix socket
async function dockerFetch(socket: string, method: string, path: string, body?: unknown) {
  // ... (unix socket fetch implementation)
}

export class DockerSandboxProvider implements SandboxProvider {
  readonly name = 'docker';

  constructor(
    private socket = '/var/run/docker.sock',
    private defaultImage = 'node:20-slim',
  ) {}

  async create(opts: SandboxCreateOpts): Promise<SandboxHandle> {
    const body = {
      Image: opts.image ?? this.defaultImage,
      Cmd: ['/bin/sh'],
      OpenStdin: true,
      HostConfig: {
        Binds: opts.repo ? [`${opts.repo}:/workspace:rw`] : [],
        NetworkMode: 'none',
        Memory: 512 * 1024 * 1024,
        NanoCpus: 1e9,
        AutoRemove: true,
      },
    };
    const res = await dockerFetch(this.socket, 'POST', '/containers/create', body);
    const { Id } = JSON.parse(res);
    await dockerFetch(this.socket, 'POST', `/containers/${Id}/start`);
    return { id: Id, raw: null };
  }

  async exec(handle: SandboxHandle, cmd: string[], env?: Record<string, string>) {
    const execRes = await dockerFetch(this.socket, 'POST', `/containers/${handle.id}/exec`, {
      Cmd: cmd,
      Env: Object.entries(env ?? {}).map(([k, v]) => `${k}=${v}`),
      AttachStdout: true,
      AttachStderr: true,
    });
    const { Id } = JSON.parse(execRes);
    const output = await dockerFetch(this.socket, 'POST', `/exec/${Id}/start`, { Detach: false });
    return { stdout: output, exitCode: 0 };
  }

  async writeFile(handle: SandboxHandle, path: string, content: string) {
    // docker cp via tar stream into /containers/{id}/archive
  }

  async readFile(handle: SandboxHandle, path: string): Promise<string> {
    // GET /containers/{id}/archive?path=…, extract tar
    return '';
  }

  async destroy(handle: SandboxHandle) {
    await dockerFetch(this.socket, 'DELETE', `/containers/${handle.id}?force=true`);
  }
}
```

## Testing the Docker backend locally

```bash
# Verify Docker is available
docker info

# Smoke test — run a container and exec a command
docker run --rm -d --name vakt-test-sandbox node:20-slim sleep 30
docker exec vakt-test-sandbox node --version
docker rm -f vakt-test-sandbox

# Run vakt e2e tests against Docker backend
bats tests/e2e/agent-docker.bats
```

## Running the e2e tests

```bash
# Full suite — requires Docker daemon
bats tests/e2e/agent-docker.bats

# Without Docker — all tests skipped automatically via skip_if_missing docker
bats tests/e2e/agent-docker.bats
```

Tests use real Docker containers in a sandboxed `HOME`. Images are pulled on first run (~30 s); subsequent runs are fast.

See `tests/e2e/agent-docker.bats` for the full suite.
