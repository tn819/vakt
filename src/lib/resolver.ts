import { join, dirname } from "node:path";
import { existsSync, mkdirSync, symlinkSync, readdirSync, lstatSync, readFileSync } from "node:fs";
import { parse as parseToml } from "smol-toml";
import type { McpConfig, McpServer, Provider, StdioServer, HttpServer } from "./schemas";
import { expandPaths } from "./config";
import { resolveSecretRefs } from "./secrets";

export type ResolvedServer = McpServer;
export type ResolvedConfig = Record<string, ResolvedServer>;

export async function resolveServer(
  _name: string,
  server: McpServer,
  paths: Record<string, string>
): Promise<{ server: ResolvedServer; missing: string[] }> {
  const missing: string[] = [];

  async function resolveValue(v: string): Promise<string> {
    const expanded = expandPaths(v, paths);
    const { resolved, missing: m } = await resolveSecretRefs(expanded);
    missing.push(...m);
    return resolved;
  }

  async function resolveRecord(rec: Record<string, string>): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(rec)) out[k] = await resolveValue(v);
    return out;
  }

  if ("transport" in server && server.transport === "http") {
    const s = server as HttpServer;
    return {
      server: {
        transport: "http",
        url: await resolveValue(s.url),
        ...(s.headers ? { headers: await resolveRecord(s.headers) } : {}),
      },
      missing,
    };
  }

  const s = server as StdioServer;
  return {
    server: {
      command: s.command,
      ...(s.args ? { args: s.args } : {}),
      ...(s.env ? { env: await resolveRecord(s.env) } : {}),
      ...(s.cwd ? { cwd: await resolveValue(s.cwd) } : {}),
    },
    missing,
  };
}

export async function resolveAll(
  config: McpConfig,
  paths: Record<string, string>
): Promise<{ resolved: ResolvedConfig; allMissing: Record<string, string[]> }> {
  const resolved: ResolvedConfig = {};
  const allMissing: Record<string, string[]> = {};
  for (const [name, server] of Object.entries(config)) {
    const { server: r, missing } = await resolveServer(name, server, paths);
    resolved[name] = r;
    if (missing.length > 0) allMissing[name] = missing;
  }
  return { resolved, allMissing };
}

function formatServer(
  _name: string,
  server: ResolvedServer,
  provider: Provider
): Record<string, unknown> {
  const { stdioPropertyMapping: sm, httpPropertyMapping: hm } = provider.configStructure;
  const isHttp = "transport" in server && (server as HttpServer).transport === "http";

  if (isHttp && hm) {
    const s = server as HttpServer;
    const out: Record<string, unknown> = {};
    if (hm.typeProperty && hm.typeValue) out[hm.typeProperty] = hm.typeValue;
    if (hm.urlProperty) out[hm.urlProperty] = s.url;
    if (hm.headersProperty && s.headers) out[hm.headersProperty] = s.headers;
    return out;
  }

  if (!isHttp && sm) {
    const s = server as StdioServer;
    const out: Record<string, unknown> = {};
    if (sm.typeProperty && sm.typeValue) out[sm.typeProperty] = sm.typeValue;
    if (sm.commandProperty && sm.commandProperty === sm.argsProperty) {
      out[sm.commandProperty] = [s.command, ...(s.args ?? [])];
    } else {
      if (sm.commandProperty) out[sm.commandProperty] = s.command;
      if (sm.argsProperty && s.args?.length) out[sm.argsProperty] = s.args;
    }
    if (sm.envProperty && s.env) out[sm.envProperty] = s.env;
    if (s.cwd) out["cwd"] = s.cwd;
    return out;
  }

  return server as unknown as Record<string, unknown>;
}

export function formatForProvider(
  resolved: ResolvedConfig,
  provider: Provider
): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(resolved).map(([name, server]) => [name, formatServer(name, server, provider)])
  );
}

export async function writeJsonConfig(
  filePath: string,
  serversKey: string,
  servers: Record<string, Record<string, unknown>>,
  dryRun: boolean
): Promise<void> {
  let existing: Record<string, unknown> = {};
  if (existsSync(filePath)) {
    existing = JSON.parse(await Bun.file(filePath).text());
  }
  existing[serversKey] = servers;
  const content = JSON.stringify(existing, null, 2) + "\n";
  if (!dryRun) {
    mkdirSync(dirname(filePath), { recursive: true });
    await Bun.write(filePath, content);
  }
}

export function readTomlConfig(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  try { return parseToml(readFileSync(filePath, "utf-8")) as Record<string, unknown>; }
  catch { return {}; }
}

export function toToml(data: Record<string, unknown>, _indent = 0): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === "string") lines.push(`${k} = ${JSON.stringify(v)}`);
    else if (typeof v === "number" || typeof v === "boolean") lines.push(`${k} = ${v}`);
    else if (Array.isArray(v)) lines.push(`${k} = ${JSON.stringify(v)}`);
    else if (v && typeof v === "object") {
      lines.push(`\n[${k}]`);
      lines.push(toToml(v as Record<string, unknown>));
    }
  }
  return lines.join("\n");
}

/**
 * Serialise a record of servers as TOML array-of-tables.
 * Each entry gets a `name` field injected from the record key.
 *
 *   [[mcp_servers]]
 *   name = "github"
 *   transport = "stdio"
 *   ...
 */
export function toTomlArrayOfTables(
  key: string,
  servers: Record<string, Record<string, unknown>>
): string {
  return Object.entries(servers)
    .map(([name, fields]) => {
      const lines = [`[[${key}]]`, `name = ${JSON.stringify(name)}`];
      for (const [k, v] of Object.entries(fields)) {
        if (typeof v === "string") lines.push(`${k} = ${JSON.stringify(v)}`);
        else if (typeof v === "number" || typeof v === "boolean") lines.push(`${k} = ${v}`);
        else if (Array.isArray(v)) lines.push(`${k} = ${JSON.stringify(v)}`);
        else if (v && typeof v === "object") lines.push(`${k} = ${JSON.stringify(v)}`); // inline table
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

/**
 * Write MCP server config to a TOML file, preserving existing non-server keys.
 * Supports both record format ([mcp_servers.name]) and array-of-tables ([[mcp_servers]]).
 */
export async function writeTomlConfig(
  filePath: string,
  serversKey: string,
  servers: Record<string, Record<string, unknown>>,
  serversFormat: "record" | "array",
  dryRun: boolean
): Promise<void> {
  const existing = readTomlConfig(filePath) as Record<string, unknown>;
  let content: string;

  if (serversFormat === "array") {
    // Rebuild file: all non-server keys first, then the array-of-tables block
    const rest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(existing)) {
      if (k !== serversKey) rest[k] = v;
    }
    const parts: string[] = [];
    if (Object.keys(rest).length > 0) parts.push(toToml(rest));
    if (Object.keys(servers).length > 0) parts.push(toTomlArrayOfTables(serversKey, servers));
    content = parts.join("\n\n") + "\n";
  } else {
    existing[serversKey] = servers;
    content = toToml(existing) + "\n";
  }

  if (!dryRun) {
    mkdirSync(dirname(filePath), { recursive: true });
    await Bun.write(filePath, content);
  }
}

export function syncSkills(
  skillsSource: string,
  skillsTarget: string,
  dryRun: boolean
): { linked: string[]; skipped: string[]; errors: string[] } {
  const linked: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  if (!existsSync(skillsSource)) return { linked, skipped, errors };
  if (!dryRun) mkdirSync(skillsTarget, { recursive: true });

  for (const entry of readdirSync(skillsSource)) {
    const dest = join(skillsTarget, entry);
    const src = join(skillsSource, entry);
    if (existsSync(dest)) { skipped.push(entry); continue; }
    if (!dryRun) {
      try { symlinkSync(src, dest); linked.push(entry); }
      catch (e) { errors.push(`${entry}: ${e}`); }
    } else {
      linked.push(`[dry-run] Would link: ${entry}`);
    }
  }
  return { linked, skipped, errors };
}
