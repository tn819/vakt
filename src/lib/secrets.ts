import { join } from "node:path";
import { existsSync, chmodSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { AGENTS_DIR } from "./config";

type Backend = "keychain" | "pass" | "env";
const SERVICE = process.env["AGENTS_SERVICE"] ?? "vakt";
const ENV_FILE = join(AGENTS_DIR, "secrets.env");

async function run(cmd: string, args: string[]): Promise<{ stdout: string; ok: boolean }> {
  const timeoutMs = Number.parseInt(process.env["AGENTS_RUN_TIMEOUT_MS"] ?? "3000", 10);
  try {
    const proc = Bun.spawn([cmd, ...args], { stdout: "pipe", stderr: "pipe" });
    const timeoutPromise = new Promise<{ stdout: string; ok: boolean }>((resolve) => {
      setTimeout(() => {
        proc.kill();
        resolve({ stdout: "", ok: false });
      }, timeoutMs);
    });
    const runPromise = (async () => {
      const stdout = await new Response(proc.stdout).text();
      const ok = (await proc.exited) === 0;
      return { stdout: stdout.trim(), ok };
    })();
    return await Promise.race([runPromise, timeoutPromise]);
  } catch {
    return { stdout: "", ok: false };
  }
}

function keychainAccessible(): boolean {
  // Test keychain accessibility with a read-only operation that never shows a dialog.
  // 'security list-keychains' exits 0 and returns paths when the login keychain is reachable.
  // Use absolute path — /usr/bin/security is always the macOS keychain CLI
  const result = spawnSync("/usr/bin/security", ["list-keychains"], { encoding: "utf-8", timeout: 2000 });
  return result.status === 0 && typeof result.stdout === "string" && result.stdout.trim().length > 0;
}

function detectBackend(): Backend {
  const override = process.env["AGENTS_SECRETS_BACKEND"];
  if (override === "keychain" || override === "pass" || override === "env") return override;
  if (process.platform === "darwin" && keychainAccessible()) return "keychain";
  if (existsSync("/usr/bin/pass") || existsSync("/usr/local/bin/pass")) return "pass";
  return "env";
}

export function getBackend(): Backend {
  return detectBackend();
}

// ── Keychain (macOS) ──────────────────────────────────────────────────────────

async function keychainSet(key: string, value: string): Promise<void> {
  await run("security", ["delete-generic-password", "-s", SERVICE, "-a", key]);
  const { ok } = await run("security", [
    "add-generic-password", "-s", SERVICE, "-a", key, "-w", value,
  ]);
  if (!ok) throw new Error(`keychain set failed for ${key}`);
}

async function keychainGet(key: string): Promise<string | null> {
  const { stdout, ok } = await run("security", [
    "find-generic-password", "-s", SERVICE, "-a", key, "-w",
  ]);
  return ok ? stdout : null;
}

async function keychainDelete(key: string): Promise<void> {
  await run("security", ["delete-generic-password", "-s", SERVICE, "-a", key]);
}

async function keychainList(): Promise<string[]> {
  const { stdout } = await run("security", ["dump-keychain"]);
  const matches = [
    ...stdout.matchAll(new RegExp(String.raw`"acct"<blob>="([^"]+)"[\s\S]*?"svce"<blob>="${SERVICE}"`, "g")),
  ];
  return matches.map((m) => m[1] ?? "").filter(Boolean);
}

// ── pass (Linux GPG) ──────────────────────────────────────────────────────────

async function passSet(key: string, value: string): Promise<void> {
  const proc = Bun.spawn(["pass", "insert", "--force", `${SERVICE}/${key}`], {
    stdin: new TextEncoder().encode(value),
    stdout: "pipe",
    stderr: "pipe",
  });
  if ((await proc.exited) !== 0) throw new Error(`pass set failed for ${key}`);
}

async function passGet(key: string): Promise<string | null> {
  const { stdout, ok } = await run("pass", ["show", `${SERVICE}/${key}`]);
  return ok ? stdout : null;
}

async function passDelete(key: string): Promise<void> {
  await run("pass", ["rm", "--force", `${SERVICE}/${key}`]);
}

async function passList(): Promise<string[]> {
  const { stdout } = await run("pass", ["ls", SERVICE]);
  return stdout
    .split("\n")
    .map((l) => l.replace(/^[├└─ ]+/, "").trim())
    .filter(Boolean);
}

// ── env file (fallback) ───────────────────────────────────────────────────────

function readEnvFile(): Record<string, string> {
  if (!existsSync(ENV_FILE)) return {};
  const lines = readFileSync(ENV_FILE, "utf-8").split("\n");
  return Object.fromEntries(
    lines
      .filter((l) => l.includes("="))
      .map((l) => {
        const [k, ...rest] = l.split("=");
        return [k!.trim(), Buffer.from(rest.join("=").trim(), "base64").toString("utf-8")];
      })
  );
}

function writeEnvFile(data: Record<string, string>): void {
  const content = Object.entries(data)
    .map(([k, v]) => `${k}=${Buffer.from(v).toString("base64")}`)
    .join("\n");
  Bun.write(ENV_FILE, content);
  chmodSync(ENV_FILE, 0o600);
}

function envSet(key: string, value: string): void {
  writeEnvFile({ ...readEnvFile(), [key]: value });
}

function envGet(key: string): string | null {
  return readEnvFile()[key] ?? null;
}

function envDelete(key: string): void {
  const data = readEnvFile();
  delete data[key];
  writeEnvFile(data);
}

function envList(): string[] {
  return Object.keys(readEnvFile());
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function secretsSet(key: string, value: string): Promise<void> {
  const b = getBackend();
  if (b === "keychain") return keychainSet(key, value);
  if (b === "pass") return passSet(key, value);
  envSet(key, value);
}

export async function secretsGet(key: string): Promise<string | null> {
  const b = getBackend();
  if (b === "keychain") return keychainGet(key);
  if (b === "pass") return passGet(key);
  return envGet(key);
}

export async function secretsDelete(key: string): Promise<void> {
  const b = getBackend();
  if (b === "keychain") return keychainDelete(key);
  if (b === "pass") return passDelete(key);
  envDelete(key);
}

export async function secretsList(): Promise<string[]> {
  const b = getBackend();
  if (b === "keychain") return keychainList();
  if (b === "pass") return passList();
  return envList();
}

export async function secretsHas(key: string): Promise<boolean> {
  return (await secretsGet(key)) !== null;
}

async function vaultGet(path: string): Promise<string | null> {
  const { stdout, ok } = await run("vault", ["kv", "get", "-field=value", path]);
  return ok ? stdout : null;
}

async function opGet(spec: string): Promise<string | null> {
  // spec format: "vault/item/field"
  const parts = spec.split("/");
  if (parts.length < 3) return null;
  const [vault, item, ...fieldParts] = parts;
  const field = fieldParts.join("/");
  const { stdout, ok } = await run("op", [
    "item", "get", item!, "--vault", vault!, "--fields", field!,
  ]);
  return ok ? stdout : null;
}

async function azureGet(spec: string): Promise<string | null> {
  // spec format: "vault-name/secret-name"
  const slashIdx = spec.indexOf("/");
  if (slashIdx === -1) return null;
  const vaultName = spec.slice(0, slashIdx);
  const secretName = spec.slice(slashIdx + 1);
  const { stdout, ok } = await run("az", [
    "keyvault", "secret", "show",
    "--vault-name", vaultName,
    "--name", secretName,
    "--query", "value",
    "-o", "tsv",
  ]);
  return ok ? stdout : null;
}

export async function resolveSecretRefs(
  value: string
): Promise<{ resolved: string; missing: string[] }> {
  const missing: string[] = [];
  // Match secret:KEY (plain) or secret:vault|op|azure:rest/path (namespaced)
  const refs = [...value.matchAll(/secret:((?:vault|op|azure):[\w\/\-\.]+|\w+)/g)].map((m) => m[1]!);
  let resolved = value;
  for (const ref of refs) {
    let val: string | null = null;
    if (ref.startsWith("vault:")) {
      val = await vaultGet(ref.slice("vault:".length));
    } else if (ref.startsWith("op:")) {
      val = await opGet(ref.slice("op:".length));
    } else if (ref.startsWith("azure:")) {
      val = await azureGet(ref.slice("azure:".length));
    } else {
      val = await secretsGet(ref);
    }
    if (val === null) {
      missing.push(ref);
    } else {
      resolved = resolved.replace(`secret:${ref}`, val);
    }
  }
  return { resolved, missing };
}
