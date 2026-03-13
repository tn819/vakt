import { join } from "node:path";
import { existsSync } from "node:fs";
import { type RemoteConfig } from "./schemas";

// URL resolution: GitHub, GitLab, local path, plain HTTPS
export function resolveRemoteUrl(base: string, filename: string): string {
  base = base.replace(/\/$/, "");

  // GitHub repo URL → raw.githubusercontent.com
  const ghMatch = base.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
  if (ghMatch) return `https://raw.githubusercontent.com/${ghMatch[1]}/main/${filename}`;

  // GitLab repo URL
  const glMatch = base.match(/^https?:\/\/gitlab\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
  if (glMatch) return `https://gitlab.com/${glMatch[1]}/-/raw/main/${filename}`;

  // Local filesystem path
  if (base.startsWith("/") || base.startsWith("file://")) {
    const local = base.replace("file://", "");
    return `file://${local}/${filename}`;
  }

  return `${base}/${filename}`;
}

// Fetch a URL, returns body string or null on error.
// Only https:// and file:// are permitted — rejects all other schemes.
export async function fetchUrl(url: string, token?: string): Promise<string | null> {
  if (url.startsWith("file://")) {
    const localPath = url.slice("file://".length);
    if (!existsSync(localPath)) return null;
    return await Bun.file(localPath).text();
  }

  if (!url.startsWith("https://")) return null; // Reject http:// and all other schemes

  const headers: Record<string, string> = { "User-Agent": "vakt/1.0.0" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

async function fetchAndWrite(url: string, token: string | undefined, outPath: string): Promise<boolean> {
  const body = await fetchUrl(url, token);
  if (body === null) return false;
  await Bun.write(outPath, body);
  return true;
}

export async function fetchRemotePolicy(remoteCfg: RemoteConfig, agentsDir: string, token?: string): Promise<string | null> {
  const url = resolveRemoteUrl(remoteCfg.url, "policy.json");
  const out = join(agentsDir, "policy.remote.json");
  const ok = await fetchAndWrite(url, token, out);
  return ok ? out : null;
}

export async function fetchRemoteMcpConfig(remoteCfg: RemoteConfig, agentsDir: string, token?: string): Promise<string | null> {
  const url = resolveRemoteUrl(remoteCfg.url, "mcp-config.json");
  const out = join(agentsDir, "mcp-config.remote.json");
  const ok = await fetchAndWrite(url, token, out);
  return ok ? out : null;
}

export async function fetchRemoteSkillsManifest(remoteCfg: RemoteConfig, agentsDir: string, token?: string): Promise<string | null> {
  const url = resolveRemoteUrl(remoteCfg.url, "skills/index.json");
  const out = join(agentsDir, "skills", "remote-index.json");
  const ok = await fetchAndWrite(url, token, out);
  return ok ? out : null;
}

// Merge mcp-config.remote.json into mcp-config.json
// Remote entries are tagged with _source: "remote"
export async function mergeRemoteMcp(
  agentsDir: string,
  dryRun = false
): Promise<Record<string, "added" | "updated" | "unchanged">> {
  const localPath = join(agentsDir, "mcp-config.json");
  const remotePath = join(agentsDir, "mcp-config.remote.json");
  if (!existsSync(remotePath)) return {};

  const remoteRaw = JSON.parse(await Bun.file(remotePath).text()) as Record<string, unknown>;
  const localRaw = JSON.parse(await Bun.file(localPath).text()) as Record<string, unknown>;

  const changes: Record<string, "added" | "updated" | "unchanged"> = {};
  for (const [name, cfg] of Object.entries(remoteRaw)) {
    const tagged = { ...(cfg as Record<string, unknown>), _source: "remote" };
    if (!(name in localRaw)) {
      changes[name] = "added";
    } else if (JSON.stringify(localRaw[name]) !== JSON.stringify(tagged)) {
      changes[name] = "updated";
    } else {
      changes[name] = "unchanged";
    }
    localRaw[name] = tagged;
  }

  if (!dryRun) {
    await Bun.write(localPath, JSON.stringify(localRaw, null, 2) + "\n");
  }
  return changes;
}
