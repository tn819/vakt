// src/commands/import.ts
import { join } from "path";
import { existsSync, readdirSync, lstatSync } from "fs";
import type { Command } from "commander";
import { AGENTS_DIR, loadMcpConfig, loadProviders, resolveProviderConfigPath, expandHome } from "../lib/config";
import type { McpServer } from "../lib/schemas";

const mcpPath = join(AGENTS_DIR, "mcp-config.json");

function parseTOML(content: string): Record<string, Record<string, unknown>> {
  // Minimal TOML parser for [section] and key = value
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

function extractServersFromProviderConfig(
  configPath: string,
  serversKey: string,
  format: "json" | "toml"
): Record<string, McpServer> {
  if (!existsSync(configPath)) return {};
  try {
    const content = Bun.file(configPath).toString();
    const parsed = format === "json" ? JSON.parse(content) : parseTOML(content);
    const servers = parsed[serversKey] ?? {};
    // Normalise: detect http vs stdio
    const result: Record<string, McpServer> = {};
    for (const [name, raw] of Object.entries(servers as Record<string, unknown>)) {
      const r = raw as Record<string, unknown>;
      if (r["url"] || r["httpUrl"] || r["serverUrl"]) {
        result[name] = {
          transport: "http",
          url: (r["url"] ?? r["httpUrl"] ?? r["serverUrl"]) as string,
          ...(r["headers"] ? { headers: r["headers"] as Record<string, string> } : {}),
        };
      } else {
        const cmdRaw = r["command"];
        // Some providers combine command+args in a single array
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

export function registerImport(program: Command): void {
  program
    .command("import-from-everywhere")
    .description("Import MCP servers and skills from all detected provider configs")
    .action(async () => {
      const existing = loadMcpConfig();
      const providers = loadProviders();
      let imported = 0;

      for (const provider of Object.values(providers)) {
        if (provider.configFormat === "cli") continue; // Claude handled separately below
        const configPath = resolveProviderConfigPath(provider);
        const format = provider.configFormat === "toml" ? "toml" : "json";
        const servers = extractServersFromProviderConfig(
          configPath,
          provider.configStructure.serversPropertyName,
          format
        );
        for (const [name, server] of Object.entries(servers)) {
          if (existing[name]) { console.log(`  · skipped (exists): ${name}`); continue; }
          existing[name] = server;
          console.log(`  ✓  imported: ${name} (from ${provider.displayName})`);
          imported++;
        }
      }

      // Also read ~/.mcp.json (Claude project-level convention)
      const dotMcp = join(process.env["HOME"] ?? "~", ".mcp.json");
      if (existsSync(dotMcp)) {
        const servers = extractServersFromProviderConfig(dotMcp, "mcpServers", "json");
        for (const [name, server] of Object.entries(servers)) {
          if (existing[name]) continue;
          existing[name] = server;
          console.log(`  ✓  imported: ${name} (from ~/.mcp.json)`);
          imported++;
        }
      }

      // Import skills: symlink directories found in provider skill paths
      const skillsTarget = join(AGENTS_DIR, "skills");
      for (const provider of Object.values(providers)) {
        const rawPath = typeof provider.skills.path === "string"
          ? provider.skills.path
          : (provider.skills.path as Record<string, string>)[process.platform] ?? "";
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
      console.log(`\nImported ${imported} server(s).`);
    });
}
