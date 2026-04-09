// src/commands/sync.ts
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import type { Command } from "commander";
import { loadMcpConfig, loadAgentConfig, loadProviders, resolveProviderConfigPath, expandHome, AGENTS_DIR } from "../lib/config";
import { isSkillClassified, setSkillGlobal, isGitRepo, fetchAndCheckSkill, pullSkill } from "../lib/skills";
import { collectGateIssues } from "../lib/sync-gate";
import { promptBoolean } from "../lib/prompt";
import { loadPolicy } from "../lib/policy";
import { makePermissionsAdapter } from "../lib/permissions";
import { syncPolicyHooks } from "../lib/policy-hooks";
import { AuditStore } from "../lib/audit";
import { resolveAll, formatForProvider, writeJsonConfig, writeTomlConfig, syncSkills } from "../lib/resolver";
import type { ResolvedConfig } from "../lib/resolver";
import type { Provider, McpConfig } from "../lib/schemas";
import type { Policy } from "../lib/schemas";

function loadRawMcpConfigEntries(agentsDir: string): Record<string, unknown> {
  const configPath = join(agentsDir, "mcp-config.json");
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function getUnclassifiedServers(agentsDir: string): string[] {
  const raw = loadRawMcpConfigEntries(agentsDir);
  return Object.entries(raw)
    .filter(([k, v]) => !k.startsWith("_") && typeof v === "object" && v !== null && !("global" in v))
    .map(([k]) => k);
}

export function getUnclassifiedSkills(agentsDir: string): string[] {
  const skillsDir = join(agentsDir, "skills");
  if (!existsSync(skillsDir)) return [];
  try {
    return readdirSync(skillsDir).filter(entry => {
      const skillPath = join(skillsDir, entry);
      return statSync(skillPath).isDirectory() && !isSkillClassified(skillPath);
    });
  } catch {
    return [];
  }
}

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
  const result = spawnSync(lookup, [cmd], { encoding: "utf-8" }); // NOSONAR — uses absolute path for lookup command
  if (result.status !== 0) return null;
  return result.stdout.trim().split("\n")[0]?.trim() ?? null;
}

function isInstalled(cmd: string): boolean {
  return resolveCmd(cmd) !== null;
}

function syncSingleServer(
  claudeBin: string,
  name: string,
  server: Record<string, unknown>,
  existing: string[],
): void {
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
}

async function syncViaCliProvider(
  servers: Record<string, Record<string, unknown>>,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) { info(`[dry-run] Would run claude mcp add/remove`); return; }
  const claudeBin = resolveCmd("claude");
  if (!claudeBin) { warn("claude not found, skipping CLI sync"); return; }

  let existing: string[] = [];
  const listResult = spawnSync(claudeBin, ["mcp", "list"], { encoding: "utf-8" });
  if (listResult.status === 0) {
    existing = (listResult.stdout ?? "").split("\n").map(l => l.split(":")[0]?.trim() ?? "").filter(Boolean);
  }

  for (const [name, server] of Object.entries(servers)) {
    syncSingleServer(claudeBin, name, server, existing);
    ok(name);
  }
}

async function syncProviderMcp(
  provider: Provider,
  servers: Record<string, Record<string, unknown>>,
  dryRun: boolean,
): Promise<void> {
  if (provider.syncMethod === "cli") {
    await syncViaCliProvider(servers, dryRun);
    return;
  }

  const configPath = resolveProviderConfigPath(provider);
  const serversKey = provider.configStructure.serversPropertyName;

  if (provider.configFormat === "json") {
    await writeJsonConfig(configPath, serversKey, servers, dryRun);
    if (dryRun) info(`[dry-run] Would write ${configPath}`);
    else ok(`wrote ${configPath}`);
  } else if (provider.configFormat === "toml") {
    const serversFormat = provider.serversFormat ?? "record";
    await writeTomlConfig(configPath, serversKey, servers, serversFormat, dryRun);
    if (dryRun) info(`[dry-run] Would write ${configPath}`);
    else ok(`wrote ${configPath}`);
  }
}

export function filterGlobal(mcpConfig: McpConfig): McpConfig {
  return Object.fromEntries(
    Object.entries(mcpConfig).filter(([, server]) => server.global === true)
  );
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

function logPermissionsResult(result: import("../lib/permissions").PermissionsResult, dryRun: boolean): void {
  for (const w of result.warnings) warn(w);
  const allowSuffix = result.allow.length > 0 ? `  allow: ${result.allow.length}` : "";
  const denySuffix  = result.deny.length  > 0 ? `  deny: ${result.deny.length}`   : "";
  if (dryRun) {
    info(`[dry-run] Would write ${result.path}${allowSuffix}${denySuffix}`);
  } else {
    ok(`wrote ${result.path}${dim(allowSuffix)}${dim(denySuffix)}`);
  }
}

function syncProviderPermissions(
  provider: Provider,
  allow: import("../lib/schemas").ToolPermission[],
  deny: import("../lib/schemas").ToolPermission[],
  dryRun: boolean,
): void {
  if (!isInstalled(provider.detectCommand)) {
    warn(`${provider.detectCommand} not found, skipping`);
    return;
  }
  if (!provider.permissionsPath || !provider.permissionsFormat) {
    warn(
      `policy.tools is set but ${provider.displayName} has no permissions config target — ` +
      `proxy (layer 1) is the only enforcement path for this provider`,
    );
    return;
  }
  const platformPath = provider.permissionsPath[process.platform as "darwin" | "linux" | "win32"];
  if (!platformPath) {
    warn(`no permissionsPath for platform ${process.platform}, skipping`);
    return;
  }
  const result = makePermissionsAdapter(provider.permissionsFormat, platformPath).apply(allow, deny, dryRun);
  logPermissionsResult(result, dryRun);
}

function syncProviderHooks(provider: Provider, policy: Policy | null, dryRun: boolean): void {
  if (!isInstalled(provider.detectCommand)) return;
  
  const result = syncPolicyHooks(
    provider.id as "claude" | "cursor" | "gemini" | "codex" | "windsurf" | "vibe" | "opencode",
    policy,
    dryRun
  );
  
  if (result.action === "skipped") return;
  
  const actionStr = {
    created: "created",
    updated: "updated", 
    removed: "removed",
    "dry-run": "[dry-run] would update",
    skipped: "skipped"
  }[result.action];
  
  if (dryRun && result.action === "dry-run") {
    info(`[dry-run] Would update hook: ${result.path}`);
  } else if (result.written) {
    ok(`${actionStr} policy context: ${result.path}`);
  }
}

function syncPermissions(providers: Provider[], policy: Policy | null, dryRun: boolean): void {
  const allow = policy?.tools?.allow ?? [];
  const deny  = policy?.tools?.deny  ?? [];
  if (allow.length + deny.length === 0) return;

  console.log(`\n${bold("── Permissions ─────────────────────────────────────────────")}`);
  for (const provider of providers) {
    console.log(`\n  ${bold(provider.displayName)}`);
    syncProviderPermissions(provider, allow, deny, dryRun);
    syncProviderHooks(provider, policy, dryRun);
  }
}

async function syncSkillsToProviders(
  providers: Provider[],
  agentsDir: string,
  dryRun: boolean,
  globalOnly = true,
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
    const { linked, skipped, errors } = syncSkills(skillsSource, skillsTarget, dryRun, globalOnly);
    for (const s of linked) ok(`linked skill: ${s}`);
    for (const s of skipped) info(`skipped (exists): ${s}`);
    for (const e of errors) err(e);
  }
}

async function handleSkillUpdate(entry: string, realPath: string, dryRun: boolean): Promise<void> {
  const updateInfo = fetchAndCheckSkill(realPath);
  if (!updateInfo) return;

  const { behind, filesSummary } = updateInfo;
  const commits = behind === 1 ? "1 new commit" : `${behind} new commits`;

  if (dryRun) {
    info(`[dry-run] Skill '${entry}' is ${commits} behind upstream (${filesSummary})`);
    return;
  }

  const doUpdate = await promptBoolean(
    `  Skill '${entry}' has ${commits} upstream (${filesSummary}). Update?`
  );
  if (doUpdate) {
    const succeeded = pullSkill(realPath);
    if (succeeded) ok(`updated skill: ${entry}`);
    else err(`git pull failed for skill: ${entry}`);
  } else {
    info(`skipped: ${entry}`);
  }
}

export async function refreshSkills(agentsDir: string, dryRun: boolean): Promise<void> {
  const skillsDir = join(agentsDir, "skills");
  if (!existsSync(skillsDir)) return;

  let anyChecked = false;
  for (const entry of readdirSync(skillsDir)) {
    const skillPath = join(skillsDir, entry);
    let realPath: string;
    try {
      realPath = realpathSync(skillPath); // NOSONAR — path comes from readdirSync of a known directory
    } catch {
      realPath = skillPath;
    }
    if (!isGitRepo(realPath)) continue;

    anyChecked = true;
    await handleSkillUpdate(entry, realPath, dryRun);
  }

  if (!anyChecked) return;
}

async function promptUnclassifiedResources(agentsDir: string): Promise<void> {
  const unclassifiedServers = getUnclassifiedServers(agentsDir);
  const unclassifiedSkills = getUnclassifiedSkills(agentsDir);

  if (unclassifiedServers.length === 0 && unclassifiedSkills.length === 0) return;

  console.log(`\n${yellow("⚠")}  Unclassified resources found — please classify each:`);

  if (unclassifiedServers.length > 0) {
    const configPath = join(agentsDir, "mcp-config.json");
    const rawConfig = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, Record<string, unknown>>;
    for (const name of unclassifiedServers) {
      const isGlobal = await promptBoolean(`  Server '${name}': sync globally to all providers?`);
      rawConfig[name]!["global"] = isGlobal;
    }
    writeFileSync(configPath, JSON.stringify(rawConfig, null, 2) + "\n");
  }

  if (unclassifiedSkills.length > 0) {
    const skillsDirPath = join(agentsDir, "skills");
    for (const skill of unclassifiedSkills) {
      const skillPath = join(skillsDirPath, skill);
      const isGlobal = await promptBoolean(`  Skill '${skill}': sync globally to all providers?`);
      setSkillGlobal(skillPath, isGlobal);
    }
  }
}

type GateIssue = ReturnType<typeof collectGateIssues>["issues"][number];

function printIssueGroup(heading: string, issues: GateIssue[]): void {
  if (issues.length === 0) return;
  console.log(`\n  ${bold(heading)}`);
  for (const issue of issues) {
    const icon = issue.severity === "error" ? red("✗") : yellow("⚠");
    console.log(`  ${icon}  ${bold(issue.name)}  ${dim(issue.code)}  ${dim(issue.detail)}`); // NOSONAR — intentional CLI output of local config scan
  }
}

function pluralCount(n: number, word: string): string {
  if (n <= 0) return "";
  const suffix = n > 1 ? "s" : "";
  return `${n} ${word}${suffix}`;
}

function printGateIssues(gate: ReturnType<typeof collectGateIssues>): void {
  printIssueGroup("Skills",      gate.issues.filter(i => i.source === "skill"));
  printIssueGroup("MCP Servers", gate.issues.filter(i => i.source === "mcp"));

  const errCount  = gate.issues.filter(i => i.severity === "error").length;
  const warnCount = gate.issues.filter(i => i.severity === "warn").length;
  const summary   = [pluralCount(errCount, "error"), pluralCount(warnCount, "warning")]
    .filter(Boolean).join(", ");
  console.log(`\n  ${summary} found.`);
}

async function runSafetyGate(
  agentsDir: string,
  mcpConfig: import("../lib/schemas").McpConfig,
  policy: Policy | null,
  opts: { mcpOnly: boolean; skillsOnly: boolean; ci: boolean },
): Promise<boolean> {
  const gateSkillsDir = opts.mcpOnly ? "" : join(agentsDir, "skills");
  const gateMcpConfig = opts.skillsOnly ? {} as import("../lib/schemas").McpConfig : mcpConfig;
  const gate = collectGateIssues(gateSkillsDir, gateMcpConfig, policy);
  if (gate.issues.length === 0) return true;

  console.log(`\n${bold("── Pre-sync Safety Check ────────────────────────────────────")}`);
  printGateIssues(gate);

  if (gate.hasErrors) {
    if (opts.ci) { err("Sync blocked — fix errors or use --force to bypass."); return false; }
    const proceed = await promptBoolean("  Proceed with sync anyway?");
    if (!proceed) { console.log("  Aborted."); return false; }
  } else if (gate.hasWarnings && !opts.ci) {
    const proceed = await promptBoolean("  Proceed with sync?");
    if (!proceed) { console.log("  Aborted."); return false; }
  }
  return true;
}

async function syncSkillPhase(
  providers: Provider[],
  agentsDir: string,
  dryRun: boolean,
  all: boolean,
  noUpdateSkills: boolean,
): Promise<void> {
  if (!noUpdateSkills) {
    console.log(`\n${bold("── Skill Updates ───────────────────────────────────────────")}`);
    await refreshSkills(agentsDir, dryRun);
  }
  await syncSkillsToProviders(providers, agentsDir, dryRun, !all);
}

function recordSyncAudit(
  providers: Provider[],
  mcpConfig: import("../lib/schemas").McpConfig,
  dryRun: boolean,
): void {
  try {
    const auditStore = new AuditStore();
    auditStore.init();
    auditStore.recordSync({
      providers: providers.map((p: Provider) => p.id),
      servers: Object.keys(mcpConfig),
      dryRun,
    });
  } catch { /* audit failures are non-fatal */ }
}

export function registerSync(program: Command): void {
  program
    .command("sync")
    .description("Sync MCP servers and skills to all providers")
    .option("--dry-run", "Preview changes without applying")
    .option("--mcp-only", "Sync MCP servers only")
    .option("--skills-only", "Sync skills only")
    .option("--with-proxy", "Route provider configs through vakt proxy for runtime policy + audit (opt-in)")
    .option("--all", "Sync all resources including local-only (default: global only)")
    .option("--no-update-skills", "Skip checking for upstream skill updates")
    .option("--ci", "Non-interactive: gate errors block sync (exit 1), warnings pass")
    .option("--force", "Skip pre-sync safety gate entirely")
    .action(async (opts: { dryRun?: boolean; mcpOnly?: boolean; skillsOnly?: boolean; withProxy?: boolean; all?: boolean; updateSkills?: boolean; ci?: boolean; force?: boolean }) => {
      const dryRun = opts.dryRun ?? false;
      const mcpOnly = opts.mcpOnly ?? false;
      const skillsOnly = opts.skillsOnly ?? false;
      const withProxy = opts.withProxy ?? false;
      const all = opts.all ?? false;
      const noUpdateSkills = opts.updateSkills === false;
      const ci = opts.ci ?? false;
      const force = opts.force ?? false;

      const agentsDir = AGENTS_DIR;
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

      // ── Pre-sync safety gate ──────────────────────────────────────────────
      if (!force && !dryRun) {
        const ok_ = await runSafetyGate(agentsDir, mcpConfig, policy, { mcpOnly, skillsOnly, ci });
        if (!ok_) process.exit(1);
      }

      // Prompt for unclassified resources (only when not --all and not --dry-run)
      if (!all && !dryRun) {
        await promptUnclassifiedResources(agentsDir);
      }

      const userConfig = loadAgentConfig();
      const allProviders = loadProviders();

      const enabledProviders = userConfig.providers
        .map(id => allProviders[id])
        .filter((p): p is Provider => p !== undefined);

      if (!skillsOnly) {
        const configToSync = all ? mcpConfig : filterGlobal(mcpConfig);
        const { resolved, allMissing } = await resolveAll(configToSync, userConfig.paths);
        await syncMcpServers(enabledProviders, resolved, allMissing, withProxy, dryRun);
      }

      syncPermissions(enabledProviders, policy, dryRun);

      if (!mcpOnly) {
        await syncSkillPhase(enabledProviders, agentsDir, dryRun, all, noUpdateSkills);
      }

      recordSyncAudit(enabledProviders, mcpConfig, dryRun);

      console.log();
      console.log(bold("── Summary ─────────────────────────────────────────────────"));
      if (dryRun) console.log(`  ${yellow("Dry run complete — no changes made.")}`);
      else console.log(`  ${green("Sync complete.")}`);
      console.log();
    });
}
