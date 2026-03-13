import { randomUUID } from "node:crypto";
import { PolicyEngine } from "../lib/policy";
import { AuditStore } from "../lib/audit";
import { recordToolCallSpan } from "../lib/otel";
import type { Policy } from "../lib/schemas";

interface JsonRpcFrame { jsonrpc: "2.0"; id?: unknown; method?: string; params?: Record<string, unknown>; }

function denyFrame(id: unknown, toolName: string): string {
  return JSON.stringify({
    jsonrpc: "2.0", id,
    error: { code: -32603, message: `vakt: tool '${toolName}' denied by policy` },
  }) + "\n";
}

function parseFrames(data: Buffer | Uint8Array): JsonRpcFrame[] {
  return Buffer.from(data).toString("utf-8")
    .split("\n")
    .filter(l => l.trim())
    // MCP uses newline-delimited JSON-RPC 2.0 over stdio; malformed lines are silently dropped
    // per spec: https://spec.modelcontextprotocol.io/specification/basic/transports/#stdio
    .flatMap(l => { try { return [JSON.parse(l) as JsonRpcFrame]; } catch { return []; } }); // NOSONAR
}

export interface ProxyOptions {
  serverName: string;
  policy:     Policy | null;
  store:      AuditStore;
  sessionId?: string;
  provider?:  string;
}

export function createProxy(opts: ProxyOptions) {
  const engine    = opts.policy ? new PolicyEngine(opts.policy) : null;
  const sessionId = opts.sessionId ?? randomUUID();
  const pending   = new Map<unknown, { toolName: string; startedAt: number }>();

  /** Intercepts stdin data heading to the MCP server. Returns forwarded bytes and denied responses. */
  function interceptRequest(data: Buffer | Uint8Array): { forward: Buffer; denied: string[] } {
    if (!engine) return { forward: Buffer.from(data), denied: [] };

    const frames = parseFrames(data);
    const forward: string[] = [];
    const denied:  string[] = [];

    for (const frame of frames) {
      const raw = JSON.stringify(frame) + "\n";
      if (frame.method === "tools/call") {
        const toolName  = (frame.params?.["name"] ?? "") as string;
        const startedAt = Date.now();
        const result    = engine.checkTool(opts.serverName, toolName);

        if (result === "deny") {
          denied.push(denyFrame(frame.id, toolName));
          const endedAt = Date.now();
          opts.store.recordToolCall({
            sessionId, serverName: opts.serverName, toolName, runtime: "local",
            provider: opts.provider ?? "unknown", policyResult: "deny",
            startedAt, endedAt, responseOk: false,
          });
          recordToolCallSpan({
            serverName: opts.serverName, toolName, runtime: "local",
            policyResult: "deny", provider: opts.provider ?? "unknown",
            sessionId, startedAt, endedAt, ok: false,
          });
        } else {
          forward.push(raw);
          if (frame.id !== undefined && frame.id !== null) {
            pending.set(frame.id, { toolName, startedAt });
          }
        }
      } else {
        forward.push(raw);
      }
    }

    return {
      forward: Buffer.from(forward.join("")),
      denied,
    };
  }

  /** Intercepts stdout data from the MCP server. Records allowed calls and passes bytes through. */
  function interceptResponse(data: Buffer | Uint8Array): Buffer {
    const frames = parseFrames(data);
    for (const frame of frames) {
      if (frame.id !== undefined && frame.id !== null && pending.has(frame.id)) {
        const { toolName, startedAt } = pending.get(frame.id)!;
        pending.delete(frame.id);
        recordAllowed(toolName, startedAt);
      }
    }
    return Buffer.from(data);
  }

  /** Call after receiving a successful tool response to record in audit. */
  function recordAllowed(toolName: string, startedAt: number): void {
    const endedAt = Date.now();
    opts.store.recordToolCall({
      sessionId, serverName: opts.serverName, toolName, runtime: "local",
      provider: opts.provider ?? "unknown", policyResult: "allow",
      startedAt, endedAt, responseOk: true,
    });
    recordToolCallSpan({
      serverName: opts.serverName, toolName, runtime: "local",
      policyResult: "allow", provider: opts.provider ?? "unknown",
      sessionId, startedAt, endedAt, ok: true,
    });
  }

  return { interceptRequest, interceptResponse, recordAllowed };
}
