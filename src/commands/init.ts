// src/commands/init.ts
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import type { Command } from "commander";
import { AGENTS_DIR } from "../lib/config";

const DEFAULT_CONFIG = {
  paths: { code: "~/Code", documents: "~/Documents", vault: "~/Documents/vault" },
  providers: ["opencode", "claude", "gemini", "codex", "cursor"],
  secretsBackend: "auto",
};

const DEFAULT_MCP_CONFIG = {};

const AGENTS_MD = `# AI Agent Preferences

This directory contains your personal AI agent configuration.
Files here are read by agentctl to sync MCP servers and skills
across all your AI coding tools.

## Guiding Principles

- Open standards over proprietary formats
- Portable configuration that works across providers
- Secrets managed via system keychain, not plain text
`;

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Initialize ~/.agents/ directory")
    .option("--dry-run", "Preview changes without applying")
    .action(async (opts: { dryRun?: boolean }) => {
      const dryRun = opts.dryRun ?? false;
      const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
      const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
      const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
      const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

      console.log();
      console.log(bold("Initializing ~/.agents/"));
      console.log();

      if (dryRun) console.log(yellow("DRY RUN — no changes will be made"));

      const configPath = join(AGENTS_DIR, "config.json");
      const mcpPath = join(AGENTS_DIR, "mcp-config.json");
      const agentsMd = join(AGENTS_DIR, "AGENTS.md");
      const skillsDir = join(AGENTS_DIR, "skills");

      if (existsSync(configPath) && !dryRun) {
        console.log(`  ${yellow("⚠")}  ${AGENTS_DIR} already exists`);
      }

      const items: [string, () => void][] = [
        [AGENTS_DIR, () => mkdirSync(AGENTS_DIR, { recursive: true })],
        [configPath, () => Bun.write(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2))],
        [mcpPath, () => Bun.write(mcpPath, JSON.stringify(DEFAULT_MCP_CONFIG, null, 2))],
        [agentsMd, () => Bun.write(agentsMd, AGENTS_MD)],
        [skillsDir, () => mkdirSync(skillsDir, { recursive: true })],
      ];

      for (const [path, action] of items) {
        if (dryRun) {
          console.log(`  ${dim("[dry-run]")} Would create: ${path}`);
        } else if (!existsSync(path)) {
          action();
          console.log(`  ${green("✓")}  Created: ${path}`);
        } else {
          console.log(`  ${dim("·")}  Exists:  ${path}`);
        }
      }

      console.log();
      if (!dryRun) console.log(`  ${green("✓")}  Initialized.`);
    });
}
