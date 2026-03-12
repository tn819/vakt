import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { AGENTS_DIR, expandHome } from "./config";
import { PolicySchema, type Policy, type PolicyResult } from "./schemas";

export function loadPolicy(): Policy | null {
  const path = join(AGENTS_DIR, "policy.json");
  if (!existsSync(path)) return null;
  return PolicySchema.parse(JSON.parse(readFileSync(path, "utf-8")));
}

/** Convert a simple glob pattern (only * as wildcard) to a RegExp. */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function matchesAny(patterns: string[], value: string): boolean {
  return patterns.some(p => globToRegex(p).test(value));
}

export class PolicyEngine {
  constructor(private policy: Policy) {}

  checkTool(serverName: string, toolName: string): PolicyResult {
    const specific = this.policy.servers?.[serverName];
    const wildcard = this.policy.servers?.["*"];

    // Priority: specific deny > wildcard deny > specific allow > wildcard allow > default
    if (specific?.tools?.deny  && matchesAny(specific.tools.deny,  toolName)) return "deny";
    if (wildcard?.tools?.deny  && matchesAny(wildcard.tools.deny,  toolName)) return "deny";
    if (specific?.tools?.allow && matchesAny(specific.tools.allow, toolName)) return "allow";
    if (wildcard?.tools?.allow && matchesAny(wildcard.tools.allow, toolName)) return "allow";
    return this.policy.default;
  }

  checkPath(serverName: string, filePath: string): PolicyResult {
    const specific = this.policy.servers?.[serverName];
    const wildcard = this.policy.servers?.["*"];

    if (specific?.paths?.deny  && specific.paths.deny.some(p => filePath.startsWith(expandHome(p)))) return "deny";
    if (wildcard?.paths?.deny  && wildcard.paths.deny.some(p => filePath.startsWith(expandHome(p)))) return "deny";
    if (specific?.paths?.allow && specific.paths.allow.some(p => filePath.startsWith(expandHome(p)))) return "allow";
    if (wildcard?.paths?.allow && wildcard.paths.allow.some(p => filePath.startsWith(expandHome(p)))) return "allow";
    return this.policy.default;
  }

  get registryPolicy() { return this.policy.registryPolicy ?? "allow-unverified"; }
}
