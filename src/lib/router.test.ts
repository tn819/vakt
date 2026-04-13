import { describe, it, expect } from "bun:test";
import {
  estimateTokens,
  detectCode,
  detectMath,
  extractToolCount,
  selectBackend,
  buildSignals,
} from "./router";
import type { ModelRouter } from "./schemas";

describe("estimateTokens", () => {
  it("estimates tokens from message array", () => {
    const messages = [{ role: "user", content: "Hello world" }];
    const tokens = estimateTokens(messages);
    expect(tokens).toBeGreaterThan(0);
  });

  it("returns 0 for empty array", () => {
    expect(estimateTokens([])).toBe(0);
  });

  it("scales with message length", () => {
    const shortMsg = [{ role: "user", content: "Hi" }];
    const longMsg = [{ role: "user", content: "A".repeat(1000) }];
    expect(estimateTokens(longMsg)).toBeGreaterThan(estimateTokens(shortMsg));
  });
});

describe("detectCode", () => {
  it("detects fenced code blocks", () => {
    const messages = [{ role: "user", content: "```js\nconst x = 1;\n```" }];
    expect(detectCode(messages)).toBe(true);
  });

  it("detects code keywords", () => {
    const messages = [{ role: "user", content: "function test() { return 1; }" }];
    expect(detectCode(messages)).toBe(true);
  });

  it("returns false for plain text", () => {
    const messages = [{ role: "user", content: "Hello, how are you?" }];
    expect(detectCode(messages)).toBe(false);
  });

  it("checks latest user message only", () => {
    const messages = [
      { role: "user", content: "```js\nconst x = 1;\n```" },
      { role: "assistant", content: "Here's the code" },
      { role: "user", content: "Thanks!" },
    ];
    expect(detectCode(messages)).toBe(false);
  });
});

describe("detectMath", () => {
  it("detects LaTeX expressions", () => {
    const messages = [{ role: "user", content: "$x^2 + y^2 = z^2$" }];
    expect(detectMath(messages)).toBe(true);
  });

  it("detects math operators", () => {
    const messages = [{ role: "user", content: "x^2 + y^2" }];
    expect(detectMath(messages)).toBe(true);
  });

  it("returns false for plain text", () => {
    const messages = [{ role: "user", content: "Hello world" }];
    expect(detectMath(messages)).toBe(false);
  });
});

describe("extractToolCount", () => {
  it("extracts tool count from request body", () => {
    const body = { tools: [{ name: "tool1" }, { name: "tool2" }] };
    expect(extractToolCount(body)).toBe(2);
  });

  it("returns 0 when no tools", () => {
    expect(extractToolCount({})).toBe(0);
  });

  it("returns 0 for null/undefined body", () => {
    expect(extractToolCount(null)).toBe(0);
    expect(extractToolCount(undefined)).toBe(0);
  });
});

describe("selectBackend", () => {
  const config: ModelRouter = {
    port: 4000,
    backends: {
      local: { url: "http://localhost:8000" },
      remote: { url: "https://api.example.com" },
    },
    rules: [
      { if: { promptTokens: { gt: 1000 } }, use: "remote" },
      { if: { toolCount: { gt: 5 } }, use: "remote" },
      { if: { hasCode: true }, use: ["remote", "local"] },
      { use: "local" },
    ],
  };

  it("returns null when config is undefined", () => {
    const result = selectBackend(undefined, {
      promptTokens: 100,
      toolCount: 0,
      hasCode: false,
      hasMath: false,
    });
    expect(result.backend).toBeNull();
  });

  it("matches token threshold rule", () => {
    const result = selectBackend(config, {
      promptTokens: 1500,
      toolCount: 0,
      hasCode: false,
      hasMath: false,
    });
    expect(result.backend).toBe("remote");
    expect(result.matchedRule).toBe(0);
  });

  it("does not match when token threshold not exceeded", () => {
    const result = selectBackend(config, {
      promptTokens: 500,
      toolCount: 0,
      hasCode: false,
      hasMath: false,
    });
    expect(result.backend).toBe("local");
    expect(result.matchedRule).toBe(3);
  });

  it("matches tool count rule", () => {
    const result = selectBackend(config, {
      promptTokens: 100,
      toolCount: 10,
      hasCode: false,
      hasMath: false,
    });
    expect(result.backend).toBe("remote");
    expect(result.matchedRule).toBe(1);
  });

  it("matches code detection rule", () => {
    const result = selectBackend(config, {
      promptTokens: 100,
      toolCount: 0,
      hasCode: true,
      hasMath: false,
    });
    expect(result.backend).toBe("remote");
    expect(result.matchedRule).toBe(2);
  });

  it("uses first backend in array", () => {
    const result = selectBackend(config, {
      promptTokens: 100,
      toolCount: 0,
      hasCode: true,
      hasMath: false,
    });
    expect(result.backend).toBe("remote");
  });

  it("falls through to catch-all rule", () => {
    const result = selectBackend(config, {
      promptTokens: 100,
      toolCount: 2,
      hasCode: false,
      hasMath: false,
    });
    expect(result.backend).toBe("local");
    expect(result.matchedRule).toBe(3);
  });

  it("returns null when no rules match and no catch-all", () => {
    const noCatchAllConfig: ModelRouter = {
      port: 4000,
      rules: [{ if: { promptTokens: { gt: 10000 } }, use: "remote" }],
    };
    const result = selectBackend(noCatchAllConfig, {
      promptTokens: 100,
      toolCount: 0,
      hasCode: false,
      hasMath: false,
    });
    expect(result.backend).toBeNull();
  });
});

describe("buildSignals", () => {
  it("builds signals from request body", () => {
    const body = {
      messages: [{ role: "user", content: "Hello" }],
      tools: [{}, {}, {}],
    };
    const signals = buildSignals(body);
    expect(signals.promptTokens).toBeGreaterThan(0);
    expect(signals.toolCount).toBe(3);
    expect(typeof signals.hasCode).toBe("boolean");
    expect(typeof signals.hasMath).toBe("boolean");
  });

  it("handles empty body", () => {
    const signals = buildSignals({});
    expect(signals.promptTokens).toBe(0);
    expect(signals.toolCount).toBe(0);
    expect(signals.hasCode).toBe(false);
    expect(signals.hasMath).toBe(false);
  });

  it("detects code in messages", () => {
    const body = {
      messages: [{ role: "user", content: "```js\nconst x = 1;\n```" }],
    };
    const signals = buildSignals(body);
    expect(signals.hasCode).toBe(true);
  });
});
