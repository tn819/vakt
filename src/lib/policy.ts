import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AGENTS_DIR, expandHome } from "./config";
import { PolicySchema, type Policy, type PolicyResult, type PolicyServerRules } from "./schemas";

export function loadPolicy(): Policy | null {
  const path = join(AGENTS_DIR, "policy.json");
  if (!existsSync(path)) return null;
  return PolicySchema.parse(JSON.parse(readFileSync(path, "utf-8")));
}

export function loadMergedPolicy(agentsDir: string): Policy | null {
  const remotePath = join(agentsDir, "policy.remote.json");
  const localPath = join(agentsDir, "policy.json");

  let remote: Policy | null = null;
  let local: Policy | null = null;

  if (existsSync(remotePath)) {
    try {
      const raw = JSON.parse(readFileSync(remotePath, "utf-8")) as unknown;
      const result = PolicySchema.safeParse(raw);
      if (result.success) remote = result.data;
    } catch { /* ignore */ }
  }

  if (existsSync(localPath)) {
    try {
      const raw = JSON.parse(readFileSync(localPath, "utf-8")) as unknown;
      const result = PolicySchema.safeParse(raw);
      if (result.success) local = result.data;
    } catch { /* ignore */ }
  }

  if (remote && local) return mergePolicies(remote, local);
  return remote ?? local ?? null;
}

export function mergePolicies(remote: Policy, local: Policy): Policy {
  const remoteMeta = remote._meta as { lockedKeys?: string[] } | undefined;
  const lockedKeys = new Set(remoteMeta?.lockedKeys ?? []);

  const merged: Record<string, unknown> = { ...remote };

  for (const [key, value] of Object.entries(local)) {
    if (key === "_meta") continue; // Never override _meta from local
    if (lockedKeys.has(key)) continue; // Locked by remote

    if (key === "servers") {
      merged["servers"] = mergeServers(
        (remote.servers ?? {}) as Record<string, PolicyServerRules>,
        (local.servers ?? {}) as Record<string, PolicyServerRules>
      );
    } else {
      merged[key] = value;
    }
  }

  // Re-parse to ensure type safety
  const result = PolicySchema.safeParse(merged);
  return result.success ? result.data : remote; // Fall back to remote if merge produces invalid policy
}

function mergeServers(
  remoteServers: Record<string, PolicyServerRules>,
  localServers: Record<string, PolicyServerRules>
): Record<string, PolicyServerRules> {
  const merged = { ...remoteServers };
  for (const [name, localCfg] of Object.entries(localServers)) {
    if (!(name in merged)) {
      merged[name] = localCfg;
      continue;
    }
    const remoteCfg = merged[name]!;
    const rTools = remoteCfg.tools ?? {};
    const lTools = localCfg.tools ?? {};

    const mergedTools: { allow?: string[]; deny?: string[] } = { ...rTools };

    if (lTools.allow !== undefined || rTools.allow !== undefined) {
      const rAllow = new Set(rTools.allow ?? []);
      const lAllow = new Set(lTools.allow ?? []);
      mergedTools.allow = [...new Set([...rAllow, ...lAllow])].sort((a, b) => a.localeCompare(b));
    }

    if (lTools.deny !== undefined || rTools.deny !== undefined) {
      const rDeny = new Set(rTools.deny ?? []);
      const lDeny = new Set(lTools.deny ?? []);
      mergedTools.deny = [...new Set([...rDeny, ...lDeny])].sort((a, b) => a.localeCompare(b));
    }

    merged[name] = { ...remoteCfg, tools: mergedTools };
  }
  return merged;
}

/** Convert a simple glob pattern (only * as wildcard) to a RegExp. */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

export interface CheckResult {
  result: PolicyResult;
  matchedRule?: string;
}

export class PolicyEngine {
  constructor(private policy: Policy) {}

  checkTool(serverName: string, toolName: string): CheckResult {
    const specific = this.policy.servers?.[serverName];
    const wildcard = this.policy.servers?.["*"];

    if (specific?.tools?.deny) {
      const matched = specific.tools.deny.find(p => globToRegex(p).test(toolName));
      if (matched) return { result: "deny", matchedRule: `servers.${serverName}.tools.deny["${matched}"]` };
    }
    if (wildcard?.tools?.deny) {
      const matched = wildcard.tools.deny.find(p => globToRegex(p).test(toolName));
      if (matched) return { result: "deny", matchedRule: `servers["*"].tools.deny["${matched}"]` };
    }
    if (specific?.tools?.allow) {
      const matched = specific.tools.allow.find(p => globToRegex(p).test(toolName));
      if (matched) return { result: "allow", matchedRule: `servers.${serverName}.tools.allow["${matched}"]` };
    }
    if (wildcard?.tools?.allow) {
      const matched = wildcard.tools.allow.find(p => globToRegex(p).test(toolName));
      if (matched) return { result: "allow", matchedRule: `servers["*"].tools.allow["${matched}"]` };
    }
    return { result: this.policy.default, matchedRule: `default["${this.policy.default}"]` };
  }

  checkPath(serverName: string, filePath: string): CheckResult {
    const specific = this.policy.servers?.[serverName];
    const wildcard = this.policy.servers?.["*"];

    if (specific?.paths?.deny) {
      const matched = specific.paths.deny.find(p => filePath.startsWith(expandHome(p)));
      if (matched) return { result: "deny", matchedRule: `servers.${serverName}.paths.deny["${matched}"]` };
    }
    if (wildcard?.paths?.deny) {
      const matched = wildcard.paths.deny.find(p => filePath.startsWith(expandHome(p)));
      if (matched) return { result: "deny", matchedRule: `servers["*"].paths.deny["${matched}"]` };
    }
    if (specific?.paths?.allow) {
      const matched = specific.paths.allow.find(p => filePath.startsWith(expandHome(p)));
      if (matched) return { result: "allow", matchedRule: `servers.${serverName}.paths.allow["${matched}"]` };
    }
    if (wildcard?.paths?.allow) {
      const matched = wildcard.paths.allow.find(p => filePath.startsWith(expandHome(p)));
      if (matched) return { result: "allow", matchedRule: `servers["*"].paths.allow["${matched}"]` };
    }
    return { result: this.policy.default, matchedRule: `default["${this.policy.default}"]` };
  }

  get registryPolicy() { return this.policy.registryPolicy ?? "allow-unverified"; }
}
