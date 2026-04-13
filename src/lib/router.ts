import type { ModelRouter } from "./schemas";

export interface RoutingSignals {
  promptTokens: number;
  toolCount: number;
  hasCode: boolean;
  hasMath: boolean;
}

export interface RoutingResult {
  backend: string | null;
  signals: RoutingSignals;
  matchedRule?: number;
}

export function estimateTokens(messages: unknown[]): number {
  if (messages.length === 0) return 0;
  return Math.ceil(JSON.stringify(messages).length / 4);
}

export function detectCode(messages: Array<{ role: string; content: string }>): boolean {
  const latestUser = [...messages].reverse().find(m => m.role === "user");
  if (!latestUser?.content) return false;
  
  const content = latestUser.content;
  if (/```[a-zA-Z]*\n/.test(content)) return true;
  
  const codeKeywords = /\b(function|class|const|let|var|if|for|while|return|import|export|def|class)\b/;
  if (codeKeywords.test(content)) return true;
  
  return false;
}

export function detectMath(messages: Array<{ role: string; content: string }>): boolean {
  const latestUser = [...messages].reverse().find(m => m.role === "user");
  if (!latestUser?.content) return false;
  
  const content = latestUser.content;
  if (/\$[^$]+\$/.test(content)) return true;
  if (/[\^\∫\∑\∏\√\∂]/.test(content)) return true;
  
  return false;
}

export function extractToolCount(body: unknown): number {
  if (typeof body !== "object" || body === null) return 0;
  const tools = (body as Record<string, unknown>).tools;
  if (Array.isArray(tools)) return tools.length;
  return 0;
}

interface RoutingRule {
  if?: {
    promptTokens?: { gt?: number };
    toolCount?: { gt?: number };
    hasCode?: boolean;
    hasMath?: boolean;
  };
  use: string | string[];
}

function getFirstBackend(use: string | string[]): string | null {
  const backends = Array.isArray(use) ? use : [use];
  return backends[0] ?? null;
}

function checkRuleCondition(
  rule: RoutingRule,
  signals: RoutingSignals
): boolean {
  if (!rule.if) return true;
  
  if (rule.if.promptTokens?.gt !== undefined) {
    if (signals.promptTokens <= rule.if.promptTokens.gt) {
      return false;
    }
  }
  
  if (rule.if.toolCount?.gt !== undefined) {
    if (signals.toolCount <= rule.if.toolCount.gt) {
      return false;
    }
  }
  
  if (rule.if.hasCode !== undefined && signals.hasCode !== rule.if.hasCode) {
    return false;
  }
  
  if (rule.if.hasMath !== undefined && signals.hasMath !== rule.if.hasMath) {
    return false;
  }
  
  return true;
}

export function selectBackend(
  config: ModelRouter | undefined,
  signals: RoutingSignals
): RoutingResult {
  if (!config) {
    return { backend: null, signals };
  }
  
  const rules = config.rules ?? [];
  
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule) continue;
    
    if (checkRuleCondition(rule, signals)) {
      return {
        backend: getFirstBackend(rule.use),
        signals,
        matchedRule: i,
      };
    }
  }
  
  return {
    backend: null,
    signals,
  };
}

export function buildSignals(body: unknown): RoutingSignals {
  const messages = extractMessages(body);
  const toolCount = extractToolCount(body);
  
  return {
    promptTokens: estimateTokens(messages),
    toolCount,
    hasCode: detectCode(messages),
    hasMath: detectMath(messages),
  };
}

function extractMessages(body: unknown): Array<{ role: string; content: string }> {
  if (typeof body !== "object" || body === null) return [];
  const messages = (body as Record<string, unknown>).messages;
  if (Array.isArray(messages)) {
    return messages.filter((m): m is { role: string; content: string } => 
      typeof m === "object" && 
      m !== null &&
      "role" in m && 
      "content" in m &&
      typeof (m as Record<string, unknown>).role === "string" &&
      typeof (m as Record<string, unknown>).content === "string"
    );
  }
  return [];
}
