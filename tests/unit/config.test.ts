import { describe, it, expect, beforeEach } from "bun:test";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { loadMcpConfig, loadAgentConfig, expandPaths, expandHome } from "../../src/lib/config";

// AGENTS_DIR is set by setup.ts preload — points to a sandboxed tmp directory
const AGENTS = process.env["AGENTS_DIR"]!;

beforeEach(() => {
  mkdirSync(AGENTS, { recursive: true });
});

describe("loadMcpConfig", () => {
  it("returns empty object when file is missing", () => {
    expect(loadMcpConfig()).toEqual({});
  });

  it("parses a valid stdio server", () => {
    writeFileSync(
      join(AGENTS, "mcp-config.json"),
      JSON.stringify({ github: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] } }),
    );
    const cfg = loadMcpConfig();
    expect((cfg["github"] as any).command).toBe("npx");
  });

  it("throws on malformed JSON", () => {
    writeFileSync(join(AGENTS, "mcp-config.json"), "not json {{");
    expect(() => loadMcpConfig()).toThrow();
  });
});

describe("loadAgentConfig", () => {
  it("returns defaults when file is missing", () => {
    const cfg = loadAgentConfig();
    expect(cfg.secretsBackend).toBe("auto");
    expect(cfg.paths).toBeDefined();
  });

  it("merges partial config with defaults", () => {
    writeFileSync(
      join(AGENTS, "config.json"),
      JSON.stringify({ paths: { code: "~/Projects" } }),
    );
    expect(loadAgentConfig().paths["code"]).toBe("~/Projects");
  });
});

describe("expandPaths", () => {
  const paths = { code: "~/Projects", vault: "~/Documents/vault" };

  it("expands {{paths.code}} template", () => {
    const result = expandPaths("{{paths.code}}/myapp", paths);
    expect(result).toContain("/Projects/myapp");
    expect(result).not.toContain("~");
  });

  it("leaves strings without templates unchanged", () => {
    expect(expandPaths("/absolute/path", paths)).toBe("/absolute/path");
  });

  it("handles unknown path key gracefully", () => {
    expect(expandPaths("{{paths.unknown}}", paths)).toBe("");
  });
});

describe("expandHome", () => {
  it("expands ~ prefix", () => {
    const result = expandHome("~/foo/bar");
    expect(result).toContain("/foo/bar");
    expect(result).not.toContain("~");
  });

  it("leaves absolute paths unchanged", () => {
    expect(expandHome("/absolute/path")).toBe("/absolute/path");
  });
});
