import type { Command } from "commander";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { loadMcpConfig } from "../lib/config";
import type { McpConfig, McpServer } from "../lib/schemas";
import { verifyPackage } from "../lib/verify";

const bold   = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green  = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan   = (s: string) => `\x1b[36m${s}\x1b[0m`;
const dim    = (s: string) => `\x1b[2m${s}\x1b[0m`;
const ok     = (s: string) => console.log(`  ${green("✓")}  ${s}`);
const warn   = (s: string) => console.log(`  ${yellow("⚠")}  ${s}`);
const info   = (s: string) => console.log(`  ${cyan("→")}  ${s}`);
const dry    = (s: string) => console.log(`  ${dim("[dry-run]")}  ${s}`);

function writeJsonFile(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  Bun.write(path, JSON.stringify(data, null, 2) + "\n");
}

async function auditSupplyChain(mcpConfig: McpConfig): Promise<void> {
  for (const [name, cfg] of Object.entries(mcpConfig)) {
    const pkgInfo = resolveVerifyTarget(cfg);
    if (!pkgInfo) {
      info(`${name}: verification not applicable`);
      continue;
    }
    const vResult = await verifyPackage(pkgInfo.pkgType, pkgInfo.identifier, pkgInfo.version);
    if (vResult.ok) {
      ok(`${name}: verified (${vResult.signer}, ${vResult.source})`);
    } else {
      warn(`${name}: unverified — ${vResult.reason}`);
    }
  }
}

export function registerLockdown(program: Command): void {
  program
    .command("lockdown")
    .description("Enforce approved MCP server list across providers")
    .option("--dry-run", "preview without writing files")
    .option("--generate-mdm", "output a macOS MDM .mobileconfig profile")
    .action(async (opts: { dryRun?: boolean; generateMdm?: boolean }) => {
      const home = process.env["HOME"] ?? "~";
      const agentsDir = process.env["AGENTS_DIR"] ?? join(home, ".agents");

      if (!existsSync(agentsDir)) {
        console.error("Error: ~/.agents/ not initialized. Run 'vakt init' first.");
        process.exit(1);
      }

      let mcpConfig: McpConfig;
      try {
        mcpConfig = loadMcpConfig();
      } catch (e) {
        console.error(`Error loading mcp-config.json: ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }

      console.log("");
      console.log(bold("vakt lockdown"));
      if (opts.dryRun) console.log(yellow("DRY RUN — no changes will be made"));
      console.log("");

      // ── Supply-chain verification ───────────────────────────────────────────
      console.log(bold("── Supply-chain verification ────────────────────────────────"));
      await auditSupplyChain(mcpConfig);
      console.log("");

      // ── Layer 1a: Claude Code managed-mcp.json ─────────────────────────────
      console.log(bold("── Claude Code (managed-mcp.json) ──────────────────────────"));

      const claudeManaged = join(home, ".claude", "managed-mcp.json");

      // Build Claude-compatible server entries (strip _source metadata)
      const servers: Record<string, unknown> = {};
      for (const [name, cfg] of Object.entries(mcpConfig)) {
        const entry = { ...cfg } as Record<string, unknown>;
        delete entry["_source"];
        servers[name] = entry;
      }
      const managed = { exclusive: true, mcpServers: servers };

      if (opts.dryRun) {
        dry(`would write ${claudeManaged}`);
        dry(`exclusive: true, servers: [${Object.keys(servers).join(", ")}]`);
      } else {
        writeJsonFile(claudeManaged, managed);
        ok(`wrote ${claudeManaged}`);
        info(`exclusive: true — 'claude mcp add' is now blocked`);
      }
      console.log("");

      // ── Layer 1b: Cursor rules ──────────────────────────────────────────────
      console.log(bold("── Cursor (.cursor/rules/vakt-admin.mdc) ───────────────────"));

      const cursorMdc = join(process.cwd(), ".cursor", "rules", "vakt-admin.mdc");
      const serverNames = Object.keys(servers).join(", ") || "(none)";

      const mdcContent = `---
description: vakt-managed MCP server policy
alwaysApply: true
---

# vakt MCP Server Policy

The following MCP servers are approved and managed by vakt:
${Object.keys(servers).map((n) => `- ${n}`).join("\n")}

Do not suggest or use MCP servers not in this list without explicit admin approval.
`;

      if (opts.dryRun) {
        dry(`would write ${cursorMdc}`);
        dry(`approved servers: ${serverNames}`);
      } else {
        mkdirSync(dirname(cursorMdc), { recursive: true });
        await Bun.write(cursorMdc, mdcContent);
        ok(`wrote ${cursorMdc}`);
        info("alwaysApply: true — Cursor will enforce this policy");
      }
      console.log("");

      // ── Layer 2: MDM profile ────────────────────────────────────────────────
      if (opts.generateMdm) {
        console.log(bold("── MDM Profile (.mobileconfig) ─────────────────────────────"));
        const profile = generateMdmProfile(home);
        const outPath = join(agentsDir, "vakt-lockdown.mobileconfig");
        if (opts.dryRun) {
          dry(`would write ${outPath}`);
        } else {
          await Bun.write(outPath, profile);
          ok(`wrote ${outPath}`);
          info("Deploy via Jamf/Kandji/Intune to make provider configs read-only");
        }
        console.log("");
      }

      if (!opts.dryRun) {
        ok("Lockdown complete");
        info("Run 'vakt sync' to push the current config, then lockdown will hold it");
      }
      console.log("");

    });
}

interface VerifyTarget {
  pkgType: "oci" | "npm" | "npx";
  identifier: string;
  version?: string;
}

function resolveVerifyTarget(cfg: McpServer): VerifyTarget | null {
  if ("transport" in cfg) return null; // HTTP servers can't be verified via npm/oci
  const { command, args = [] } = cfg;
  if (command === "docker" && args.includes("run")) {
    // docker run [flags] <image> — image is the first non-flag arg after "run"
    const image = args.slice(args.indexOf("run") + 1).find((a) => !a.startsWith("-"));
    if (image) return { pkgType: "oci", identifier: image };
  }
  if (command === "npx" || command === "bunx" || command === "pnpx") {
    // npx [-y] <package> [args...] — find first non-flag arg
    const pkg = args.find((a) => !a.startsWith("-"));
    if (pkg) return { pkgType: "npx", identifier: pkg };
  }
  return null;
}

function generateMdmProfile(home: string): string {
  // Minimal macOS .mobileconfig that sets provider config files to read-only
  const paths = [
    `${home}/.claude.json`,
    `${home}/.cursor/mcp.json`,
    `${home}/.codeium/windsurf/mcp_config.json`,
    `${home}/.gemini/settings.json`,
    `${home}/.codex/config.toml`,
    `${home}/.config/opencode/opencode.json`,
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadType</key>
      <string>com.apple.finder</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>PayloadIdentifier</key>
      <string>com.vakt.lockdown.finder</string>
      <key>PayloadUUID</key>
      <string>A1B2C3D4-E5F6-7890-ABCD-EF1234567890</string>
      <key>PayloadDisplayName</key>
      <string>vakt MCP Config Lockdown</string>
      <key>PayloadDescription</key>
      <string>Prevents modification of AI coding tool MCP config files</string>
    </dict>
  </array>
  <key>PayloadDisplayName</key>
  <string>vakt Lockdown Policy</string>
  <key>PayloadIdentifier</key>
  <string>com.vakt.lockdown</string>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>12345678-1234-1234-1234-123456789012</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
  <key>PayloadDescription</key>
  <string>Managed by vakt. Protected paths: ${paths.join(", ")}</string>
</dict>
</plist>
`;
}
