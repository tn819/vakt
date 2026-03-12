import type { AgentConfig } from "./schemas";
import { resolveSecretRefs } from "./secrets";

export type RuntimeBackend = "local" | "e2b";

export function getRuntimeForServer(name: string, config: AgentConfig): RuntimeBackend {
  return (config.runtime?.servers?.[name] ?? config.runtime?.default ?? "local") as RuntimeBackend;
}

export async function resolvedE2BApiKey(config: AgentConfig): Promise<string | null> {
  const key = config.runtime?.e2b?.api_key;
  if (!key) return null;
  const { resolved } = await resolveSecretRefs(key);
  return resolved;
}

/** Start an MCP server in an E2B cloud sandbox. Returns the sandbox ID. */
export async function startServerInE2B(opts: {
  serverName: string;
  command:    string;
  args:       string[];
  env:        Record<string, string>;
  apiKey:     string;
  template?:  string;
}): Promise<{ sandboxId: string }> {
  // Lazy-load E2B SDK — only incurred if actually routing to cloud
  const { Sandbox } = await import("@e2b/code-interpreter");

  const sandbox = await Sandbox.create(opts.template ?? "base", { apiKey: opts.apiKey });

  const envStr = Object.entries(opts.env)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ");
  const cmd = [opts.command, ...opts.args].join(" ");
  await sandbox.commands.run(`${envStr} ${cmd}`, { background: true });

  return { sandboxId: sandbox.sandboxId };
}

export async function stopSandbox(sandboxId: string, apiKey: string): Promise<void> {
  const { Sandbox } = await import("@e2b/code-interpreter");
  await Sandbox.kill(sandboxId, { apiKey });
}
