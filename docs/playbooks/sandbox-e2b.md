---
provider: e2b
status: partial — runtime.ts integrated; agent lifecycle pending (#62)
---

# Sandbox Playbook — E2B

E2B runs Firecracker microVMs tuned for AI agent workloads. It is the **only cloud sandbox backend already integrated** in vakt (`src/lib/runtime.ts`). This playbook covers local development, configuration, and testing.

## How it works in vakt today

```
vakt runtime set <server> e2b
         │
         ▼
src/lib/runtime.ts → startServerInE2B()
         │
         ▼
@e2b/code-interpreter SDK → Firecracker microVM
         │
   MCP server process runs inside VM
   stdio tunnelled back to vakt proxy
```

The SDK is lazy-loaded — it is never imported unless an E2B runtime is actually used.

## Prerequisites

| Requirement | Check |
|-------------|-------|
| E2B account | https://e2b.dev — free tier available |
| API key | Dashboard → API Keys |
| `@e2b/code-interpreter` | already in `package.json` (v2.3.3) |

## Local setup

```bash
# Store the API key in your keychain (never in a file)
vakt secrets set E2B_API_KEY e2b_...

# Wire the key into your vakt config
vakt config set runtime.e2b.api_key secret:E2B_API_KEY

# Route a specific server to E2B
vakt runtime set github e2b

# Confirm routing
vakt runtime list
# github   → e2b
# others   → local
```

## Optional: custom sandbox template

E2B lets you pre-bake a sandbox image with your toolchain already installed (Node, Python, Go, etc.), cutting cold-start time significantly.

```bash
# Build and push a custom template via the E2B CLI
npm install -g @e2b/cli
e2b template build --name my-agent-template

# Tell vakt to use it
vakt config set runtime.e2b.template my-agent-template
```

## Configuration reference

```json
// ~/.agents/config.json
{
  "runtime": {
    "default": "local",
    "e2b": {
      "api_key": "secret:E2B_API_KEY",
      "template": "base"
    },
    "servers": {
      "github": "e2b",
      "filesystem": "local"
    }
  }
}
```

## How to implement — `SandboxProvider` backend (issue #62)

The existing `startServerInE2B` in `src/lib/runtime.ts` starts a single server process. Extending it to the full `SandboxProvider` interface requires:

1. **Expose workspace operations** — `writeFile`, `readFile`, `exec` via the `Sandbox` object the SDK already returns
2. **Persist the sandbox handle** — store `sandbox.sandboxId` so subsequent tool calls reuse the same VM rather than creating a new one per call
3. **Graceful shutdown** — call `sandbox.kill()` in `destroy()`; hook into SIGTERM in the daemon

```typescript
// src/lib/sandbox/e2b.ts  (to be created — see issue #62)
import type { SandboxProvider, SandboxHandle, SandboxCreateOpts } from '../sandbox.ts';

export class E2BSandboxProvider implements SandboxProvider {
  readonly name = 'e2b';

  async create(opts: SandboxCreateOpts): Promise<SandboxHandle> {
    const { Sandbox } = await import('@e2b/code-interpreter');
    const sandbox = await Sandbox.create({
      apiKey: opts.env.E2B_API_KEY,
      template: opts.template ?? 'base',
    });
    return { id: sandbox.sandboxId, raw: sandbox };
  }

  async exec(handle: SandboxHandle, cmd: string[], env?: Record<string, string>) {
    return handle.raw.commands.run(cmd.join(' '), { envs: env });
  }

  async writeFile(handle: SandboxHandle, path: string, content: string) {
    await handle.raw.files.write(path, content);
  }

  async readFile(handle: SandboxHandle, path: string): Promise<string> {
    return handle.raw.files.read(path);
  }

  async destroy(handle: SandboxHandle) {
    await handle.raw.kill();
  }
}
```

## Local testing without an E2B account

Use the Docker local backend (see `sandbox-docker.md`) as a drop-in substitute during development. The `SandboxProvider` interface is identical.

## Running the e2e tests

```bash
# Requires E2B_API_KEY in the environment (or secrets.env)
E2B_API_KEY=e2b_... bats tests/e2e/agent-e2b.bats

# Without a key — tests that require live API calls are skipped automatically
bats tests/e2e/agent-e2b.bats
```

See `tests/e2e/agent-e2b.bats` for the full suite.
