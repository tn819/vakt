import { describe, it, expect } from "bun:test";
import { recordToolCallSpan, shutdownOtel, initOtel } from "../../src/lib/otel";

const BASE_OPTS = {
  serverName: "github", toolName: "list_repos", runtime: "local",
  policyResult: "allow", provider: "cursor", sessionId: "s-otel",
  startedAt: Date.now() - 5, endedAt: Date.now(), ok: true,
};

describe("recordToolCallSpan", () => {
  it("is a no-op before initOtel is called (no tracer)", () => {
    expect(() => recordToolCallSpan(BASE_OPTS)).not.toThrow();
  });

  it("does not throw for a deny result without errorCode", () => {
    expect(() => recordToolCallSpan({ ...BASE_OPTS, ok: false, policyResult: "deny" })).not.toThrow();
  });

  it("does not throw with optional policyRule set", () => {
    expect(() => recordToolCallSpan({ ...BASE_OPTS, policyRule: "deny-list" })).not.toThrow();
  });

  it("does not throw after initOtel called without endpoint", async () => {
    await initOtel(undefined);
    expect(() => recordToolCallSpan(BASE_OPTS)).not.toThrow();
  });
});

describe("shutdownOtel", () => {
  it("resolves without error when no SDK was initialised", async () => {
    await expect(shutdownOtel()).resolves.toBeUndefined();
  });
});
