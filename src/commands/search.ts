// src/commands/search.ts
import type { Command } from "commander";
import { RegistryClient } from "../lib/registry";

export function registerSearch(program: Command): void {
  program
    .command("search <query>")
    .description("Search the MCP registry for servers")
    .option("-n, --limit <n>", "max results", "10")
    .action(async (query: string, opts: { limit?: string }) => {
      const client = new RegistryClient();
      let results;
      try {
        results = await client.search(query, Number(opts.limit ?? 10));
      } catch (e) {
        console.error(`Registry unavailable: ${e}`);
        process.exit(1);
      }
      if (results.length === 0) {
        console.log("No results found.");
        return;
      }
      console.log();
      for (const r of results) {
        console.log(`  ${r.server.name.padEnd(55)} ${r.server.description ?? ""}`);
      }
      console.log(`\nInstall with: vakt add-server <name> <registry-id>`);
    });
}
