// src/commands/sync.ts
import { join } from "node:path";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import type { Command } from "commander";
import { loadMcpConfig, loadAgentConfig, loadProviders, resolveProviderConfigPath, expandHome } from "../lib/config";
import { loadPolicy } from "../lib/policy";
import { AuditStore } from "../lib/audit";
import { resolveAll, formatForProvider, writeJsonConfig, writeTomlConfig, syncSkills } from "../lib/resolver";
import type { ResolvedConfig } from "../lib/resolver";
import type { Provider, McpConfig } from "../lib/schemas";
import type { Policy } from "../lib/schemas";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

const ok = (s: string) => console.log(`  ${green("✓")}  ${s}`);
const warn = (s: string) => console.log(`  ${yellow("⚠")}  ${s}`);
const info = (s: string) => console.log(`  ${cyan("→")}  ${s}`);
const err = (s: string) => console.log(`  ${red("✗")}  ${s}`);

function resolveCmd(cmd: string): string | null {
  // Use absolute paths for system lookup tools to avoid PATH-based resolution
  const lookup = process.platform === "win32"
    ? "C:\\Windows\\System32\\where.exe"
    : "/usr/bin/which";
  const result = spawnSync(lookup, [cmd], { encoding: "utf-8" });
  if (result.status !== 0) return null;
  return result.stdout.trim().split("\n")[0]?.trim() ?? null;
}

function isInstalled(cmd: string): boolean {
  return resolveCmd(cmd) !== null;
}

async function syncProviderMcp(
  provider: Provider,
  servers: Record<string, Record<string, unknown>>,
  dryRun: boolean,
): Promise<void> {
  if (provider.syncMethod === "cli") {
    // Claude Code: use `claude mcp add` CLI
    if (dryRun) { info(`[dry-run] Would run claude mcp add/remove`); return; }
    // Resolve absolute path to avoid PATH-based command injection
    const claudeBin = resolveCmd("claude");
    if (!claudeBin) { warn("claude not found, skipping CLI sync"); return; }

    let existing: string[] = [];
    const listResult = spawnSync(claudeBin, ["mcp", "list"], { encoding: "utf-8" });
    if (listResult.status === 0) {
      existing = (listResult.stdout ?? "").split("\n").map(l => l.split(":")[0]?.trim() ?? "").filter(Boolean);
    }

    for (const [name, server] of Object.entries(servers)) {
      if (existing.includes(name)) {
        spawnSync(claudeBin, ["mcp", "remove", name], { stdio: "ignore" });
      }
      const isHttp = "url" in server;
      if (isHttp) {
        spawnSync(claudeBin, ["mcp", "add", "--transport", "http", name, server["url"] as string], { stdio: "ignore" });
      } else {
        const cmd = server["command"] as string;
        const args = server["args"] as string[] ?? [];
        const envPairs = server["env"]
          ? Object.entries(server["env"] as Record<string, string>).flatMap(([k, v]) => ["-e", `${k}=${v}`])
          : [];
        spawnSync(claudeBin, ["mcp", "add", ...envPairs, name, cmd, ...args], { stdio: "ignore" });
      }
      ok(name);
    }
    return;
  }

  const configPath = resolveProviderConfigPath(provider);
  const serversKey = provider.configStructure.serversPropertyName;

  if (provider.configFormat === "json") {
    await writeJsonConfig(configPath, serversKey, servers, dryRun);
    if (!dryRun) ok(`wrote ${configPath}`);
    else info(`[dry-run] Would write ${configPath}`);
  } else if (provider.configFormat === "toml") {
    const serversFormat = provider.serversFormat ?? "record";
    await writeTomlConfig(configPath, serversKey, servers, serversFormat, dryRun);
    if (!dryRun) ok(`wrote ${configPath}`);
    else info(`[dry-run] Would write ${configPath}`);
  }
}

function checkRegistryPolicy(policy: Policy | null, mcpConfig: McpConfig): void {
  if (policy?.registryPolicy !== "registry-only") return;
  const unverified = Object.keys(mcpConfig).filter(
    name => !(mcpConfig[name] as any)["registry"]
  );
  if (unverified.length > 0) {
    err(`Sync blocked — policy is registry-only but these servers have no registry field: ${unverified.join(", ")}`);
    err(`Set policy.registryPolicy to "warn-unverified" or add a registry field to each server.`);
    process.exit(1);
  }
}

function applyProxyWrap(resolved: ResolvedConfig, withProxy: boolean): ResolvedConfig {
  if (!withProxy) return resolved;
  return Object.fromEntries(
    Object.entries(resolved).map(([name, server]) => {
      if (!("url" in server)) {
        return [name, { command: "vakt", args: ["proxy", name], env: (server as any).env }];
      }
      return [name, server];
    })
  ) as ResolvedConfig;
}

async function syncMcpServers(
  providers: Provider[],
  resolved: ResolvedConfig,
  allMissing: Record<string, string[]>,
  withProxy: boolean,
  dryRun: boolean
): Promise<void> {
  console.log(`\n${bold("── MCP Servers ─────────────────────────────────────────────")}`);

  // Print each missing-secret warning once, before iterating providers
  const warnedSecrets = new Set<string>();
  for (const keys of Object.values(allMissing)) {
    for (const k of keys) {
      if (!warnedSecrets.has(k)) {
        warn(`secret '${k}' not found — set it with: vakt secrets set ${k}`);
        warnedSecrets.add(k);
      }
    }
  }

  for (const provider of providers) {
    console.log(`\n  ${bold(provider.displayName)}`);
    if (!isInstalled(provider.detectCommand)) {
      warn(`${provider.detectCommand} not found, skipping`);
      continue;
    }

    const serversForProvider = applyProxyWrap(resolved, withProxy);
    const formatted = formatForProvider(serversForProvider as typeof resolved, provider);
    try {
      await syncProviderMcp(provider, formatted, dryRun);
      if (!dryRun) ok(`synced to ${provider.displayName}`);
    } catch (e) {
      err(`sync failed for ${provider.displayName}: ${e}`);
    }
  }
}

async function syncSkillsToProviders(
  providers: Provider[],
  agentsDir: string,
  dryRun: boolean
): Promise<void> {
  console.log(`\n${bold("── Skills ──────────────────────────────────────────────────")}`);
  const skillsSource = join(agentsDir, "skills");

  for (const provider of providers) {
    if (!isInstalled(provider.detectCommand)) continue;
    if (provider.skills.method === "native") {
      info(`${provider.displayName} reads ${skillsSource} natively`);
      continue;
    }
    const platformSkillsPath = typeof provider.skills.path === "string"
      ? provider.skills.path
      : (provider.skills.path as Record<string, string>)[process.platform] ?? "";
    const skillsTarget = expandHome(platformSkillsPath);

    if (!skillsTarget) continue;
    console.log(`\n  ${bold(provider.displayName)}  ${dim(`(${skillsTarget})`)}`);
    const { linked, skipped, errors } = syncSkills(skillsSource, skillsTarget, dryRun);
    for (const s of linked) ok(`linked skill: ${s}`);
    for (const s of skipped) info(`skipped (exists): ${s}`);
    for (const e of errors) err(e);
  }
}

export function registerSync(program: Command): void {
  program
    .command("sync")
    .description("Sync MCP servers and skills to all providers")
    .option("--dry-run", "Preview changes without applying")
    .option("--mcp-only", "Sync MCP servers only")
    .option("--skills-only", "Sync skills only")
    .option("--with-proxy", "Route provider configs through vakt proxy for runtime policy + audit (opt-in)")
    .action(async (opts: { dryRun?: boolean; mcpOnly?: boolean; skillsOnly?: boolean; withProxy?: boolean }) => {
      const dryRun = opts.dryRun ?? false;
      const mcpOnly = opts.mcpOnly ?? false;
      const skillsOnly = opts.skillsOnly ?? false;
      const withProxy = opts.withProxy ?? false;

      const agentsDir = (await import("../lib/config")).AGENTS_DIR;
      if (!existsSync(agentsDir)) {
        console.error("Run 'vakt init' first");
        process.exit(1);
      }
      console.log();
      console.log(bold("vakt sync"));
      console.log(dim(`Source: ${agentsDir}`));
      if (dryRun) console.log(yellow("DRY RUN — no changes will be made"));

      const mcpConfig = loadMcpConfig();
      const policy = loadPolicy();
      checkRegistryPolicy(policy, mcpConfig);

      const userConfig = loadAgentConfig();
      const allProviders = loadProviders();

      const enabledProviders = userConfig.providers
        .map(id => allProviders[id])
        .filter((p): p is Provider => p !== undefined);

      if (!skillsOnly) {
        const { resolved, allMissing } = await resolveAll(mcpConfig, userConfig.paths);
        await syncMcpServers(enabledProviders, resolved, allMissing, withProxy, dryRun);
      }

      if (!mcpOnly) {
        await syncSkillsToProviders(enabledProviders, agentsDir, dryRun);
      }

      // Record sync event in audit log
      try {
        const auditStore = new AuditStore();
        auditStore.init();
        auditStore.recordSync({
          providers: enabledProviders.map((p: Provider) => p.id),
          servers: Object.keys(mcpConfig),
          dryRun,
        });
      } catch { /* audit failures are non-fatal */ }

      console.log();
      console.log(bold("── Summary ─────────────────────────────────────────────────"));
      if (dryRun) console.log(`  ${yellow("Dry run complete — no changes made.")}`);
      else console.log(`  ${green("Sync complete.")}`);
      console.log();
    });
}
