import { describe, it, expect, beforeEach } from "bun:test";
import { mkdirSync } from "fs";
import { resolveSecretRefs, secretsSet, secretsGet, secretsDelete, secretsList, secretsHas, getBackend } from "../../src/lib/secrets";

// setup.ts sets AGENTS_SECRETS_BACKEND=env and AGENTS_DIR to a sandbox
const AGENTS = process.env["AGENTS_DIR"]!;

beforeEach(() => {
  mkdirSync(AGENTS, { recursive: true });
});

describe("env backend CRUD", () => {
  it("set then get returns the stored value", async () => {
    await secretsSet("CRUD_KEY", "myvalue");
    expect(await secretsGet("CRUD_KEY")).toBe("myvalue");
  });

  it("get returns null for unknown key", async () => {
    expect(await secretsGet("DEFINITELY_NOT_SET_XYZ")).toBeNull();
  });

  it("secretsHas returns true after set, false before", async () => {
    expect(await secretsHas("HAS_KEY_BEFORE")).toBe(false);
    await secretsSet("HAS_KEY_BEFORE", "val");
    expect(await secretsHas("HAS_KEY_BEFORE")).toBe(true);
  });

  it("delete removes a key", async () => {
    await secretsSet("DEL_KEY", "gone");
    await secretsDelete("DEL_KEY");
    expect(await secretsGet("DEL_KEY")).toBeNull();
  });

  it("delete is idempotent — no throw when key missing", async () => {
    await expect(secretsDelete("NEVER_SET_KEY_ABC")).resolves.toBeUndefined();
  });

  it("list returns stored keys", async () => {
    await secretsSet("LIST_A", "1");
    await secretsSet("LIST_B", "2");
    const keys = await secretsList();
    expect(keys).toContain("LIST_A");
    expect(keys).toContain("LIST_B");
  });

  it("overwrite updates the value", async () => {
    await secretsSet("OW_KEY", "first");
    await secretsSet("OW_KEY", "second");
    expect(await secretsGet("OW_KEY")).toBe("second");
  });

  it("stores values with special characters correctly", async () => {
    const special = "p@$$w0rd!#%^&*()=+[]{}|;':\",./<>?";
    await secretsSet("SPECIAL_KEY", special);
    expect(await secretsGet("SPECIAL_KEY")).toBe(special);
  });
});

describe("getBackend", () => {
  it("returns 'env' when AGENTS_SECRETS_BACKEND=env", () => {
    expect(getBackend()).toBe("env");
  });
});

describe("resolveSecretRefs — namespaced prefixes", () => {
  it("vault: ref is listed as missing when vault binary not present", async () => {
    process.env["AGENTS_RUN_TIMEOUT_MS"] = "500";
    const { missing } = await resolveSecretRefs("secret:vault:myapp/db/password");
    delete process.env["AGENTS_RUN_TIMEOUT_MS"];
    expect(missing).toContain("vault:myapp/db/password");
  });

  it("op: ref is listed as missing when op binary not present", async () => {
    const { missing } = await resolveSecretRefs("secret:op:myvault/login/password");
    expect(missing).toContain("op:myvault/login/password");
  });

  it("azure: ref is listed as missing when az binary not present", async () => {
    const { missing } = await resolveSecretRefs("secret:azure:my-vault/my-secret");
    expect(missing).toContain("azure:my-vault/my-secret");
  });

  it("op: ref with fewer than 3 path parts returns missing", async () => {
    const { missing } = await resolveSecretRefs("secret:op:vault/item");
    expect(missing).toContain("op:vault/item");
  });

  it("azure: ref with no slash returns missing", async () => {
    const { missing } = await resolveSecretRefs("secret:azure:novaultname");
    expect(missing).toContain("azure:novaultname");
  });
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
