import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { expandHome } from "./config";
import type { Policy, ToolPermission } from "./schemas";
import { serializeToolPermission } from "./permissions";

const VAKT_MARKER_START = "<!-- BEGIN_VAKT_MANAGED -->";
const VAKT_MARKER_END = "<!-- END_VAKT_MANAGED -->";

export interface HookResult {
  written: boolean;
  path: string;
  action: "created" | "updated" | "removed" | "skipped" | "dry-run";
}

function formatPolicyContext(allow: ToolPermission[], deny: ToolPermission[]): string {
  const lines = ["[vakt policy]"];
  if (allow.length > 0) {
    lines.push(`Allow: ${allow.map(serializeToolPermission).join(", ")}`);
  }
  if (deny.length > 0) {
    lines.push(`Deny: ${deny.map(serializeToolPermission).join(", ")}`);
  }
  return lines.join("\n");
}

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ── Cursor: .cursor/rules/vakt-policy.mdc ────────────────────────────────────

export function syncCursorRule(policy: Policy | null, dryRun: boolean): HookResult {
  const rulesDir = expandHome("~/.cursor/rules");
  const rulePath = join(rulesDir, "vakt-policy.mdc");
  
  const allow = policy?.tools?.allow ?? [];
  const deny = policy?.tools?.deny ?? [];
  
  if (allow.length + deny.length === 0) {
    if (existsSync(rulePath)) {
      if (dryRun) return { written: false, path: rulePath, action: "dry-run" };
      unlinkSync(rulePath);
      return { written: true, path: rulePath, action: "removed" };
    }
    return { written: false, path: rulePath, action: "skipped" };
  }
  
  const content = `---
description: "vakt active policy — tool permissions"
alwaysApply: true
---

${VAKT_MARKER_START}
${formatPolicyContext(allow, deny)}
${VAKT_MARKER_END}
`;
  
  if (dryRun) return { written: false, path: rulePath, action: "dry-run" };
  
  ensureDir(rulePath);
  writeFileSync(rulePath, content, "utf-8");
  return { written: true, path: rulePath, action: existsSync(rulePath) ? "updated" : "created" };
}

// ── OpenCode/Mistral: AGENTS.md injection ────────────────────────────────────

function updateAgentsMd(agentsMdPath: string, policyContext: string, dryRun: boolean): HookResult {
  let content = "";
  if (existsSync(agentsMdPath)) {
    content = readFileSync(agentsMdPath, "utf-8");
  }
  
  const markerRegex = new RegExp(
    `${VAKT_MARKER_START}[\\s\\S]*?${VAKT_MARKER_END}`,
    "g"
  );
  
  const newBlock = `${VAKT_MARKER_START}\n${policyContext}\n${VAKT_MARKER_END}`;
  
  let newContent: string;
  if (markerRegex.test(content)) {
    newContent = content.replace(markerRegex, newBlock);
  } else {
    newContent = content.trim() + "\n\n" + newBlock + "\n";
  }
  
  if (dryRun) return { written: false, path: agentsMdPath, action: "dry-run" };
  
  ensureDir(agentsMdPath);
  writeFileSync(agentsMdPath, newContent, "utf-8");
  return { written: true, path: agentsMdPath, action: existsSync(agentsMdPath) ? "updated" : "created" };
}

export function syncOpenCodeAgentsMd(policy: Policy | null, dryRun: boolean): HookResult {
  const allow = policy?.tools?.allow ?? [];
  const deny = policy?.tools?.deny ?? [];
  const agentsMdPath = expandHome("~/.config/opencode/AGENTS.md");
  
  if (allow.length + deny.length === 0) {
    if (!existsSync(agentsMdPath)) {
      return { written: false, path: agentsMdPath, action: "skipped" };
    }
    const content = readFileSync(agentsMdPath, "utf-8");
    const markerRegex = new RegExp(
      `${VAKT_MARKER_START}[\\s\\S]*?${VAKT_MARKER_END}\\n?`,
      "g"
    );
    if (!markerRegex.test(content)) {
      return { written: false, path: agentsMdPath, action: "skipped" };
    }
    if (dryRun) return { written: false, path: agentsMdPath, action: "dry-run" };
    const newContent = content.replace(markerRegex, "").trim();
    if (newContent) {
      writeFileSync(agentsMdPath, newContent + "\n", "utf-8");
    } else {
      unlinkSync(agentsMdPath);
    }
    return { written: true, path: agentsMdPath, action: "removed" };
  }
  
  return updateAgentsMd(agentsMdPath, formatPolicyContext(allow, deny), dryRun);
}

export function syncMistralAgentsMd(policy: Policy | null, dryRun: boolean): HookResult {
  const allow = policy?.tools?.allow ?? [];
  const deny = policy?.tools?.deny ?? [];
  const agentsMdPath = expandHome("~/.vibe/AGENTS.md");
  
  if (allow.length + deny.length === 0) {
    if (!existsSync(agentsMdPath)) {
      return { written: false, path: agentsMdPath, action: "skipped" };
    }
    const content = readFileSync(agentsMdPath, "utf-8");
    const markerRegex = new RegExp(
      `${VAKT_MARKER_START}[\\s\\S]*?${VAKT_MARKER_END}\\n?`,
      "g"
    );
    if (!markerRegex.test(content)) {
      return { written: false, path: agentsMdPath, action: "skipped" };
    }
    if (dryRun) return { written: false, path: agentsMdPath, action: "dry-run" };
    const newContent = content.replace(markerRegex, "").trim();
    if (newContent) {
      writeFileSync(agentsMdPath, newContent + "\n", "utf-8");
    } else {
      unlinkSync(agentsMdPath);
    }
    return { written: true, path: agentsMdPath, action: "removed" };
  }
  
  return updateAgentsMd(agentsMdPath, formatPolicyContext(allow, deny), dryRun);
}

// ── Hook-capable providers: Hook scripts ─────────────────────────────────────

interface HookScript {
  hookPath: string;
  hookConfigPath: string;
  hookType: "claude" | "gemini" | "codex" | "windsurf";
}

function getHookPaths(provider: "claude" | "gemini" | "codex" | "windsurf"): HookScript | null {
  switch (provider) {
    case "claude":
      return {
        hookPath: expandHome("~/.claude/hooks/vakt-policy.sh"),
        hookConfigPath: expandHome("~/.claude/hooks.json"),
        hookType: "claude",
      };
    case "gemini":
      return {
        hookPath: expandHome("~/.gemini/hooks/vakt-policy.sh"),
        hookConfigPath: expandHome("~/.gemini/hooks.json"),
        hookType: "gemini",
      };
    case "codex":
      return {
        hookPath: expandHome("~/.codex/hooks/vakt-policy.sh"),
        hookConfigPath: expandHome("~/.codex/hooks.json"),
        hookType: "codex",
      };
    case "windsurf":
      return {
        hookPath: expandHome("~/.codeium/windsurf/hooks/vakt-policy.sh"),
        hookConfigPath: expandHome("~/.codeium/windsurf/hooks.json"),
        hookType: "windsurf",
      };
    default:
      return null;
  }
}

function generateHookScript(policyContext: string): string {
  return `#!/bin/bash
# ${VAKT_MARKER_START}
# This hook injects vakt policy context into agent prompts
# Generated by vakt sync — do not edit manually

cat <<'HOOK_EOF'
{
  "hookSpecificOutput": {
    "additionalContext": "${policyContext.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"
  }
}
HOOK_EOF
`;
}

function generateWindsurfHookScript(policyContext: string): string {
  return `#!/bin/bash
# ${VAKT_MARKER_START}
# This hook injects vakt policy context into agent prompts
# Generated by vakt sync — do not edit manually

echo "${policyContext.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"
`;
}

interface HookConfig {
  hooks?: Array<{
    name: string;
    command: string;
    events: string[];
  }>;
}

function updateHookConfig(configPath: string, hookName: string, hookCommand: string, dryRun: boolean): void {
  if (dryRun) return;
  
  let config: HookConfig = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8")) as HookConfig;
    } catch {
      config = {};
    }
  }
  
  const hooks = config.hooks ?? [];
  const existingIndex = hooks.findIndex(h => h.name === hookName);
  
  const newHook = {
    name: hookName,
    command: hookCommand,
    events: ["UserPromptSubmit"],
  };
  
  if (existingIndex >= 0) {
    hooks[existingIndex] = newHook;
  } else {
    hooks.push(newHook);
  }
  
  config.hooks = hooks;
  ensureDir(configPath);
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

function removeHookConfig(configPath: string, hookName: string, dryRun: boolean): void {
  if (dryRun || !existsSync(configPath)) return;
  
  let config: HookConfig = {};
  try {
    config = JSON.parse(readFileSync(configPath, "utf-8")) as HookConfig;
  } catch {
    return;
  }
  
  if (!config.hooks) return;
  
  const filtered = config.hooks.filter(h => h.name !== hookName);
  if (filtered.length === config.hooks.length) return;
  
  if (filtered.length === 0) {
    delete config.hooks;
  } else {
    config.hooks = filtered;
  }
  
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function syncHookProvider(
  provider: "claude" | "gemini" | "codex" | "windsurf",
  policy: Policy | null,
  dryRun: boolean
): HookResult {
  const paths = getHookPaths(provider);
  if (!paths) {
    return { written: false, path: "", action: "skipped" };
  }
  
  const { hookPath, hookConfigPath, hookType } = paths;
  const allow = policy?.tools?.allow ?? [];
  const deny = policy?.tools?.deny ?? [];
  
  if (allow.length + deny.length === 0) {
    if (existsSync(hookPath)) {
      if (dryRun) return { written: false, path: hookPath, action: "dry-run" };
      unlinkSync(hookPath);
      removeHookConfig(hookConfigPath, "vakt-policy", dryRun);
      return { written: true, path: hookPath, action: "removed" };
    }
    return { written: false, path: hookPath, action: "skipped" };
  }
  
  const policyContext = formatPolicyContext(allow, deny);
  const script = hookType === "windsurf" 
    ? generateWindsurfHookScript(policyContext)
    : generateHookScript(policyContext);
  
  if (dryRun) return { written: false, path: hookPath, action: "dry-run" };
  
  ensureDir(hookPath);
  writeFileSync(hookPath, script, { encoding: "utf-8", mode: 0o755 });
  updateHookConfig(hookConfigPath, "vakt-policy", hookPath, dryRun);
  
  return { written: true, path: hookPath, action: existsSync(hookPath) ? "updated" : "created" };
}

// ── Main entry point ─────────────────────────────────────────────────────────

export function syncPolicyHooks(
  provider: "claude" | "cursor" | "gemini" | "codex" | "windsurf" | "vibe" | "opencode",
  policy: Policy | null,
  dryRun: boolean
): HookResult {
  switch (provider) {
    case "claude":
      return syncHookProvider("claude", policy, dryRun);
    case "gemini":
      return syncHookProvider("gemini", policy, dryRun);
    case "codex":
      return syncHookProvider("codex", policy, dryRun);
    case "windsurf":
      return syncHookProvider("windsurf", policy, dryRun);
    case "cursor":
      return syncCursorRule(policy, dryRun);
    case "opencode":
      return syncOpenCodeAgentsMd(policy, dryRun);
    case "vibe":
      return syncMistralAgentsMd(policy, dryRun);
    default:
      return { written: false, path: "", action: "skipped" };
  }
}
