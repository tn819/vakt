import { join } from "path";
import { existsSync, readFileSync } from "fs";
import {
  AgentConfigSchema, McpConfigSchema, ProvidersSchema,
  type AgentConfig, type McpConfig, type Providers, type Provider,
} from "./schemas";

export const AGENTS_DIR = process.env["AGENTS_DIR"] ?? join(process.env["HOME"] ?? "~", ".agents");

export function loadAgentConfig(): AgentConfig {
  const path = join(AGENTS_DIR, "config.json");
  if (!existsSync(path)) return AgentConfigSchema.parse({});
  return AgentConfigSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
}

export function loadMcpConfig(): McpConfig {
  const path = join(AGENTS_DIR, "mcp-config.json");
  if (!existsSync(path)) return {};
  return McpConfigSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
}

export function loadProviders(): Providers {
  const path = join(import.meta.dir, "..", "providers.json");
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  const filtered = Object.fromEntries(
    Object.entries(raw).filter(([k]) => !k.startsWith("$") && !k.startsWith("_"))
  );
  return ProvidersSchema.parse(filtered);
}

/** Expand {{paths.code}} style templates */
export function expandPaths(value: string, paths: Record<string, string>): string {
  return value.replace(/\{\{paths\.(\w+)\}\}/g, (_, key: string) => {
    const val = paths[key] ?? "";
    return val.startsWith("~") ? join(process.env["HOME"] ?? "~", val.slice(1)) : val;
  });
}

/** Expand ~ to $HOME in a path string */
export function expandHome(value: string): string {
  return value.startsWith("~")
    ? join(process.env["HOME"] ?? "~", value.slice(1))
    : value.replace(/^\$HOME/, process.env["HOME"] ?? "~");
}

/** Resolve provider config path for current platform */
export function resolveProviderConfigPath(provider: Provider): string {
  const platform = process.platform;
  const raw =
    (provider.configPath[platform] ?? provider.configPath["linux"]) ?? "";
  return expandHome(raw.replace("$HOME", process.env["HOME"] ?? "~"));
}
