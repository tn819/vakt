import { describe, it, expect, beforeEach } from "bun:test";
import { join } from "path";
import { rmSync } from "fs";
import { AuditStore } from "./audit";

const DB = join(process.env["AGENTS_DIR"]!, "audit.db");

describe("AuditStore", () => {
  let store: AuditStore;

  beforeEach(() => {
    try { rmSync(DB); } catch { /* ok if not exists */ }
    store = new AuditStore(DB);
    store.init();
  });

  it("records and retrieves a tool call", () => {
    const now = Date.now();
    store.recordToolCall({
      sessionId: "s1", serverName: "github", toolName: "list_repos",
      runtime: "local", provider: "cursor", policyResult: "allow",
      startedAt: now, endedAt: now + 80, responseOk: true,
    });
    const rows = store.query({ serverName: "github", limit: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tool_name).toBe("list_repos");
    expect(rows[0]!.duration_ms).toBeGreaterThanOrEqual(80);
  });

  it("records a sync event", () => {
    store.recordSync({ providers: ["cursor", "gemini"], servers: ["github"], dryRun: false });
    const syncs = store.recentSyncs(5);
    expect(syncs).toHaveLength(1);
    expect(JSON.parse(syncs[0]!.providers as string)).toContain("cursor");
  });

  it("filters tool calls by time window", () => {
    const old = Date.now() - 10_000;
    store.recordToolCall({
      sessionId: "s2", serverName: "github", toolName: "old_call",
      runtime: "local", provider: "cursor", policyResult: "allow",
      startedAt: old, endedAt: old + 50, responseOk: true,
    });
    const recent = store.query({ since: Date.now() - 1000 });
    expect(recent).toHaveLength(0);
  });

  it("filters by server name", () => {
    const now = Date.now();
    store.recordToolCall({
      sessionId: "s3", serverName: "filesystem", toolName: "read_file",
      runtime: "local", provider: "gemini", policyResult: "allow",
      startedAt: now, endedAt: now + 10, responseOk: true,
    });
    expect(store.query({ serverName: "github" })).toHaveLength(0);
    expect(store.query({ serverName: "filesystem" })).toHaveLength(1);
  });
});
