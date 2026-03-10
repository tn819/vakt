// src/commands/sync.ts
import { join } from "path";
import { existsSync } from "fs";
import { execSync } from "child_process";
import type { Command } from "commander";
import { loadMcpConfig, loadAgentConfig, loadProviders, resolveProviderConfigPath, expandHome } from "../lib/config";
import { resolveAll, formatForProvider, writeJsonConfig, toToml, syncSkills } from "../lib/resolver";
import type { Provider } from "../lib/schemas";

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

function isInstalled(cmd: string): boolean {
  try { execSync(`command -v ${cmd}`, { stdio: "ignore" }); return true; }
  catch { return false; }
}

async function syncProviderMcp(
  provider: Provider,
  servers: Record<string, Record<string, unknown>>,
  dryRun: boolean,
  allMissing: Record<string, string[]>
): Promise<void> {
  // Print warnings for missing secrets
  for (const [name, keys] of Object.entries(allMissing)) {
    for (const k of keys)
      warn(`secret '${k}' not found — set it with: agentctl secrets set ${k}`);
  }

  if (provider.syncMethod === "cli") {
    // Claude Code: use `claude mcp add` CLI
    if (dryRun) { info(`[dry-run] Would run claude mcp add/remove`); return; }
    // Get existing claude mcp list
    let existing: string[] = [];
    try {
      const out = execSync("claude mcp list 2>/dev/null", { encoding: "utf-8" });
      existing = out.split("\n").map(l => l.split(":")[0]?.trim() ?? "").filter(Boolean);
    } catch {}

    for (const [name, server] of Object.entries(servers)) {
      // Remove first if exists
      if (existing.includes(name)) {
        try { execSync(`claude mcp remove ${name}`, { stdio: "ignore" }); } catch {}
      }
      // Add
      const isHttp = "url" in server;
      if (isHttp) {
        execSync(`claude mcp add --transport http ${name} ${server["url"]}`, { stdio: "ignore" });
      } else {
        const cmd = server["command"] as string;
        const args = (server["args"] as string[] ?? []).join(" ");
        const envStr = server["env"]
          ? Object.entries(server["env"] as Record<string, string>).map(([k, v]) => `-e ${k}=${JSON.stringify(v)}`).join(" ")
          : "";
        execSync(`claude mcp add ${envStr} ${name} ${cmd} ${args}`.trim(), { stdio: "ignore" });
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
    const existing: Record<string, unknown> = {};
    existing[serversKey] = servers;
    const toml = toToml(existing);
    if (!dryRun) {
      await Bun.write(configPath, toml);
      ok(`wrote ${configPath}`);
    } else {
      info(`[dry-run] Would write ${configPath}`);
    }
  }
}

export function registerSync(program: Command): void {
  program
    .command("sync")
    .description("Sync MCP servers and skills to all providers")
    .option("--dry-run", "Preview changes without applying")
    .option("--mcp-only", "Sync MCP servers only")
    .option("--skills-only", "Sync skills only")
    .action(async (opts: { dryRun?: boolean; mcpOnly?: boolean; skillsOnly?: boolean }) => {
      const dryRun = opts.dryRun ?? false;
      const mcpOnly = opts.mcpOnly ?? false;
      const skillsOnly = opts.skillsOnly ?? false;

      const agentsDir = (await import("../lib/config")).AGENTS_DIR;
      if (!existsSync(agentsDir)) {
        console.error("Run 'agentctl init' first");
        process.exit(1);
      }
      console.log();
      console.log(bold("agentctl sync"));
      console.log(dim(`Source: ${agentsDir}`));
      if (dryRun) console.log(yellow("DRY RUN — no changes will be made"));

      const mcpConfig = loadMcpConfig();
      const userConfig = loadAgentConfig();
      const allProviders = loadProviders();

      const enabledProviders = userConfig.providers
        .map(id => allProviders[id])
        .filter((p): p is Provider => p !== undefined);

      if (!skillsOnly) {
        console.log(`\n${bold("── MCP Servers ─────────────────────────────────────────────")}`);

        const { resolved, allMissing } = await resolveAll(mcpConfig, userConfig.paths);

        for (const provider of enabledProviders) {
          console.log(`\n  ${bold(provider.displayName)}`);
          if (!isInstalled(provider.detectCommand)) {
            warn(`${provider.detectCommand} not found, skipping`);
            continue;
          }
          const formatted = formatForProvider(resolved, provider);
          try {
            await syncProviderMcp(provider, formatted, dryRun, allMissing);
            if (!dryRun) ok(`synced to ${provider.displayName}`);
          } catch (e) {
            err(`sync failed for ${provider.displayName}: ${e}`);
          }
        }
      }

      if (!mcpOnly) {
        console.log(`\n${bold("── Skills ──────────────────────────────────────────────────")}`);
        const skillsSource = join(agentsDir, "skills");

        for (const provider of enabledProviders) {
          if (!isInstalled(provider.detectCommand)) continue;
          if (provider.skills.method === "native") {
            info(`${provider.displayName} reads ${skillsSource} natively`);
            continue;
          }
          const skillsTarget = typeof provider.skills.path === "string"
            ? expandHome(provider.skills.path)
            : expandHome((provider.skills.path as Record<string, string>)[process.platform] ?? "");

          if (!skillsTarget) continue;
          console.log(`\n  ${bold(provider.displayName)}  ${dim(`(${skillsTarget})`)}`);
          const { linked, skipped, errors } = syncSkills(skillsSource, skillsTarget, dryRun);
          for (const s of linked) ok(`linked skill: ${s}`);
          for (const s of skipped) info(`skipped (exists): ${s}`);
          for (const e of errors) err(e);
        }
      }

      console.log();
      console.log(bold("── Summary ─────────────────────────────────────────────────"));
      if (dryRun) console.log(`  ${yellow("Dry run complete — no changes made.")}`);
      else console.log(`  ${green("Sync complete.")}`);
      console.log();
    });
}
