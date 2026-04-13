import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import {
  syncCursorRule,
  syncOpenCodeAgentsMd,
  syncMistralAgentsMd,
  syncHookProvider,
  syncPolicyHooks,
  type HookResult,
} from "./policy-hooks";
import type { Policy, ToolPermission } from "./schemas";

const TEST_HOME = join(process.cwd(), ".test-home-policy-hooks");

const mockPolicy: Policy = {
  version: "1",
  default: "deny",
  registryPolicy: "warn-unverified",
  tools: {
    allow: [{ tool: "Read" }, { tool: "Edit" }, { tool: "Bash" }] as ToolPermission[],
    deny: [{ tool: "WebSearch" }, { tool: "WebFetch" }] as ToolPermission[],
  },
};

const emptyPolicy: Policy = {
  version: "1",
  default: "allow",
  registryPolicy: "allow-unverified",
  tools: {
    allow: [],
    deny: [],
  },
};

describe("policy-hooks", () => {
  beforeEach(() => {
    if (existsSync(TEST_HOME)) {
      rmSync(TEST_HOME, { recursive: true });
    }
    mkdirSync(TEST_HOME, { recursive: true });
    process.env.HOME = TEST_HOME;
    process.env.USERPROFILE = TEST_HOME;
  });

  afterEach(() => {
    if (existsSync(TEST_HOME)) {
      rmSync(TEST_HOME, { recursive: true });
    }
  });

  describe("syncCursorRule", () => {
    it("creates rule file when policy has tools", () => {
      const result = syncCursorRule(mockPolicy, false);

      expect(result.written).toBe(true);
      expect(result.action).toBe("created");
      expect(result.path).toContain("vakt-policy.mdc");
      expect(existsSync(result.path)).toBe(true);

      const content = readFileSync(result.path, "utf-8");
      expect(content).toContain("vakt policy");
      expect(content).toContain("alwaysApply: true");
    });

    it("removes rule file when policy has no tools", () => {
      const rulesDir = join(TEST_HOME, ".cursor", "rules");
      mkdirSync(rulesDir, { recursive: true });
      const rulePath = join(rulesDir, "vakt-policy.mdc");
      writeFileSync(rulePath, "test content");

      const result = syncCursorRule(emptyPolicy, false);

      expect(result.written).toBe(true);
      expect(result.action).toBe("removed");
      expect(existsSync(rulePath)).toBe(false);
    });

    it("skips when no file exists and no tools", () => {
      const result = syncCursorRule(emptyPolicy, false);

      expect(result.written).toBe(false);
      expect(result.action).toBe("skipped");
    });

    it("returns dry-run action when dryRun is true", () => {
      const result = syncCursorRule(mockPolicy, true);

      expect(result.written).toBe(false);
      expect(result.action).toBe("dry-run");
      expect(existsSync(result.path)).toBe(false);
    });

    it("updates existing rule file", () => {
      const rulesDir = join(TEST_HOME, ".cursor", "rules");
      mkdirSync(rulesDir, { recursive: true });
      const rulePath = join(rulesDir, "vakt-policy.mdc");
      writeFileSync(rulePath, "old content");

      const result = syncCursorRule(mockPolicy, false);

      expect(result.written).toBe(true);
      expect(result.action).toBe("updated");

      const content = readFileSync(rulePath, "utf-8");
      expect(content).toContain("vakt policy");
    });
  });

  describe("syncOpenCodeAgentsMd", () => {
    it("creates AGENTS.md when policy has tools", () => {
      const result = syncOpenCodeAgentsMd(mockPolicy, false);

      expect(result.written).toBe(true);
      expect(result.action).toBe("created");
      expect(result.path).toContain("AGENTS.md");
      expect(existsSync(result.path)).toBe(true);

      const content = readFileSync(result.path, "utf-8");
      expect(content).toContain("vakt policy");
      expect(content).toContain("BEGIN_VAKT_MANAGED");
      expect(content).toContain("END_VAKT_MANAGED");
    });

    it("updates existing AGENTS.md with markers", () => {
      const agentsDir = join(TEST_HOME, ".config", "opencode");
      mkdirSync(agentsDir, { recursive: true });
      const agentsPath = join(agentsDir, "AGENTS.md");
      writeFileSync(agentsPath, "# User Content\n\nSome instructions\n");

      const result = syncOpenCodeAgentsMd(mockPolicy, false);

      expect(result.written).toBe(true);
      expect(result.action).toBe("updated");

      const content = readFileSync(agentsPath, "utf-8");
      expect(content).toContain("# User Content");
      expect(content).toContain("Some instructions");
      expect(content).toContain("vakt policy");
      expect(content).toContain("BEGIN_VAKT_MANAGED");
    });

    it("removes vakt section when policy has no tools", () => {
      const agentsDir = join(TEST_HOME, ".config", "opencode");
      mkdirSync(agentsDir, { recursive: true });
      const agentsPath = join(agentsDir, "AGENTS.md");
      writeFileSync(
        agentsPath,
        "# User Content\n\n<!-- BEGIN_VAKT_MANAGED -->\n[vakt policy]\n<!-- END_VAKT_MANAGED -->\n"
      );

      const result = syncOpenCodeAgentsMd(emptyPolicy, false);

      expect(result.written).toBe(true);
      expect(result.action).toBe("removed");

      const content = readFileSync(agentsPath, "utf-8");
      expect(content).toContain("# User Content");
      expect(content).not.toContain("BEGIN_VAKT_MANAGED");
    });

    it("deletes AGENTS.md when only vakt content exists and removing", () => {
      const agentsDir = join(TEST_HOME, ".config", "opencode");
      mkdirSync(agentsDir, { recursive: true });
      const agentsPath = join(agentsDir, "AGENTS.md");
      writeFileSync(
        agentsPath,
        "<!-- BEGIN_VAKT_MANAGED -->\n[vakt policy]\n<!-- END_VAKT_MANAGED -->\n"
      );

      const result = syncOpenCodeAgentsMd(emptyPolicy, false);

      expect(result.written).toBe(true);
      expect(result.action).toBe("removed");
      expect(existsSync(agentsPath)).toBe(false);
    });

    it("returns dry-run without writing", () => {
      const result = syncOpenCodeAgentsMd(mockPolicy, true);

      expect(result.written).toBe(false);
      expect(result.action).toBe("dry-run");
      expect(existsSync(result.path)).toBe(false);
    });
  });

  describe("syncMistralAgentsMd", () => {
    it("creates AGENTS.md for Mistral when policy has tools", () => {
      const result = syncMistralAgentsMd(mockPolicy, false);

      expect(result.written).toBe(true);
      expect(result.action).toBe("created");
      expect(result.path).toContain(".vibe");
      expect(existsSync(result.path)).toBe(true);
    });

    it("removes Mistral AGENTS.md section when policy has no tools", () => {
      const vibeDir = join(TEST_HOME, ".vibe");
      mkdirSync(vibeDir, { recursive: true });
      const agentsPath = join(vibeDir, "AGENTS.md");
      writeFileSync(
        agentsPath,
        "<!-- BEGIN_VAKT_MANAGED -->\n[vakt policy]\n<!-- END_VAKT_MANAGED -->\n"
      );

      const result = syncMistralAgentsMd(emptyPolicy, false);

      expect(result.written).toBe(true);
      expect(result.action).toBe("removed");
      expect(existsSync(agentsPath)).toBe(false);
    });
  });

  describe("syncHookProvider", () => {
    it("creates hook script for Claude", () => {
      const result = syncHookProvider("claude", mockPolicy, false);

      expect(result.written).toBe(true);
      expect(result.action).toBe("created");
      expect(result.path).toContain("vakt-policy.sh");
      expect(existsSync(result.path)).toBe(true);

      const content = readFileSync(result.path, "utf-8");
      expect(content).toContain("#!/bin/bash");
      expect(content).toContain("vakt policy");
      expect(content).toContain('"hookSpecificOutput"');
    });

    it("creates hook script for Gemini", () => {
      const result = syncHookProvider("gemini", mockPolicy, false);

      expect(result.written).toBe(true);
      expect(result.action).toBe("created");
      expect(result.path).toContain(".gemini");
      expect(existsSync(result.path)).toBe(true);
    });

    it("creates hook script for Codex", () => {
      const result = syncHookProvider("codex", mockPolicy, false);

      expect(result.written).toBe(true);
      expect(result.action).toBe("created");
      expect(result.path).toContain(".codex");
      expect(existsSync(result.path)).toBe(true);
    });

    it("creates Windsurf-style hook script", () => {
      const result = syncHookProvider("windsurf", mockPolicy, false);

      expect(result.written).toBe(true);
      expect(result.action).toBe("created");
      expect(result.path).toContain(".codeium");

      const content = readFileSync(result.path, "utf-8");
      expect(content).toContain("#!/bin/bash");
      expect(content).toContain("echo");
    });

    it("removes hook when policy has no tools", () => {
      const hooksDir = join(TEST_HOME, ".claude", "hooks");
      mkdirSync(hooksDir, { recursive: true });
      const hookPath = join(hooksDir, "vakt-policy.sh");
      writeFileSync(hookPath, "#!/bin/bash\necho test");

      const result = syncHookProvider("claude", emptyPolicy, false);

      expect(result.written).toBe(true);
      expect(result.action).toBe("removed");
      expect(existsSync(hookPath)).toBe(false);
    });

    it("creates hooks.json config for Claude", () => {
      syncHookProvider("claude", mockPolicy, false);

      const configPath = join(TEST_HOME, ".claude", "hooks.json");
      expect(existsSync(configPath)).toBe(true);

      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      expect(config.hooks).toBeDefined();
      expect(config.hooks.length).toBe(1);
      expect(config.hooks[0].name).toBe("vakt-policy");
      expect(config.hooks[0].events).toContain("UserPromptSubmit");
    });

    it("updates existing hooks.json", () => {
      const claudeDir = join(TEST_HOME, ".claude");
      mkdirSync(claudeDir, { recursive: true });
      const configPath = join(claudeDir, "hooks.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          hooks: [
            { name: "existing-hook", command: "echo test", events: ["UserPromptSubmit"] },
          ],
        })
      );

      syncHookProvider("claude", mockPolicy, false);

      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      expect(config.hooks.length).toBe(2);
      expect(config.hooks.some((h: { name: string }) => h.name === "vakt-policy")).toBe(true);
    });

    it("returns dry-run without writing files", () => {
      const result = syncHookProvider("claude", mockPolicy, true);

      expect(result.written).toBe(false);
      expect(result.action).toBe("dry-run");
      expect(existsSync(result.path)).toBe(false);
    });
  });

  describe("syncPolicyHooks", () => {
    it("routes to cursor handler", () => {
      const result = syncPolicyHooks("cursor", mockPolicy, false);
      expect(result.path).toContain(".cursor");
    });

    it("routes to opencode handler", () => {
      const result = syncPolicyHooks("opencode", mockPolicy, false);
      expect(result.path).toContain("opencode");
    });

    it("routes to vibe handler", () => {
      const result = syncPolicyHooks("vibe", mockPolicy, false);
      expect(result.path).toContain(".vibe");
    });

    it("routes to claude hook handler", () => {
      const result = syncPolicyHooks("claude", mockPolicy, false);
      expect(result.path).toContain(".claude");
      expect(result.path).toContain("vakt-policy.sh");
    });

    it("routes to gemini hook handler", () => {
      const result = syncPolicyHooks("gemini", mockPolicy, false);
      expect(result.path).toContain(".gemini");
    });

    it("routes to codex hook handler", () => {
      const result = syncPolicyHooks("codex", mockPolicy, false);
      expect(result.path).toContain(".codex");
    });

    it("routes to windsurf hook handler", () => {
      const result = syncPolicyHooks("windsurf", mockPolicy, false);
      expect(result.path).toContain(".codeium");
    });

    it("returns skipped for unknown provider", () => {
      const result = syncPolicyHooks("unknown" as "claude", mockPolicy, false);
      expect(result.action).toBe("skipped");
    });
  });

  describe("edge cases", () => {
    it("handles null policy gracefully", () => {
      const result = syncCursorRule(null, false);
      expect(result.written).toBe(false);
      expect(result.action).toBe("skipped");
    });

    it("handles policy with only allow tools", () => {
      const allowOnlyPolicy: Policy = {
        version: "1",
        default: "allow",
        registryPolicy: "allow-unverified",
        tools: {
          allow: [{ tool: "Read" }, { tool: "Edit" }] as ToolPermission[],
          deny: [],
        },
      };

      const result = syncCursorRule(allowOnlyPolicy, false);
      expect(result.written).toBe(true);

      const content = readFileSync(result.path, "utf-8");
      expect(content).toContain("Allow:");
      expect(content).not.toContain("Deny:");
    });

    it("handles policy with only deny tools", () => {
      const denyOnlyPolicy: Policy = {
        version: "1",
        default: "allow",
        registryPolicy: "allow-unverified",
        tools: {
          allow: [],
          deny: [{ tool: "Delete" }] as ToolPermission[],
        },
      };

      const result = syncCursorRule(denyOnlyPolicy, false);
      expect(result.written).toBe(true);

      const content = readFileSync(result.path, "utf-8");
      expect(content).not.toContain("Allow:");
      expect(content).toContain("Deny:");
    });
  });
});
