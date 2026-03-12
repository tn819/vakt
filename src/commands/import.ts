// src/commands/import.ts
import { join } from "node:path";
import { existsSync, readdirSync, lstatSync, readFileSync } from "node:fs";
import type { Command } from "commander";
import { AGENTS_DIR, loadMcpConfig, loadProviders, resolveProviderConfigPath, expandHome } from "../lib/config";
import { PLATFORMS, RawProviderServerSchema, type McpServer, type PlatformKey } from "../lib/schemas";
import { parse as parseToml } from "smol-toml";

function parseServerEntry(r: ReturnType<typeof RawProviderServerSchema.parse>): McpServer | null {
  if (r["url"] || r["httpUrl"] || r["serverUrl"] || r["type"] === "http") {
    return {
      transport: "http",
      url: (r["url"] ?? r["httpUrl"] ?? r["serverUrl"]) as string,
      ...(r["headers"] ? { headers: r["headers"] as Record<string, string> } : {}),
    };
  }
  const cmdRaw = r["command"];
  const command = Array.isArray(cmdRaw) ? (cmdRaw[0] as string) : (cmdRaw as string);
  let args: string[] | undefined;
  if (Array.isArray(cmdRaw)) {
    args = cmdRaw.slice(1) as string[];
  } else if (Array.isArray(r["args"])) {
    args = r["args"] as string[];
  } else {
    args = undefined;
  }
  return {
    command,
    ...(args?.length ? { args } : {}),
    ...(r["env"] ? { env: r["env"] as Record<string, string> } : {}),
    ...(r["cwd"] ? { cwd: r["cwd"] as string } : {}),
  };
}

function extractServersFromFile(
  filePath: string,
  serversKey: string,
  format: "json" | "toml"
): Record<string, McpServer> {
  if (!existsSync(filePath)) return {};
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = format === "json"
      ? JSON.parse(content) as Record<string, unknown>
      : parseToml(content) as Record<string, unknown>;
    const servers = parsed[serversKey] ?? {};
    const result: Record<string, McpServer> = {};
    for (const [name, raw] of Object.entries(servers as Record<string, unknown>)) {
      const validated = RawProviderServerSchema.safeParse(raw);
      if (!validated.success) continue;
      const server = parseServerEntry(validated.data);
      if (server === null) continue;
      result[name] = server;
    }
    return result;
  } catch { return {}; }
}

function mergeServers(
  existing: Record<string, McpServer>,
  incoming: Record<string, McpServer>,
  source: string
): number {
  let imported = 0;
  for (const [name, server] of Object.entries(incoming)) {
    if (existing[name]) { console.log(`  · skipped (exists): ${name}`); continue; }
    existing[name] = server;
    console.log(`  ✓  imported: ${name} (from ${source})`);
    imported++;
  }
  return imported;
}

async function importProviderSkills(
  providers: ReturnType<typeof loadProviders>,
  platform: PlatformKey,
  skillsTarget: string
): Promise<void> {
  for (const provider of Object.values(providers)) {
    const rawPath = typeof provider.skills.path === "string"
      ? provider.skills.path
      : (provider.skills.path as Record<string, string>)[platform] ?? "";
    if (!rawPath) continue;
    const skillsSource = expandHome(rawPath);
    if (!existsSync(skillsSource) || skillsSource === skillsTarget) continue;
    try {
      for (const entry of readdirSync(skillsSource)) {
        const src = join(skillsSource, entry);
        const dest = join(skillsTarget, entry);
        if (!lstatSync(src).isDirectory()) continue;
        if (existsSync(dest)) continue;
        const { symlinkSync, mkdirSync } = await import("fs");
        mkdirSync(skillsTarget, { recursive: true });
        symlinkSync(src, dest);
        console.log(`  ✓  linked skill: ${entry}`);
      }
    } catch {}
  }
}

export function registerImport(program: Command): void {
  program
    .command("import-from-everywhere")
    .description("Import MCP servers and skills from all detected provider configs")
    .action(async () => {
      const mcpPath = join(AGENTS_DIR, "mcp-config.json");
      const existing = loadMcpConfig();
      const providers = loadProviders();
      let imported = 0;
      const platform: PlatformKey = (PLATFORMS as readonly string[]).includes(process.platform)
        ? process.platform as PlatformKey
        : "linux";

      for (const provider of Object.values(providers)) {
        const format = provider.configFormat;
        const configPath = resolveProviderConfigPath(provider);

        // Primary config path
        const servers = extractServersFromFile(
          configPath,
          provider.configStructure.serversPropertyName,
          format
        );
        imported += mergeServers(existing, servers, provider.displayName);

        // Additional import paths (e.g. per-user alternate locations)
        const extraPaths = provider.additionalImportPaths?.[platform]
          ?? provider.additionalImportPaths?.["linux"]
          ?? [];
        for (const rawPath of extraPaths) {
          const extra = expandHome(rawPath.replace("$HOME", process.env["HOME"] ?? "~"));
          const extraServers = extractServersFromFile(
            extra,
            provider.configStructure.serversPropertyName,
            format
          );
          imported += mergeServers(existing, extraServers, `${provider.displayName} (${extra})`);
        }
      }

      // Import skills: symlink directories found in provider skill paths
      const skillsTarget = join(AGENTS_DIR, "skills");
      await importProviderSkills(providers, platform, skillsTarget);

      await Bun.write(mcpPath, JSON.stringify(existing, null, 2));
      if (imported === 0) {
        console.log("nothing new to import");
      } else {
        console.log(`\nImported ${imported} server(s).`);
      }
    });
}
