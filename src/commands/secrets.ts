// src/commands/secrets.ts
import type { Command } from "commander";
import { secretsSet, secretsGet, secretsDelete, secretsList } from "../lib/secrets";

export function registerSecrets(program: Command): void {
  const cmd = program
    .command("secrets")
    .description("Manage secrets (keychain/pass/env)");

  cmd.command("set <key> [value]")
    .description("Store a secret")
    .action(async (key: string, value?: string) => {
      const v = value ?? (await readStdin()) ?? "";
      await secretsSet(key, v.trim());
      console.log(`Stored: ${key}`);
    });

  cmd.command("get <key>")
    .description("Retrieve a secret")
    .action(async (key: string) => {
      const v = await secretsGet(key);
      if (v === null) { process.stderr.write(`Not found: ${key}\n`); process.exit(1); }
      console.log(v);
    });

  cmd.command("delete <key>")
    .description("Delete a secret")
    .action(async (key: string) => {
      await secretsDelete(key);
      console.log(`Deleted: ${key}`);
    });

  cmd.command("list")
    .description("List all secret keys")
    .action(async () => {
      const keys = await secretsList();
      if (keys.length === 0) { return; }
      for (const k of keys) console.log(k);
    });
}

async function readStdin(): Promise<string | null> {
  if (process.stdin.isTTY) return null;
  return new Response(Bun.stdin.stream()).text();
}
