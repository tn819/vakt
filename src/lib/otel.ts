import { trace, SpanStatusCode, type Tracer } from "@opentelemetry/api";

let tracer: Tracer | null = null;
let sdkShutdown: (() => Promise<void>) | null = null;

/**
 * Call once at process start.
 * If endpoint is provided, OTel SDK is initialised and spans are exported.
 * If not, a no-op tracer is used (spans are created but discarded).
 */
export async function initOtel(endpoint?: string): Promise<void> {
  if (tracer) return;

  if (endpoint) {
    // Lazy-load the full SDK — only pay the cost when actually configured
    const { NodeSDK }           = await import("@opentelemetry/sdk-node");
    const { OTLPTraceExporter } = await import("@opentelemetry/exporter-otlp-grpc");

    const sdk = new NodeSDK({
      serviceName:   "vakt",
      traceExporter: new OTLPTraceExporter({ url: endpoint }) as any,
    });
    sdk.start();
    sdkShutdown = () => sdk.shutdown();
    process.on("exit", () => { void sdk.shutdown(); });
  }

  tracer = trace.getTracer("vakt");
}

export interface ToolCallSpanOpts {
  serverName:   string;
  toolName:     string;
  runtime:      string;
  policyResult: string;
  policyRule?:  string;
  provider:     string;
  sessionId:    string;
  startedAt:    number;
  endedAt:      number;
  ok:           boolean;
  errorCode?:   string;
}

/** Emit one span per tool call. No-op if initOtel has not been called. */
export function recordToolCallSpan(opts: ToolCallSpanOpts): void {
  if (!tracer) return;

  const span = tracer.startSpan("vakt.tool_call", {
    startTime: opts.startedAt,
    attributes: {
      "vakt.server":   opts.serverName,
      "vakt.tool":     opts.toolName,
      "vakt.runtime":  opts.runtime,
      "vakt.policy":   opts.policyResult,
      "vakt.session":  opts.sessionId,
      "vakt.provider": opts.provider,
      ...(opts.policyRule ? { "vakt.policy.rule": opts.policyRule } : {}),
    },
  });

  if (!opts.ok) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: opts.errorCode });
  }
  span.end(opts.endedAt);
}

export async function shutdownOtel(): Promise<void> {
  if (sdkShutdown) await sdkShutdown();
}
