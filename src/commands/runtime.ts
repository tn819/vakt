import type { Command } from "commander";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadMcpConfig, AGENTS_DIR } from "../lib/config";

const KNOWN_BACKENDS = ["local", "e2b", "docker", "coder", "daytona", "fly", "gvisor", "kata", "microsandbox"];

function loadRawConfig(): Record<string, unknown> {
  const path = join(AGENTS_DIR, "config.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown> : {};
}

function getRuntimeForServerRaw(name: string, raw: Record<string, unknown>): string {
  const rt = raw["runtime"] as Record<string, unknown> | undefined;
  const servers = rt?.["servers"] as Record<string, string> | undefined;
  return servers?.[name] ?? (rt?.["default"] as string | undefined) ?? "local";
}

export function registerRuntime(program: Command): void {
  const runtime = program.command("runtime").description("Manage server runtime backends (local or cloud)");

  runtime
    .command("list")
    .description("Show which runtime each server uses")
    .action(() => {
      const mc = loadMcpConfig();
      const raw = loadRawConfig();
      console.log(`\n${"SERVER".padEnd(25)} RUNTIME`);
      console.log("─".repeat(35));
      for (const name of Object.keys(mc)) {
        console.log(`${name.padEnd(25)} ${getRuntimeForServerRaw(name, raw)}`);
      }
    });

  runtime
    .command("set <server> <backend>")
    .description(`Set runtime for a server: ${KNOWN_BACKENDS.join(" | ")}`)
    .action((server: string, backend: string) => {
      if (!KNOWN_BACKENDS.includes(backend)) {
        console.error(`Backend must be one of: ${KNOWN_BACKENDS.join(", ")}`);
        process.exit(1);
      }
      const raw = loadRawConfig();
      if (!raw["runtime"]) raw["runtime"] = { default: "local" };
      const rt = raw["runtime"] as Record<string, unknown>;
      if (!rt["servers"]) rt["servers"] = {};
      (rt["servers"] as Record<string, string>)[server] = backend;
      writeFileSync(join(AGENTS_DIR, "config.json"), JSON.stringify(raw, null, 2) + "\n");
      console.log(`✓ ${server} → ${backend}`);
    });
}
