import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createProxy } from "../../src/daemon/proxy";
import { AuditStore } from "../../src/lib/audit";

const DB = join(tmpdir(), `proxy-test-${process.pid}.db`);
let savedAgentsDir: string | undefined;

function makeStore(): AuditStore {
  const s = new AuditStore(DB);
  s.init();
  return s;
}

beforeEach(() => {
  savedAgentsDir = process.env["AGENTS_DIR"];
  try { rmSync(DB); } catch { /* ok */ }
});

afterEach(() => {
  if (savedAgentsDir === undefined) delete process.env["AGENTS_DIR"];
  else process.env["AGENTS_DIR"] = savedAgentsDir;
  try { rmSync(DB); } catch { /* ok */ }
});

const ALLOW_POLICY = {
  version: "1" as const,
  default: "allow" as const,
  registryPolicy: "allow-unverified" as const,
  servers: {},
};

const DENY_POLICY = {
  version: "1" as const,
  default: "deny" as const,
  registryPolicy: "allow-unverified" as const,
  servers: { github: { tools: { deny: ["delete_repo"] } } },
};

function toolCallFrame(id: number, toolName: string): Buffer {
  return Buffer.from(
    JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: toolName } }) + "\n"
  );
}

function nonToolFrame(): Buffer {
  return Buffer.from(
    JSON.stringify({ jsonrpc: "2.0", id: 99, method: "tools/list", params: {} }) + "\n"
  );
}

describe("createProxy", () => {
  it("forwards all frames when policy is null", () => {
    const store = makeStore();
    const proxy = createProxy({ serverName: "github", policy: null, store });
    const data = toolCallFrame(1, "delete_repo");
    const { forward, denied } = proxy.interceptRequest(data);
    expect(denied).toHaveLength(0);
    expect(forward.toString()).toContain("delete_repo");
  });

  it("forwards allowed tool calls", () => {
    const store = makeStore();
    const proxy = createProxy({ serverName: "github", policy: ALLOW_POLICY, store });
    const data = toolCallFrame(1, "list_repos");
    const { forward, denied } = proxy.interceptRequest(data);
    expect(denied).toHaveLength(0);
    expect(forward.toString()).toContain("list_repos");
  });

  it("denies tool calls blocked by policy", () => {
    const store = makeStore();
    const proxy = createProxy({ serverName: "github", policy: DENY_POLICY, store });
    const data = toolCallFrame(2, "delete_repo");
    const { forward, denied } = proxy.interceptRequest(data);
    expect(denied).toHaveLength(1);
    expect(denied[0]).toContain("denied by policy");
    expect(denied[0]).toContain("delete_repo");
    expect(forward.length).toBe(0);
  });

  it("records denied call in audit store", () => {
    const store = makeStore();
    const proxy = createProxy({ serverName: "github", policy: DENY_POLICY, store, sessionId: "s1" });
    proxy.interceptRequest(toolCallFrame(3, "delete_repo"));
    const rows = store.query({ serverName: "github", limit: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tool_name).toBe("delete_repo");
    expect(rows[0]!.policy_result).toBe("deny");
  });

  it("passes non-tools/call frames through unchanged", () => {
    const store = makeStore();
    const proxy = createProxy({ serverName: "github", policy: DENY_POLICY, store });
    const data = nonToolFrame();
    const { forward, denied } = proxy.interceptRequest(data);
    expect(denied).toHaveLength(0);
    expect(forward.toString()).toContain("tools/list");
  });

  it("recordAllowed writes to audit store", () => {
    const store = makeStore();
    const proxy = createProxy({ serverName: "fs", policy: ALLOW_POLICY, store, sessionId: "s2" });
    proxy.recordAllowed("read_file", Date.now() - 10);
    const rows = store.query({ serverName: "fs", limit: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tool_name).toBe("read_file");
    expect(rows[0]!.policy_result).toBe("allow");
  });
});
