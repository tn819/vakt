// src/commands/config.ts
import { join } from "path";
import { existsSync } from "fs";
import type { Command } from "commander";
import { AGENTS_DIR, loadAgentConfig } from "../lib/config";

const configPath = join(AGENTS_DIR, "config.json");

function getNestedKey(obj: Record<string, unknown>, dotKey: string): unknown {
  return dotKey.split(".").reduce<unknown>((acc, k) =>
    acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined, obj);
}

function setNestedKey(obj: Record<string, unknown>, dotKey: string, value: unknown): void {
  const parts = dotKey.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]!;
    if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

export function registerConfig(program: Command): void {
  const cmd = program.command("config").description("View or edit configuration");

  cmd.command("list")
    .description("Show all config")
    .action(() => {
      const cfg = loadAgentConfig();
      console.log(JSON.stringify(cfg, null, 2));
    });

  cmd.command("get <key>")
    .description("Get a config value by dot-notation key")
    .action((key: string) => {
      const cfg = loadAgentConfig() as Record<string, unknown>;
      const val = getNestedKey(cfg, key);
      if (val === undefined) { console.error(`Key not found: ${key}`); process.exit(1); }
      console.log(typeof val === "string" ? val : JSON.stringify(val, null, 2));
    });

  cmd.command("set <key> <value>")
    .description("Set a config value by dot-notation key")
    .action(async (key: string, value: string) => {
      const cfg = loadAgentConfig() as Record<string, unknown>;
      const parsed = (() => { try { return JSON.parse(value); } catch { return value; } })();
      setNestedKey(cfg, key, parsed);
      await Bun.write(configPath, JSON.stringify(cfg, null, 2));
      console.log(`Set ${key} = ${JSON.stringify(parsed)}`);
    });
}
