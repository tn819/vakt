---
provider: coder
status: planned (#62)
---

# Sandbox Playbook — Coder.com

[Coder](https://coder.com) manages persistent developer workspaces provisioned via Terraform templates. Unlike the other sandbox backends, Coder workspaces are **long-lived by default** — the workspace survives between agent sessions with the repo already cloned and the toolchain pre-installed. This makes it the natural fit for iterative, multi-session coding agent workflows.

## How it differs from the other backends

| | E2B / Fly.io / microsandbox | Daytona | **Coder** |
|---|---|---|---|
| Workspace lifetime | Ephemeral (per session) | Per session or persistent | **Persistent across sessions** |
| Provisioning | SDK / REST | REST | **Terraform template** |
| Repo seeding | vakt clones at start | vakt clones at start | **Already in workspace from template** |
| Toolchain | Base image | Base image | **Baked into Terraform template** |
| Self-hosted | ✓ | ✓ | **✓ (primary mode)** |
| SaaS | ✓ | ✓ | **✓ (coder.com/cloud)** |

Because the workspace is already provisioned with the right repo and toolchain, the "workspace seeding" open question from issue #62 is resolved by the template — vakt just needs to find or create a workspace from the right template, not clone anything itself.

## Architecture

```
vakt agent start --provider coder --template my-agent-template
         │
         ▼
src/lib/sandbox/coder.ts → Coder REST API (/api/v2)
         │
         ▼
Coder workspace (Terraform-provisioned, persistent)
├── workspace agent (long-running sidecar inside workspace)
├── repo cloned by template, toolchain installed
└── exec via workspace agent API
         │
   Workspace survives session end (unless --stop flag passed)
   Re-attach to same workspace on next agent start
```

## Prerequisites

| Requirement | Install |
|-------------|---------|
| Coder deployment (self-hosted or cloud) | https://coder.com/docs/install or https://coder.com/cloud |
| `coder` CLI | `curl -fsSL https://coder.com/install.sh \| sh` |
| API token | `coder tokens create vakt` |
| A workspace template | `coder templates init` or pull from registry |

## Local setup

```bash
# Point coder CLI at your deployment
coder login https://coder.example.com   # or https://coder.com for cloud

# Create a long-lived token for vakt (not your session token)
CODER_TOKEN=$(coder tokens create vakt --lifetime 8760h)

# Store in keychain
vakt secrets set CODER_TOKEN "$CODER_TOKEN"
vakt secrets set CODER_URL  https://coder.example.com

# Configure vakt
vakt config set runtime.coder.url       secret:CODER_URL
vakt config set runtime.coder.token     secret:CODER_TOKEN
vakt config set runtime.coder.org       default         # your org name
vakt config set runtime.coder.template  my-agent-tmpl   # your workspace template

# Route a server (or agent) to Coder
vakt runtime set my-coder coder
```

## Configuration reference

```json
// ~/.agents/config.json
{
  "runtime": {
    "coder": {
      "url":      "secret:CODER_URL",
      "token":    "secret:CODER_TOKEN",
      "org":      "default",
      "template": "my-agent-template",
      "ttl_ms":   0,
      "stop_after_session": false
    },
    "servers": {
      "my-coder": "coder"
    }
  }
}
```

`stop_after_session: false` (default) leaves the workspace running — the agent can re-attach on the next `vakt agent start`. Set to `true` to stop (not delete) after each session, saving compute costs while preserving workspace state.

## How to implement — `SandboxProvider` backend (issue #62)

The Coder REST API is well-documented and maps cleanly to the interface:

| `SandboxProvider` method | Coder API endpoint |
|--------------------------|-------------------|
| `create()` | `POST /api/v2/organizations/{org}/workspaces` (or find existing) |
| `exec()` | workspace agent PTY / exec endpoint (or `coder ssh <workspace> -- <cmd>`) |
| `writeFile()` | `coder ssh <workspace> -- tee <path>` / SFTP over workspace agent |
| `readFile()` | `coder ssh <workspace> -- cat <path>` |
| `destroy()` | `DELETE /api/v2/workspaces/{id}` (or just stop: `POST /api/v2/workspaces/{id}/builds` with `transition: stop`) |

```typescript
// src/lib/sandbox/coder.ts  (to be created — see issue #62)
import type { SandboxProvider, SandboxHandle, SandboxCreateOpts } from '../sandbox.ts';

export class CoderSandboxProvider implements SandboxProvider {
  readonly name = 'coder';

  constructor(
    private url: string,
    private token: string,
    private org: string,
    private template: string,
    private stopAfterSession = false,
  ) {}

  private headers() {
    return { 'Coder-Session-Token': this.token, 'Content-Type': 'application/json' };
  }

  async create(opts: SandboxCreateOpts): Promise<SandboxHandle> {
    // Try to find an existing stopped workspace first (re-attach pattern)
    const existing = await this.findExistingWorkspace(opts.name);
    if (existing) {
      await this.startWorkspace(existing.id);
      return { id: existing.id, raw: existing };
    }

    // Provision new workspace from template
    const res = await fetch(`${this.url}/api/v2/organizations/${this.org}/workspaces`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        name: opts.name ?? `vakt-agent-${crypto.randomUUID().slice(0, 8)}`,
        template_name: this.template,
        rich_parameter_values: opts.parameters ?? [],
        automatic_updates: 'never',
      }),
    });
    const workspace = await res.json();
    await this.waitForReady(workspace.id);
    return { id: workspace.id, raw: workspace };
  }

  async exec(handle: SandboxHandle, cmd: string[], env?: Record<string, string>) {
    // Use workspace agent exec API (WebSocket) or fall back to coder ssh
    // Full implementation uses the /api/v2/workspaceagents/{agent}/pty endpoint
  }

  async destroy(handle: SandboxHandle) {
    if (this.stopAfterSession) {
      // Stop (preserve state) rather than delete
      await fetch(`${this.url}/api/v2/workspaces/${handle.id}/builds`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ transition: 'stop' }),
      });
    } else {
      await fetch(`${this.url}/api/v2/workspaces/${handle.id}`, {
        method: 'DELETE',
        headers: this.headers(),
      });
    }
  }

  private async findExistingWorkspace(name?: string) {
    if (!name) return null;
    const res = await fetch(`${this.url}/api/v2/workspaces?name=${name}`, { headers: this.headers() });
    const { workspaces } = await res.json();
    return workspaces?.[0] ?? null;
  }
}
```

### Key implementation detail: re-attach vs create

Because Coder workspaces are persistent, `create()` should check for an existing stopped workspace with the same name and start it rather than provisioning a new one. This is the behaviour that makes Coder fundamentally different from the ephemeral backends — the workspace accumulates state (installed packages, git history, build caches) across sessions.

## Multi-agent and swarm workloads

Coder's persistent workspace model is a natural fit for multi-agent swarms — each agent gets its own workspace that survives between sessions, accumulating state (build caches, git history, installed packages) across the run. The multi-agent orchestration patterns themselves are **provider-agnostic** and documented at the `SandboxProvider` level in issue #62; nothing here is Coder-specific.

The one Coder-specific lever is `stop_after_session: true` — for scheduled swarms (nightly CI, weekly sprints) this stops workspaces after each run rather than deleting them, so workers re-attach to their existing state on the next invocation with no re-cloning.

```bash
vakt config set runtime.coder.stop_after_session true
```

## Workspace template recommendations

A good agent workspace template should:

1. **Clone the target repo on provisioning** — use `git clone` in the `startup_script`
2. **Install the toolchain** — Node, Python, Go, etc. in the base image or `startup_script`
3. **Pre-authenticate git** — inject a deploy key or PAT via Coder template variables (resolved from vakt secrets at template creation time, not stored in the workspace)
4. **Keep the workspace agent running** — the sidecar must stay alive for `exec` to work
5. **Expose a role label** — tag the workspace with its swarm role via a `coder_metadata` resource so the coordinator can filter workspaces by role without relying solely on name conventions

Minimal example template snippet:

```hcl
resource "coder_agent" "main" {
  os   = "linux"
  arch = "amd64"

  startup_script = <<-EOT
    git clone https://github.com/org/repo.git /home/coder/repo
    cd /home/coder/repo && npm install
  EOT
}

# Optional: expose role as workspace metadata for coordinator queries
resource "coder_metadata" "role" {
  resource_id = coder_agent.main.id
  item {
    key   = "swarm_role"
    value = var.swarm_role   # passed in as a Coder template parameter
  }
}
```

## Local testing without a Coder deployment

Option A — run Coder locally via Docker Compose (zero config):

```bash
# Single-node Coder server, uses bundled PostgreSQL
docker run --rm -it -p 7080:7080 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e CODER_PG_CONNECTION_URL="" \
  ghcr.io/coder/coder:latest server --in-memory

# First-run: open http://localhost:7080, create admin user
coder login http://localhost:7080

# Create a minimal Docker-based template
coder templates init --id docker
coder templates push docker-workspace --directory ./docker-workspace

# Set up vakt
vakt config set runtime.coder.url   http://localhost:7080
vakt config set runtime.coder.token "$(coder tokens create vakt --lifetime 24h)"
```

Option B — use the Docker backend (shares the same `SandboxProvider` interface):

```bash
vakt runtime set my-coder docker
bats tests/e2e/agent-docker.bats
```

## Running the e2e tests

```bash
# Full suite — requires CODER_URL + CODER_TOKEN
CODER_URL=http://localhost:7080 CODER_TOKEN=... bats tests/e2e/agent-coder.bats

# Without credentials — all live workspace tests skipped
bats tests/e2e/agent-coder.bats
```

See `tests/e2e/agent-coder.bats` for the full suite.
