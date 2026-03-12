import type { Command } from "commander";
import { writeFileSync } from "fs";
import { join } from "path";
import { loadMcpConfig, loadAgentConfig, AGENTS_DIR } from "../lib/config";
import { getRuntimeForServer } from "../lib/runtime";

export function registerRuntime(program: Command): void {
  const runtime = program.command("runtime").description("Manage server runtime backends (local or cloud)");

  runtime
    .command("list")
    .description("Show which runtime each server uses")
    .action(() => {
      const mc = loadMcpConfig();
      const ac = loadAgentConfig();
      console.log(`\n${"SERVER".padEnd(25)} RUNTIME`);
      console.log("─".repeat(35));
      for (const name of Object.keys(mc)) {
        console.log(`${name.padEnd(25)} ${getRuntimeForServer(name, ac)}`);
      }
    });

  runtime
    .command("set <server> <backend>")
    .description("Set runtime for a server: local | e2b")
    .action((server: string, backend: string) => {
      if (!["local", "e2b"].includes(backend)) {
        console.error("Backend must be 'local' or 'e2b'");
        process.exit(1);
      }
      const ac = loadAgentConfig();
      if (!ac.runtime) (ac as any).runtime = { default: "local" };
      if (!ac.runtime!.servers) ac.runtime!.servers = {};
      (ac.runtime!.servers as Record<string, string>)[server] = backend;
      writeFileSync(join(AGENTS_DIR, "config.json"), JSON.stringify(ac, null, 2) + "\n");
      console.log(`✓ ${server} → ${backend}`);
    });
}
