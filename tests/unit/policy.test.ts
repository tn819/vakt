import { describe, it, expect } from "bun:test";
import { PolicyEngine } from "../../src/lib/policy";
import type { Policy } from "../../src/lib/schemas";

const strict: Policy = {
  version: "1",
  default: "deny",
  registryPolicy: "warn-unverified",
  servers: {
    github: {
      tools: { allow: ["list_repos", "get_file", "create_issue"], deny: ["delete_repo"] },
    },
    "*": {
      tools: { deny: ["*exec*", "*shell*", "*eval*", "*run*"] },
    },
  },
};

describe("PolicyEngine.checkTool", () => {
  const engine = new PolicyEngine(strict);

  it("allows an explicitly allowed tool", () => {
    expect(engine.checkTool("github", "list_repos")).toBe("allow");
  });

  it("denies an explicitly denied tool on specific server", () => {
    expect(engine.checkTool("github", "delete_repo")).toBe("deny");
  });

  it("denies an unlisted tool when default is deny", () => {
    expect(engine.checkTool("github", "unknown_tool")).toBe("deny");
  });

  it("denies tool matching wildcard glob on * server", () => {
    expect(engine.checkTool("filesystem", "execute_shell")).toBe("deny");
  });

  it("specific server deny beats * server allow", () => {
    const p: Policy = {
      version: "1",
      default: "allow",
      registryPolicy: "allow-unverified",
      servers: {
        github: { tools: { deny: ["delete_repo"] } },
        "*": { tools: { allow: ["delete_repo"] } },
      },
    };
    expect(new PolicyEngine(p).checkTool("github", "delete_repo")).toBe("deny");
  });

  it("allows all when default is allow and no rules match", () => {
    const permissive: Policy = { version: "1", default: "allow", registryPolicy: "allow-unverified" };
    expect(new PolicyEngine(permissive).checkTool("any", "any_tool")).toBe("allow");
  });
});
