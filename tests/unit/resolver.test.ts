import { describe, it, expect, beforeEach } from "bun:test";
import { mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { resolveServer, writeJsonConfig } from "../../src/lib/resolver";
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
