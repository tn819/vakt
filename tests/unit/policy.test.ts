import { describe, it, expect, beforeEach } from "bun:test";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { PolicyEngine, loadPolicy, loadMergedPolicy, mergePolicies } from "../../src/lib/policy";
import type { Policy } from "../../src/lib/schemas";

const AGENTS = process.env["AGENTS_DIR"]!;

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

describe("loadPolicy", () => {
  beforeEach(() => {
    mkdirSync(AGENTS, { recursive: true });
    const f = join(AGENTS, "policy.json");
    if (existsSync(f)) rmSync(f);
  });

  it("returns null when policy.json is missing", () => {
    expect(loadPolicy()).toBeNull();
  });

  it("parses and returns policy when file exists", () => {
    const p: Policy = { version: "1", default: "allow", registryPolicy: "allow-unverified" };
    writeFileSync(join(AGENTS, "policy.json"), JSON.stringify(p));
    const result = loadPolicy();
    expect(result?.default).toBe("allow");
    expect(result?.version).toBe("1");
    expect(result?.registryPolicy).toBe("allow-unverified");
  });
});

describe("loadMergedPolicy", () => {
  beforeEach(() => {
    mkdirSync(AGENTS, { recursive: true });
    for (const f of ["policy.json", "policy.remote.json"]) {
      const p = join(AGENTS, f);
      if (existsSync(p)) rmSync(p);
    }
  });

  it("returns null when neither file exists", () => {
    expect(loadMergedPolicy(AGENTS)).toBeNull();
  });

  it("returns local when only local exists", () => {
    const p: Policy = { version: "1", default: "deny", registryPolicy: "allow-unverified" };
    writeFileSync(join(AGENTS, "policy.json"), JSON.stringify(p));
    expect(loadMergedPolicy(AGENTS)?.default).toBe("deny");
  });

  it("returns remote when only remote exists", () => {
    const p: Policy = { version: "1", default: "allow", registryPolicy: "registry-only" };
    writeFileSync(join(AGENTS, "policy.remote.json"), JSON.stringify(p));
    expect(loadMergedPolicy(AGENTS)?.default).toBe("allow");
  });

  it("merges remote and local when both exist", () => {
    const remote: Policy = {
      version: "1", default: "deny", registryPolicy: "allow-unverified",
      servers: { "remote-only-server": { tools: { deny: ["rm_rf"] } } },
    };
    const local: Policy  = { version: "1", default: "allow", registryPolicy: "allow-unverified" };
    writeFileSync(join(AGENTS, "policy.remote.json"), JSON.stringify(remote));
    writeFileSync(join(AGENTS, "policy.json"),        JSON.stringify(local));
    const result = loadMergedPolicy(AGENTS);
    expect(result?.default).toBe("allow");
    expect(result?.servers?.["remote-only-server"]).toBeDefined();
  });

  it("remote _meta.lockedKeys prevents local from overriding", () => {
    const remote = { version: "1", default: "deny", registryPolicy: "allow-unverified", _meta: { lockedKeys: ["default"] } };
    const local: Policy  = { version: "1", default: "allow", registryPolicy: "allow-unverified" };
    writeFileSync(join(AGENTS, "policy.remote.json"), JSON.stringify(remote));
    writeFileSync(join(AGENTS, "policy.json"),        JSON.stringify(local));
    expect(loadMergedPolicy(AGENTS)?.default).toBe("deny");
  });

  it("silently ignores invalid JSON in policy files", () => {
    writeFileSync(join(AGENTS, "policy.remote.json"), "not json{{");
    const local: Policy = { version: "1", default: "allow", registryPolicy: "allow-unverified" };
    writeFileSync(join(AGENTS, "policy.json"), JSON.stringify(local));
    expect(loadMergedPolicy(AGENTS)?.default).toBe("allow");
  });
});

describe("mergePolicies", () => {
  const base: Policy = { version: "1", default: "deny", registryPolicy: "allow-unverified" };

  it("local default overrides remote when not locked", () => {
    const local: Policy = { ...base, default: "allow" };
    expect(mergePolicies(base, local).default).toBe("allow");
  });

  it("merges server tool lists — deny lists are unioned", () => {
    const remote: Policy = { ...base, servers: { github: { tools: { deny: ["delete_repo"] } } } };
    const local: Policy  = { ...base, servers: { github: { tools: { deny: ["push_branch"] } } } };
    const merged = mergePolicies(remote, local);
    expect(merged.servers?.["github"]?.tools?.deny).toContain("delete_repo");
    expect(merged.servers?.["github"]?.tools?.deny).toContain("push_branch");
    expect(merged.servers?.["github"]?.tools?.deny).toHaveLength(2);
  });

  it("merges server tool lists — allow lists are unioned", () => {
    const remote: Policy = { ...base, servers: { github: { tools: { allow: ["list_repos"] } } } };
    const local: Policy  = { ...base, servers: { github: { tools: { allow: ["get_file"] } } } };
    const merged = mergePolicies(remote, local);
    expect(merged.servers?.["github"]?.tools?.allow).toContain("list_repos");
    expect(merged.servers?.["github"]?.tools?.allow).toContain("get_file");
    expect(merged.servers?.["github"]?.tools?.allow).toHaveLength(2);
  });

  it("local can add new server entries not in remote", () => {
    const remote: Policy = { ...base, servers: {} };
    const local: Policy  = { ...base, servers: { newserver: { tools: { deny: ["rm_rf"] } } } };
    const merged = mergePolicies(remote, local);
    expect(merged.servers?.["newserver"]).toBeDefined();
    expect(merged.servers?.["newserver"]?.tools?.deny).toContain("rm_rf");
  });

  it("_meta key from local is never applied", () => {
    const remote: Policy = { ...base };
    const local = { ...base, _meta: { lockedKeys: ["default"] } } as unknown as Policy;
    const merged = mergePolicies(remote, local);
    expect((merged as any)._meta).toBeUndefined();
  });
});

describe("PolicyEngine.checkPath", () => {
  it("denies a path matching specific server deny list", () => {
    const p: Policy = {
      version: "1", default: "allow", registryPolicy: "allow-unverified",
      servers: { fs: { paths: { deny: ["/etc"] } } },
    };
    expect(new PolicyEngine(p).checkPath("fs", "/etc/passwd")).toBe("deny");
  });

  it("denies a path matching wildcard server deny list", () => {
    const p: Policy = {
      version: "1", default: "allow", registryPolicy: "allow-unverified",
      servers: { "*": { paths: { deny: ["/etc"] } } },
    };
    expect(new PolicyEngine(p).checkPath("any", "/etc/passwd")).toBe("deny");
  });

  it("allows a path in specific server allow list", () => {
    const p: Policy = {
      version: "1", default: "deny", registryPolicy: "allow-unverified",
      servers: { fs: { paths: { allow: ["~/projects"] } } },
    };
    const home = process.env["HOME"]!;
    expect(new PolicyEngine(p).checkPath("fs", `${home}/projects/app`)).toBe("allow");
  });

  it("falls through to default when no path rule matches", () => {
    const p: Policy = { version: "1", default: "allow", registryPolicy: "allow-unverified" };
    expect(new PolicyEngine(p).checkPath("fs", "/tmp/file.txt")).toBe("allow");
  });

  it("specific server deny beats wildcard allow for paths", () => {
    const p: Policy = {
      version: "1", default: "allow", registryPolicy: "allow-unverified",
      servers: {
        fs: { paths: { deny: ["/etc"] } },
        "*": { paths: { allow: ["/etc"] } },
      },
    };
    expect(new PolicyEngine(p).checkPath("fs", "/etc/passwd")).toBe("deny");
  });
});

describe("PolicyEngine.registryPolicy", () => {
  it("returns registryPolicy from policy", () => {
    const p: Policy = { version: "1", default: "allow", registryPolicy: "registry-only" };
    expect(new PolicyEngine(p).registryPolicy).toBe("registry-only");
  });

  it("defaults to allow-unverified when registryPolicy is undefined", () => {
    const p = { version: "1" as const, default: "allow" as const } as Policy;
    expect(new PolicyEngine(p).registryPolicy).toBe("allow-unverified");
  });
});
