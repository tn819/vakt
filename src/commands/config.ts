// src/commands/config.ts
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import type { Command } from "commander";
import { AGENTS_DIR, loadAgentConfig } from "../lib/config";

const configPath = join(AGENTS_DIR, "config.json");

function guardInit(): void {
  if (!existsSync(configPath)) {
    console.error("Run 'vakt init' first");
    process.exit(1);
  }
}

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
  cur[parts.at(-1)!] = value;
}

function listAction(): void {
  guardInit();
  const cfg = loadAgentConfig();
  console.log(JSON.stringify(cfg, null, 2));
}

export function registerConfig(program: Command): void {
  const cmd = program
    .command("config")
    .description("View or edit configuration")
    .action(listAction);

  cmd.command("list")
    .description("Show all config")
    .action(listAction);

  cmd.command("get <key>")
    .description("Get a config value by dot-notation key")
    .action((key: string) => {
      guardInit();
      const cfg = loadAgentConfig() as Record<string, unknown>;
      const val = getNestedKey(cfg, key);
      if (val === undefined) return; // exit 0 with empty output
      console.log(typeof val === "string" ? val : JSON.stringify(val));
    });

  const setCmd = cmd.command("set <key> <value>")
    .description("Set a config value by dot-notation key")
    .action(async (key: string, value: string) => {
      guardInit();
      const raw = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf-8")) : {};
      const parsed = (() => { try { return JSON.parse(value); } catch { return value; } })();
      setNestedKey(raw, key, parsed);
      await Bun.write(configPath, JSON.stringify(raw, null, 2));
      console.log(`Set ${key} = ${JSON.stringify(parsed)}`);
    });

  setCmd.configureOutput({
    outputError(str, write) {
      write(str);
      write(`\nUsage: vakt config set <key> <value>\n`);
    },
  });
}
