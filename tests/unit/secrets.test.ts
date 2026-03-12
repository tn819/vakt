import { describe, it, expect, beforeEach } from "bun:test";
import { mkdirSync } from "fs";
import { resolveSecretRefs, secretsSet } from "../../src/lib/secrets";

// setup.ts sets AGENTS_SECRETS_BACKEND=env and AGENTS_DIR to a sandbox
const AGENTS = process.env["AGENTS_DIR"]!;

beforeEach(() => {
  mkdirSync(AGENTS, { recursive: true });
});

describe("resolveSecretRefs", () => {
  it("passes through a plain string unchanged", async () => {
    const { resolved, missing } = await resolveSecretRefs("plain-value");
    expect(resolved).toBe("plain-value");
    expect(missing).toHaveLength(0);
  });

  it("resolves secret: prefix from env backend", async () => {
    await secretsSet("VAKT_UNIT_TEST_KEY", "resolved-value");
    const { resolved, missing } = await resolveSecretRefs("secret:VAKT_UNIT_TEST_KEY");
    expect(resolved).toBe("resolved-value");
    expect(missing).toHaveLength(0);
  });

  it("adds key to missing when secret is not set", async () => {
    const { resolved, missing } = await resolveSecretRefs("secret:NONEXISTENT_XYZ_KEY");
    expect(missing).toContain("NONEXISTENT_XYZ_KEY");
    // unresolved ref stays in the string (graceful degradation, no throw)
    expect(resolved).toContain("secret:NONEXISTENT_XYZ_KEY");
  });

  it("resolves multiple refs in one string", async () => {
    await secretsSet("KEY_A", "alpha");
    await secretsSet("KEY_B", "beta");
    const { resolved, missing } = await resolveSecretRefs("Bearer secret:KEY_A:secret:KEY_B");
    expect(resolved).toBe("Bearer alpha:beta");
    expect(missing).toHaveLength(0);
  });
});
