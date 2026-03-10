// src/commands/add-server.ts
import { join } from "path";
import type { Command } from "commander";
import { AGENTS_DIR, loadMcpConfig } from "../lib/config";
import type { McpServer } from "../lib/schemas";

const mcpPath = join(AGENTS_DIR, "mcp-config.json");

export function registerAddServer(program: Command): void {
  program
    .command("add-server <name> [cmdArgs...]")
    .description("Add a new MCP server")
    .option("--http <url>", "Add an HTTP transport server")
    .action(async (name: string, cmdArgs: string[], opts: { http?: string }) => {
      const config = loadMcpConfig();

      let server: McpServer;
      if (opts.http) {
        server = { transport: "http", url: opts.http };
      } else {
        if (cmdArgs.length === 0) {
          console.error("Error: provide a command (or --http <url>)");
          process.exit(1);
        }
        server = { command: cmdArgs[0]!, args: cmdArgs.slice(1) };
      }

      config[name] = server;
      await Bun.write(mcpPath, JSON.stringify(config, null, 2));
      console.log(`Added server: ${name}`);
      console.log("Run 'agentctl sync' to push to providers.");
    });
}
