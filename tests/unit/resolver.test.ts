import { describe, it, expect, beforeEach } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { resolveServer, writeJsonConfig, writeTomlConfig, toTomlArrayOfTables } from "../../src/lib/resolver";
import { secretsSet } from "../../src/lib/secrets";

// setup.ts sets AGENTS_SECRETS_BACKEND=env and AGENTS_DIR to a sandbox
const AGENTS = process.env["AGENTS_DIR"]!;

beforeEach(() => {
  mkdirSync(AGENTS, { recursive: true });
});

describe("resolveServer — missing secrets", () => {
  it("preserves raw secret ref in env when secret is not set", async () => {
    const { server: resolved, missing } = await resolveServer(
      "test",
      { command: "npx", args: ["-y", "some-server"], env: { TOKEN: "secret:MISSING_TOKEN_XYZ" } },
      {},
    );
    expect((resolved as any).env["TOKEN"]).toBe("secret:MISSING_TOKEN_XYZ");
    expect(missing).toContain("MISSING_TOKEN_XYZ");
  });

  it("does not write empty string for a missing secret", async () => {
    const { server: resolved } = await resolveServer(
      "test",
      { command: "npx", env: { KEY: "secret:ALSO_MISSING_XYZ" } },
      {},
    );
    expect((resolved as any).env["KEY"]).not.toBe("");
  });

  it("resolves env value when secret exists", async () => {
    await secretsSet("RESOLVER_TEST_TOKEN", "real-value");
    const { server: resolved, missing } = await resolveServer(
      "test",
      { command: "npx", env: { TOKEN: "secret:RESOLVER_TEST_TOKEN" } },
      {},
    );
    expect((resolved as any).env["TOKEN"]).toBe("real-value");
    expect(missing).toHaveLength(0);
  });

  it("handles multiple env vars — resolves present, preserves ref for missing", async () => {
    await secretsSet("RESOLVER_PRESENT_KEY", "present-value");
    const { server: resolved, missing } = await resolveServer(
      "test",
      {
        command: "npx",
        env: {
          PRESENT: "secret:RESOLVER_PRESENT_KEY",
          ABSENT: "secret:RESOLVER_ABSENT_KEY",
        },
      },
      {},
    );
    expect((resolved as any).env["PRESENT"]).toBe("present-value");
    expect((resolved as any).env["ABSENT"]).toBe("secret:RESOLVER_ABSENT_KEY");
    expect(missing).toContain("RESOLVER_ABSENT_KEY");
    expect(missing).not.toContain("RESOLVER_PRESENT_KEY");
  });
});

describe("writeJsonConfig — output format", () => {
  it("writes JSON with a trailing newline", async () => {
    const filePath = join(AGENTS, "test-output.json");
    await writeJsonConfig(filePath, "mcpServers", { foo: { command: "bar" } }, false);
    const content = readFileSync(filePath, "utf-8");
    expect(content.endsWith("\n")).toBe(true);
  });

  it("merges into existing file without clobbering other keys", async () => {
    const filePath = join(AGENTS, "test-merge.json");
    await writeJsonConfig(filePath, "mcpServers", { first: { command: "a" } }, false);
    // Now write a second key — first key must survive
    const existing = JSON.parse(readFileSync(filePath, "utf-8"));
    existing["otherKey"] = { some: "data" };
    await Bun.write(filePath, JSON.stringify(existing, null, 2));
    await writeJsonConfig(filePath, "mcpServers", { second: { command: "b" } }, false);
    const result = JSON.parse(readFileSync(filePath, "utf-8"));
    expect(result["otherKey"]).toEqual({ some: "data" });
    expect(result["mcpServers"]["second"]).toBeDefined();
  });

  it("dry-run does not write the file", async () => {
    const filePath = join(AGENTS, "should-not-exist.json");
    await writeJsonConfig(filePath, "mcpServers", { foo: { command: "bar" } }, true);
    expect(() => readFileSync(filePath)).toThrow();
  });
});

describe("toTomlArrayOfTables", () => {
  it("emits [[key]] header for each server", () => {
    const result = toTomlArrayOfTables("mcp_servers", {
      github: { transport: "stdio", command: "npx" },
    });
    expect(result).toContain("[[mcp_servers]]");
    expect(result).toContain('name = "github"');
    expect(result).toContain('transport = "stdio"');
    expect(result).toContain('command = "npx"');
  });

  it("emits one block per server separated by a blank line", () => {
    const result = toTomlArrayOfTables("mcp_servers", {
      a: { command: "cmd-a" },
      b: { command: "cmd-b" },
    });
    const blocks = result.split("[[mcp_servers]]").filter(Boolean);
    expect(blocks).toHaveLength(2);
    expect(result).toContain('name = "a"');
    expect(result).toContain('name = "b"');
  });

  it("serialises array args as inline JSON", () => {
    const result = toTomlArrayOfTables("mcp_servers", {
      s: { args: ["-y", "pkg"] },
    });
    expect(result).toContain('args = ["-y","pkg"]');
  });
});

describe("writeTomlConfig — array format", () => {
  it("writes array-of-tables format for vibe-style providers", async () => {
    const filePath = join(AGENTS, "vibe-config.toml");
    await writeTomlConfig(
      filePath,
      "mcp_servers",
      { github: { transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] } },
      "array",
      false,
    );
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("[[mcp_servers]]");
    expect(content).toContain('name = "github"');
    expect(content).toContain('transport = "stdio"');
  });

  it("preserves non-server keys when writing array format", async () => {
    const filePath = join(AGENTS, "vibe-existing.toml");
    writeFileSync(filePath, 'model = "mistral-large"\n');
    await writeTomlConfig(
      filePath,
      "mcp_servers",
      { s: { transport: "stdio", command: "npx" } },
      "array",
      false,
    );
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('model = "mistral-large"');
    expect(content).toContain("[[mcp_servers]]");
  });

  it("dry-run does not write the file", async () => {
    const filePath = join(AGENTS, "vibe-dryrun.toml");
    await writeTomlConfig(filePath, "mcp_servers", { s: { command: "npx" } }, "array", true);
    expect(existsSync(filePath)).toBe(false);
  });

  it("falls back to record format when serversFormat is record", async () => {
    const filePath = join(AGENTS, "codex-style.toml");
    await writeTomlConfig(
      filePath,
      "mcp_servers",
      { myserver: { command: "npx" } },
      "record",
      false,
    );
    const content = readFileSync(filePath, "utf-8");
    // Record format uses [mcp_servers] section, not [[mcp_servers]]
    expect(content).not.toContain("[[mcp_servers]]");
  });
});
