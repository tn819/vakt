/**
 * Pre-sync safety gate — collects skill and MCP issues before any writes.
 *
 * Skill checks (local, no network):
 *   - unscoped: no `allowed-tools` declaration
 *   - hazards:  static pattern scan (curl-pipe-sh, eval-exec, rm-rf, etc.)
 *
 * MCP checks (local, no network):
 *   - unpinned-npx: `npx -y pkg` without a version pin — supply chain risk
 *   - http-url: server uses plain HTTP, not HTTPS
 *   - unverified: no `registry` field when policy is warn-unverified
 *
 * Severity is driven by policy:
 *   - skills.scopeRequired    → unscoped becomes "error" (default "warn")
 *   - skills.blockOnHazards   → hazards become "error" (default "warn")
 *   - registryPolicy          → unverified servers follow existing policy tier
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readSkillMeta, scanSkillHazards } from "./skills";
import type { McpConfig, Policy } from "./schemas";

export type GateSeverity = "warn" | "error";

export interface GateIssue {
  source: "skill" | "mcp";
  name: string;
  severity: GateSeverity;
  code: string;
  detail: string;
}

export interface GateResult {
  issues: GateIssue[];
  hasErrors: boolean;
  hasWarnings: boolean;
}

// ── Skill checks ─────────────────────────────────────────────────────────────

function checkSkills(skillsDir: string, policy: Policy | null): GateIssue[] {
  if (!existsSync(skillsDir)) return [];
  const issues: GateIssue[] = [];

  for (const entry of readdirSync(skillsDir)) {
    const skillPath = join(skillsDir, entry);
    if (!statSync(skillPath).isDirectory()) continue;

    const meta = readSkillMeta(skillPath);

    // Unscoped: no allowed-tools
    const warnUnscoped = policy?.skills?.warnUnscoped ?? true;
    const scopeRequired = policy?.skills?.scopeRequired;
    if (!meta.allowedTools && (scopeRequired || warnUnscoped)) {
      issues.push({
        source: "skill",
        name: entry,
        severity: scopeRequired ? "error" : "warn",
        code: "unscoped",
        detail: "no allowed-tools declaration — any tool can run under this skill",
      });
    }

    // Hazard scan
    const hazards = scanSkillHazards(skillPath);
    for (const h of hazards) {
      issues.push({
        source: "skill",
        name: entry,
        severity: policy?.skills?.blockOnHazards ? "error" : "warn",
        code: h.pattern,
        detail: `${h.file}:${h.line}`,
      });
    }
  }

  return issues;
}

// ── MCP checks ───────────────────────────────────────────────────────────────

/** Returns the npm package name from an npx command, or null if not npx. */
function extractNpxPackage(command: string, args: string[]): string | null {
  if (command !== "npx") return null;
  // Strip flags (-y, --yes, etc.) to find the package argument
  const pkg = args.find(a => !a.startsWith("-"));
  return pkg ?? null;
}

/** True if a package name has an explicit version pin (e.g. `@scope/pkg@1.2.3`). */
function isVersionPinned(pkg: string): boolean {
  // Scoped: @scope/name@version  →  split on last @
  // Unscoped: name@version       →  has @ after the first char
  const atIndex = pkg.lastIndexOf("@");
  return atIndex > 0; // index 0 = leading @ of scoped package name
}

function checkMcpServers(mcpConfig: McpConfig, policy: Policy | null): GateIssue[] {
  const issues: GateIssue[] = [];
  const warnUnverified = policy?.registryPolicy !== "allow-unverified";

  for (const [name, server] of Object.entries(mcpConfig)) {
    // HTTP URL (not HTTPS)
    if ("url" in server && server.url.startsWith("http://")) {
      issues.push({
        source: "mcp",
        name,
        severity: "warn",
        code: "http-url",
        detail: `${server.url} — unencrypted connection`,
      });
    }

    // Unpinned npx
    if ("command" in server && server.command === "npx") {
      const pkg = extractNpxPackage(server.command, server.args ?? []);
      if (pkg && !isVersionPinned(pkg)) {
        issues.push({
          source: "mcp",
          name,
          severity: "warn",
          code: "unpinned-npx",
          detail: `${pkg} has no version pin — resolves to latest at runtime`,
        });
      }
    }

    // Unverified origin (no registry field)
    if (warnUnverified && !("registry" in server)) {
      issues.push({
        source: "mcp",
        name,
        severity: "warn",
        code: "unverified",
        detail: "no registry field — provenance unknown (set policy.registryPolicy to allow-unverified to silence)",
      });
    }
  }

  return issues;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function collectGateIssues(
  skillsDir: string,
  mcpConfig: McpConfig,
  policy: Policy | null,
): GateResult {
  const issues = [
    ...checkSkills(skillsDir, policy),
    ...checkMcpServers(mcpConfig, policy),
  ];
  return {
    issues,
    hasErrors:   issues.some(i => i.severity === "error"),
    hasWarnings: issues.some(i => i.severity === "warn"),
  };
}
