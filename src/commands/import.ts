// src/commands/import.ts
import { join } from "path";
import { existsSync, readdirSync, lstatSync, readFileSync } from "fs";
import type { Command } from "commander";
import { AGENTS_DIR, loadMcpConfig, loadProviders, resolveProviderConfigPath, expandHome } from "../lib/config";
import type { McpServer } from "../lib/schemas";

const mcpPath = join(AGENTS_DIR, "mcp-config.json");

function parseTOML(content: string): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  let currentSection = "";
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) { currentSection = sectionMatch[1]!; result[currentSection] = {}; continue; }
    if (currentSection) {
      const kv = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
      if (kv) {
        try { result[currentSection]![kv[1]!] = JSON.parse(kv[2]!); }
        catch { result[currentSection]![kv[1]!] = kv[2]!.replace(/^["']|["']$/g, ""); }
      }
    }
  }
  return result;
}

function extractServersFromFile(
  filePath: string,
  serversKey: string,
  format: "json" | "toml"
): Record<string, McpServer> {
  if (!existsSync(filePath)) return {};
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = format === "json" ? JSON.parse(content) : parseTOML(content);
    const servers = parsed[serversKey] ?? {};
    const result: Record<string, McpServer> = {};
    for (const [name, raw] of Object.entries(servers as Record<string, unknown>)) {
      const r = raw as Record<string, unknown>;
      if (r["url"] || r["httpUrl"] || r["serverUrl"] || r["type"] === "http") {
        result[name] = {
          transport: "http",
          url: (r["url"] ?? r["httpUrl"] ?? r["serverUrl"]) as string,
          ...(r["headers"] ? { headers: r["headers"] as Record<string, string> } : {}),
        };
      } else {
        const cmdRaw = r["command"];
        const command = Array.isArray(cmdRaw) ? (cmdRaw[0] as string) : (cmdRaw as string);
        const args = Array.isArray(cmdRaw) ? cmdRaw.slice(1) as string[]
          : Array.isArray(r["args"]) ? r["args"] as string[] : undefined;
        result[name] = {
          command,
          ...(args?.length ? { args } : {}),
          ...(r["env"] ? { env: r["env"] as Record<string, string> } : {}),
          ...(r["cwd"] ? { cwd: r["cwd"] as string } : {}),
        };
      }
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

export function registerImport(program: Command): void {
  program
    .command("import-from-everywhere")
    .description("Import MCP servers and skills from all detected provider configs")
    .action(async () => {
      const existing = loadMcpConfig();
      const providers = loadProviders();
      let imported = 0;
      const platform = process.platform;

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

      await Bun.write(mcpPath, JSON.stringify(existing, null, 2));
      if (imported === 0) {
        console.log("nothing new to import");
      } else {
        console.log(`\nImported ${imported} server(s).`);
      }
    });
}
