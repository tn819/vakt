---
provider: gvisor
status: planned (#62)
---

# Sandbox Playbook — gVisor

gVisor intercepts system calls in user-space before they reach the host kernel, providing strong isolation without a full hypervisor. Google uses it in GKE Sandbox and Cloud Run. It is the recommended backend for workloads on Google Cloud or when syscall-level auditability is required.

## Architecture

```
vakt agent start --provider gvisor --repo <url>
         │
         ▼
src/lib/sandbox/gvisor.ts → Kubernetes API (GKE) or Docker with runsc
         │
         ▼
Container with gVisor runsc runtime
├── Sentry (Go): intercepts guest syscalls in user-space
└── Gofer:       mediates file system access
         │
   No host kernel exposure
   OCI-compatible image format
   Compatible with Cloud Run (managed gVisor)
```

## Prerequisites

**Option A — Google Cloud Run (managed, no install)**

| Requirement | Notes |
|-------------|-------|
| GCP project | https://console.cloud.google.com |
| `gcloud` CLI | `brew install google-cloud-sdk` |
| Cloud Run API enabled | `gcloud services enable run.googleapis.com` |

**Option B — GKE with GKE Sandbox**

| Requirement | Notes |
|-------------|-------|
| GKE cluster with node pool using `containerd` | Sandbox nodes: `--sandbox-type=gvisor` |
| `gke-sandbox` RuntimeClass | Created automatically by GKE |
| `kubectl` | `brew install kubectl` |

**Option C — Local Docker with runsc (for development)**

| Requirement | Notes |
|-------------|-------|
| Linux host (x86_64 or arm64) | macOS not supported natively |
| gVisor `runsc` binary | See install below |
| Docker configured to use `runsc` | One-time setup |

## Install gVisor locally (Linux only)

```bash
# Download runsc
ARCH=$(uname -m)
curl -fsSL "https://storage.googleapis.com/gvisor/releases/release/latest/${ARCH}/runsc" \
  -o /usr/local/bin/runsc && chmod +x /usr/local/bin/runsc

# Register with Docker
cat > /etc/docker/daemon.json <<EOF
{
  "runtimes": {
    "runsc": { "path": "/usr/local/bin/runsc" }
  }
}
EOF
systemctl reload docker

# Test
docker run --runtime=runsc --rm hello-world
```

## Local setup

```bash
# Cloud Run variant
vakt secrets set GCP_SERVICE_ACCOUNT_KEY "$(cat key.json | base64)"
vakt config set runtime.gvisor.backend cloud-run
vakt config set runtime.gvisor.project my-gcp-project
vakt config set runtime.gvisor.region us-central1
vakt config set runtime.gvisor.service_account_key secret:GCP_SERVICE_ACCOUNT_KEY

# GKE / local Docker variant
vakt config set runtime.gvisor.backend kubernetes
vakt config set runtime.gvisor.runtime_class gke-sandbox   # or "runsc" for local Docker

# Route a server
vakt runtime set trusted-coder gvisor
```

## Configuration reference

```json
// ~/.agents/config.json
{
  "runtime": {
    "gvisor": {
      "backend": "cloud-run",
      "project": "my-gcp-project",
      "region": "us-central1",
      "image": "node:20-slim",
      "service_account_key": "secret:GCP_SERVICE_ACCOUNT_KEY",
      "max_instances": 5,
      "timeout_seconds": 3600
    },
    "servers": {
      "trusted-coder": "gvisor"
    }
  }
}
```

## How to implement — `SandboxProvider` backend (issue #62)

The gVisor backend has two sub-modes sharing the same `SandboxProvider` interface:

### Cloud Run sub-mode

```typescript
// src/lib/sandbox/gvisor.ts  (to be created — see issue #62)
import type { SandboxProvider, SandboxHandle, SandboxCreateOpts } from '../sandbox.ts';

export class GVisorSandboxProvider implements SandboxProvider {
  readonly name = 'gvisor';

  // Cloud Run: deploy a Job, exec via Cloud Run Jobs API
  // GKE: create Pod with runtimeClassName: gke-sandbox, exec via kubectl
  // Docker/local: docker run --runtime=runsc, exec via Docker API

  async create(opts: SandboxCreateOpts): Promise<SandboxHandle> {
    switch (this.config.backend) {
      case 'cloud-run':  return this.createCloudRunJob(opts);
      case 'kubernetes': return this.createKubernetesPod(opts);
      case 'docker':     return this.createDockerContainer(opts);
    }
  }

  // ... exec / writeFile / readFile / destroy per backend
}
```

The three sub-modes share a single provider class because they differ only in the transport layer, not the `SandboxProvider` contract.

## Security properties (vs other backends)

| Property | Docker | E2B (Firecracker) | gVisor | Kata (hypervisor) |
|----------|--------|-------------------|--------|-------------------|
| Syscall isolation | Seccomp | Full VM | User-space intercept | Full VM |
| Host kernel exposure | Partial | None | Minimal | None |
| OCI compatible | ✓ | ✓ | ✓ | ✓ |
| Syscall audit log | — | — | ✓ (runsc logs) | — |
| Cloud Run support | — | — | ✓ | — |

gVisor is the only backend that provides a syscall-level audit trail via `runsc` logs, which can be forwarded to any SIEM alongside vakt's own audit.db.

## Local testing without GCP / GKE

**On Linux** — use Docker with `runsc` runtime (see install above):

```bash
# After installing runsc and configuring Docker
vakt config set runtime.gvisor.backend docker
vakt config set runtime.gvisor.runtime_class runsc
bats tests/e2e/agent-gvisor.bats
```

**On macOS** — fall back to the Docker backend without gVisor isolation:

```bash
vakt runtime set trusted-coder docker
bats tests/e2e/agent-docker.bats
```

The gVisor e2e tests skip automatically if `runsc` is not found and no GCP/GKE credentials are available.

## Running the e2e tests

```bash
# Local runsc variant (Linux only)
bats tests/e2e/agent-gvisor.bats

# Cloud Run variant
GOOGLE_APPLICATION_CREDENTIALS=key.json GCP_PROJECT=my-project \
  bats tests/e2e/agent-gvisor.bats

# Without any gVisor environment — all live tests skipped
bats tests/e2e/agent-gvisor.bats
```

See `tests/e2e/agent-gvisor.bats` for the full suite.
