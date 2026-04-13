---
provider: kata-containers
status: planned (#62)
---

# Sandbox Playbook — Kata Containers

Kata Containers combines VM-level isolation with the container UX. Each container gets its own lightweight hypervisor kernel, providing stronger isolation than standard Docker but with OCI-compatible tooling. It is the recommended backend for Kubernetes-based deployments.

## Architecture

```
vakt agent start --provider kata --repo <url>
         │
         ▼
src/lib/sandbox/kata.ts → Kubernetes API (or containerd + Kata runtime)
         │
         ▼
Pod with kata-qemu / kata-fc runtime class
├── microVM kernel (QEMU or Firecracker)
└── container workload (your image)
         │
   exec via kubectl exec / containerd task API
   VM-level isolation, OCI-compatible image format
```

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Kubernetes cluster (1.24+) | Local: k3s, kind (with kata), or minikube |
| Kata Containers installed on nodes | See install below |
| `kata-qemu` or `kata-fc` RuntimeClass | Created during Kata install |
| `kubectl` | `brew install kubectl` |
| kubeconfig with cluster access | `~/.kube/config` |

## Install Kata Containers (node-level)

```bash
# Ubuntu/Debian nodes
bash -c "$(curl -fsSL https://raw.githubusercontent.com/kata-containers/kata-containers/main/utils/kata-manager.sh) install-kata-packages"

# Verify
kata-runtime check
```

## Install Kata on k3s (local testing)

```bash
# Install k3s
curl -sfL https://get.k3s.io | sh -

# Deploy Kata operator
kubectl apply -f https://raw.githubusercontent.com/kata-containers/kata-containers/stable-3.0/tools/packaging/kata-deploy/kata-rbac/base/kata-rbac.yaml
kubectl apply -f https://raw.githubusercontent.com/kata-containers/kata-containers/stable-3.0/tools/packaging/kata-deploy/kata-deploy/base/kata-deploy.yaml

# Wait for DaemonSet
kubectl -n kube-system wait --timeout=10m --for=condition=Ready -l name=kata-deploy pod

# Create RuntimeClass
kubectl apply -f - <<EOF
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: kata-qemu
handler: kata-qemu
EOF
```

## Local setup

```bash
# Store kubeconfig path (uses ~/.kube/config by default)
vakt config set runtime.kata.kubeconfig ~/.kube/config
vakt config set runtime.kata.namespace   vakt-agents
vakt config set runtime.kata.runtime_class kata-qemu
vakt config set runtime.kata.image      node:20-slim

# Route a server to Kata
vakt runtime set secure-coder kata
```

## Configuration reference

```json
// ~/.agents/config.json
{
  "runtime": {
    "kata": {
      "kubeconfig": "~/.kube/config",
      "namespace": "vakt-agents",
      "runtime_class": "kata-qemu",
      "image": "node:20-slim",
      "cpu_request": "500m",
      "memory_request": "512Mi",
      "ttl_seconds": 3600
    },
    "servers": {
      "secure-coder": "kata"
    }
  }
}
```

## How to implement — `SandboxProvider` backend (issue #62)

The Kata backend creates a Kubernetes Pod with the `kata-qemu` runtime class, then uses `kubectl exec` or the Kubernetes exec subresource for commands.

```typescript
// src/lib/sandbox/kata.ts  (to be created — see issue #62)
import type { SandboxProvider, SandboxHandle, SandboxCreateOpts } from '../sandbox.ts';

export class KataSandboxProvider implements SandboxProvider {
  readonly name = 'kata';

  constructor(
    private kubeconfig: string,
    private namespace = 'vakt-agents',
    private runtimeClass = 'kata-qemu',
  ) {}

  async create(opts: SandboxCreateOpts): Promise<SandboxHandle> {
    const podName = `vakt-agent-${crypto.randomUUID().slice(0, 8)}`;
    const manifest = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: podName, namespace: this.namespace },
      spec: {
        runtimeClassName: this.runtimeClass,
        restartPolicy: 'Never',
        containers: [{
          name: 'agent',
          image: opts.image ?? 'node:20-slim',
          command: ['/bin/sh', '-c', 'sleep infinity'],
          resources: {
            requests: { cpu: '500m', memory: '512Mi' },
            limits:   { cpu: '1',    memory: '1Gi'  },
          },
        }],
      },
    };
    // POST to /api/v1/namespaces/{ns}/pods
    await this.kubePost(`/api/v1/namespaces/${this.namespace}/pods`, manifest);
    await this.waitForPodReady(podName);
    return { id: podName, raw: null };
  }

  async exec(handle: SandboxHandle, cmd: string[], env?: Record<string, string>) {
    // Use kubectl exec subresource (WebSocket upgrade)
    // POST /api/v1/namespaces/{ns}/pods/{name}/exec?command=...&stdout=true
  }

  async destroy(handle: SandboxHandle) {
    // DELETE /api/v1/namespaces/{ns}/pods/{name}
  }

  // writeFile: kubectl cp via tar stream
  // readFile:  kubectl cp in reverse
}
```

## Local testing without a Kubernetes cluster

Use the Docker backend while developing:

```bash
vakt runtime set secure-coder docker
bats tests/e2e/agent-docker.bats
```

The Kata e2e tests skip automatically if `kubectl` is not found or if the `kata-qemu` RuntimeClass is not present.

## Running the e2e tests

```bash
# Full suite — requires k3s/k8s with Kata installed
bats tests/e2e/agent-kata.bats

# Without cluster — all live tests skipped
bats tests/e2e/agent-kata.bats
```

See `tests/e2e/agent-kata.bats` for the full suite.
