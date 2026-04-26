import type { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { AGENTS_DIR } from "../lib/config";
import { loadMergedPolicy, PolicyEngine } from "../lib/policy";
import { KNOWN_TOOLS } from "../lib/schemas";

const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

interface ToolMention {
  step: number;
  tool: string;
  args?: string;
}

interface Violation {
  step: number;
  tool: string;
  rule: string;
  suggestion?: string;
  severity: "error" | "warning";
}

const TOOL_PATTERNS = KNOWN_TOOLS.map(t => ({
  name: t,
  regex: new RegExp(`\\b${t}\\s*\\(`, "i"),
}));

const OUTBOUND_NETWORK_PATTERNS = [
  /curl\s+/i,
  /wget\s+/i,
  /fetch\s+/i,
];

function extractToolMentions(planText: string): ToolMention[] {
  const mentions: ToolMention[] = [];
  const lines = planText.split("\n");
  
  let stepNum = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (typeof line !== "string") continue;
    
    const stepMatch = /^(?:Step\s+)?(\d+)[:.)\s]/i.exec(line);
    if (stepMatch) {
      stepNum = Number.parseInt(stepMatch[1] ?? "0", 10);
    }

    for (const { name, regex } of TOOL_PATTERNS) {
      if (regex.test(line)) {
        const argsMatch = /\(([^)]*)\)/.exec(line);
        mentions.push({
          step: stepNum || i + 1,
          tool: name,
          args: argsMatch?.[1],
        });
      }
    }
  }
  
  return mentions;
}

function hasOutboundNetwork(args: string | undefined): boolean {
  if (!args) return false;
  return OUTBOUND_NETWORK_PATTERNS.some(p => p.test(args));
}

function validatePlan(
  mentions: ToolMention[],
  engine: PolicyEngine | null,
  serverName: string,
): Violation[] {
  const violations: Violation[] = [];
  
  for (const mention of mentions) {
    if (!engine) {
      if (mention.tool === "Bash" && mention.args && hasOutboundNetwork(mention.args)) {
        violations.push({
          step: mention.step,
          tool: mention.tool,
          rule: "outbound-network",
          suggestion: "Outbound HTTP in Bash is unaudited — use WebFetch or WebSearch instead",
          severity: "warning",
        });
      }
      continue;
    }
    
    const result = engine.checkTool(serverName, mention.tool);
    
    if (result.result === "deny") {
      violations.push({
        step: mention.step,
        tool: mention.tool,
        rule: "policy",
        suggestion: "Tool is denied by policy — use an allowed alternative",
        severity: "error",
      });
    }
    
    if (mention.tool === "Bash" && mention.args && hasOutboundNetwork(mention.args)) {
      violations.push({
        step: mention.step,
        tool: mention.tool,
        rule: "outbound-network",
        suggestion: "Outbound HTTP in Bash is unaudited — use WebFetch or WebSearch instead",
        severity: "warning",
      });
    }
  }
  
  return violations;
}

function formatViolations(violations: Violation[]): string {
  return violations.map(v => {
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

export function registerPlanValidate(program: Command): void {
  program
    .command("plan-validate")
    .description("Validate tool mentions in a plan file against policy")
    .argument("[file]", "Plan file to validate (defaults to stdin)")
    .option("--server <name>", "Server name for policy context", "default")
    .option("--ci", "Exit with non-zero code on violations")
    .option("--dry-run", "Show plan and violations without prompting")
    .action(async (file: string | undefined, opts: { server?: string; ci?: boolean; dryRun?: boolean }) => {
      if (!existsSync(AGENTS_DIR)) {
        console.error("Run 'vakt init' first");
        process.exit(1);
      }
      
      const planText = file
        ? readFileSync(file, "utf-8")
        : await readStdin();
      
      if (!planText.trim()) {
        console.error("No plan content provided");
        process.exit(1);
      }
      
      console.log(dim("Analyzing plan for policy violations...\n"));
      
      const mentions = extractToolMentions(planText);
      
      if (mentions.length === 0) {
        console.log(dim("No tool mentions found in plan."));
        process.exit(0);
      }
      
      console.log(dim(`Found ${mentions.length} tool mention(s):`));
      mentions.forEach(m => console.log(dim(`  Step ${m.step}: ${m.tool}`)));
      console.log();
      
      const policy = loadMergedPolicy(AGENTS_DIR);
      const engine = policy ? new PolicyEngine(policy) : null;
      
      const violations = validatePlan(mentions, engine, opts.server || "default");
      
      const errors = violations.filter(v => v.severity === "error");
      const warnings = violations.filter(v => v.severity === "warning");
      
      if (violations.length === 0) {
        console.log(green("✓ No policy violations found"));
        process.exit(0);
      }
      
      console.log(formatViolations(violations));
      console.log();
      
      const summary: string[] = [];
      if (errors.length > 0) summary.push(red(`${errors.length} error(s)`));
      if (warnings.length > 0) summary.push(yellow(`${warnings.length} warning(s)`));
      console.log(`Validation: ${summary.join(", ")}`);
      
      if (opts.ci && errors.length > 0) {
        process.exit(1);
      }
    });
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", chunk => data += chunk);
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}
