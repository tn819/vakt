import { describe, it, expect } from "bun:test";
import { ProcessManager } from "./process-manager";

describe("ProcessManager", () => {
  it("lists all configured servers as stopped initially", () => {
    const pm = new ProcessManager(
      { github: { command: "echo", args: ["ok"] } },
      {}
    );
    expect(pm.listStatuses()["github"]!.status).toBe("stopped");
  });

  it("starts a server and reports pid + running status", async () => {
    const pm = new ProcessManager({ test: { command: "sleep", args: ["30"] } }, {});
    await pm.start("test");
    const s = pm.listStatuses()["test"]!;
    expect(s.status).toBe("running");
    expect(s.pid).toBeGreaterThan(0);
    await pm.stop("test");
  });

  it("stop brings status back to stopped", async () => {
    const pm = new ProcessManager({ test: { command: "sleep", args: ["30"] } }, {});
    await pm.start("test");
    await pm.stop("test");
    expect(pm.listStatuses()["test"]!.status).toBe("stopped");
  });

  it("throws when starting an unknown server", async () => {
    const pm = new ProcessManager({}, {});
    expect(pm.start("nonexistent")).rejects.toThrow();
  });
});
