import { describe, it, expect } from "bun:test";

describe("extractToolMentions", () => {
  it("extracts tool names from plan text", () => {
    const planText = `
Step 1: Read("file.txt")
Step 2: Edit("content")
Step 3: Bash("npm install")
`;
    const mentions = extractToolMentions(planText);

    expect(mentions.length).toBeGreaterThan(0);
    expect(mentions.some((m: { tool: string }) => m.tool === "Read")).toBe(true);
    expect(mentions.some((m: { tool: string }) => m.tool === "Edit")).toBe(true);
    expect(mentions.some((m: { tool: string }) => m.tool === "Bash")).toBe(true);
  });

  it("handles numbered steps without 'Step' prefix", () => {
    const planText = `
1. Read("file")
2. WebSearch("examples")
3. Write("result")
`;
    const mentions = extractToolMentions(planText);

    expect(mentions.length).toBeGreaterThan(0);
  });

  it("returns empty array for plan with no tools", () => {
    const planText = `
This is just a description
with no tool calls
`;
    const mentions = extractToolMentions(planText);

    expect(mentions.length).toBe(0);
  });

  it("handles tools with arguments", () => {
    const planText = `
Step 1: Read("file.txt")
Step 2: Bash("npm test")
`;
    const mentions = extractToolMentions(planText);

    expect(mentions.length).toBe(2);
    expect(mentions[0]?.args).toBeDefined();
    expect(mentions[1]?.args).toBeDefined();
  });

  it("is case insensitive for tool names", () => {
    const planText = `
step 1: read("file")
step 2: edit("content")
step 3: bash("command")
`;
    const mentions = extractToolMentions(planText);

    expect(mentions.length).toBeGreaterThan(0);
  });
});

describe("hasOutboundNetwork", () => {
  it("detects curl in args", () => {
    expect(hasOutboundNetwork("curl https://example.com")).toBe(true);
    expect(hasOutboundNetwork("CURL https://example.com")).toBe(true);
  });

  it("detects wget in args", () => {
    expect(hasOutboundNetwork("wget https://example.com")).toBe(true);
    expect(hasOutboundNetwork("WGET https://example.com")).toBe(true);
  });

  it("detects fetch in args", () => {
    expect(hasOutboundNetwork("fetch https://example.com")).toBe(true);
    expect(hasOutboundNetwork("FETCH https://example.com")).toBe(true);
  });

  it("returns false for local commands", () => {
    expect(hasOutboundNetwork("npm install")).toBe(false);
    expect(hasOutboundNetwork("node script.js")).toBe(false);
    expect(hasOutboundNetwork("echo hello")).toBe(false);
  });

  it("returns false for empty args", () => {
    expect(hasOutboundNetwork("")).toBe(false);
    expect(hasOutboundNetwork(undefined)).toBe(false);
  });
});

describe("formatViolations", () => {
  it("formats error violations", () => {
    const violations = [
      {
        step: 1,
        tool: "WebSearch",
        rule: "policy",
        severity: "error" as const,
        suggestion: "Use allowed alternative",
      },
    ];

    const output = formatViolations(violations);
    expect(output).toContain("Step 1");
    expect(output).toContain("WebSearch");
    expect(output).toContain("denied");
    expect(output).toContain("Use allowed alternative");
  });

  it("formats warning violations", () => {
    const violations = [
      {
        step: 2,
        tool: "Bash",
        rule: "outbound-network",
        severity: "warning" as const,
        suggestion: "Use WebFetch instead",
      },
    ];

    const output = formatViolations(violations);
    expect(output).toContain("Step 2");
    expect(output).toContain("Bash");
    expect(output).toContain("warning");
    expect(output).toContain("Use WebFetch instead");
  });

  it("formats multiple violations", () => {
    const violations = [
      {
        step: 1,
        tool: "WebSearch",
        rule: "policy",
        severity: "error" as const,
      },
      {
        step: 3,
        tool: "Bash",
        rule: "outbound-network",
        severity: "warning" as const,
      },
    ];

    const output = formatViolations(violations);
    expect(output).toContain("Step 1");
    expect(output).toContain("Step 3");
  });
});

function extractToolMentions(planText: string): Array<{ step: number; tool: string; args?: string }> {
  const KNOWN_TOOLS = [
    "Read", "Edit", "Write", "Bash", "WebSearch", "WebFetch",
    "Grep", "GrepSearch", "Glob", "List", "Delete", "Apply"
  ];

  const mentions: Array<{ step: number; tool: string; args?: string }> = [];
  const lines = planText.split("\n");

  let stepNum = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const stepMatch = /^(?:Step\s+)?(\d+)[:.)\s]/i.exec(line);
    if (stepMatch) {
      stepNum = Number.parseInt(stepMatch[1] ?? "0", 10);
    }

    for (const tool of KNOWN_TOOLS) {
      const regex = new RegExp(`\\b${tool}\\s*\\(`, "i");
      if (regex.test(line)) {
        const argsMatch = /\(([^)]*)\)/.exec(line);
        mentions.push({
          step: stepNum || i + 1,
          tool: tool,
          args: argsMatch?.[1],
        });
      }
    }
  }

  return mentions;
}

function hasOutboundNetwork(args: string | undefined): boolean {
  if (!args) return false;
  const OUTBOUND_NETWORK_PATTERNS = [
    /curl\s+/i,
    /wget\s+/i,
    /fetch\s+/i,
  ];
  return OUTBOUND_NETWORK_PATTERNS.some((p) => p.test(args));
}

function formatViolations(violations: Array<{
  step: number;
  tool: string;
  rule: string;
  severity: "error" | "warning";
  suggestion?: string;
}>): string {
  const red = (s: string) => s;
  const yellow = (s: string) => s;

  return violations.map((v) => {
    const icon = v.severity === "error" ? red("✗") : yellow("⚠");
    const lines = [
      `Step ${v.step}: ${v.tool}`,
      `  ${icon}  ${v.tool} — ${v.severity === "error" ? "denied" : "warning"} by ${v.rule}`,
    ];
    if (v.suggestion) {
      lines.push(`     Suggestion: ${v.suggestion}`);
    }
    return lines.join("\n");
  }).join("\n\n");
}
