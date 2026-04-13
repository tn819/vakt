import type { Command } from "commander";
import { loadAgentConfig } from "../lib/config";
import { buildSignals, selectBackend } from "../lib/router";
import { AuditStore } from "../lib/audit";
import { resolveSecretRefs } from "../lib/secrets";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const ok = (s: string) => console.log(`  ${green("✓")}  ${s}`);
const info = (s: string) => console.log(`  ${cyan("→")}  ${s}`);

export function registerRoute(program: Command): void {
  program
    .command("route")
    .description("Start OpenAI-compatible model router proxy")
    .option("--port <number>", "Proxy port (default: 4000 or config)")
    .option("--test", "Test routing logic without starting server")
    .option("--tokens <number>", "Test: simulate prompt token count")
    .option("--tools <number>", "Test: simulate tool count")
    .option("--has-code", "Test: simulate code detection")
    .option("--has-math", "Test: simulate math detection")
    .action(async (opts) => {
      const config = loadAgentConfig();
      const routerConfig = config.modelRouter;
      
      if (opts.test) {
        await testRouting(config, opts);
        return;
      }
      
      if (!routerConfig) {
        console.error("Model router not configured. Add modelRouter to ~/.agents/config.json");
        process.exit(1);
      }
      
      const port = opts.port ? Number.parseInt(opts.port, 10) : routerConfig.port;
      const backends = routerConfig.backends ?? {};
      
      console.log(bold("Starting vakt model router..."));
      info(`Port: ${port}`);
      info(`Backends: ${Object.keys(backends).join(", ") || "none configured"}`);
      info(`Rules: ${routerConfig.rules?.length || 0} configured`);
      
      const audit = new AuditStore();

      Bun.serve({
        port,
        async fetch(request) {
          const url = new URL(request.url);
          
          if (url.pathname !== "/v1/chat/completions") {
            return new Response(JSON.stringify({ error: "Not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }
          
          if (request.method !== "POST") {
            return new Response(JSON.stringify({ error: "Method not allowed" }), {
              status: 405,
              headers: { "Content-Type": "application/json" },
            });
          }
          
          const startTime = Date.now();
          let body: unknown;
          
          try {
            body = await request.json();
          } catch {
            return new Response(JSON.stringify({ error: "Invalid JSON" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }
          
          const signals = buildSignals(body);
          const result = selectBackend(routerConfig, signals);
          
          if (!result.backend) {
            return new Response(
              JSON.stringify({ error: "No matching backend for request" }),
              { status: 503, headers: { "Content-Type": "application/json" } }
            );
          }
          
          const backend = backends[result.backend];
          if (!backend) {
            return new Response(
              JSON.stringify({ error: `Backend '${result.backend}' not configured` }),
              { status: 503, headers: { "Content-Type": "application/json" } }
            );
          }
          
          const latencyMs = Date.now() - startTime;
          
          audit.recordRouting({
            backend: result.backend,
            promptTokens: signals.promptTokens,
            toolCount: signals.toolCount,
            hasCode: signals.hasCode,
            hasMath: signals.hasMath,
            matchedRule: result.matchedRule,
            latencyMs,
          });
          
          let apiKey: string | undefined;
          if (backend.apiKey) {
            const { resolved } = await resolveSecretRefs(backend.apiKey);
            apiKey = resolved;
          }
          
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (apiKey) {
            headers["Authorization"] = `Bearer ${apiKey}`;
          }
          
          try {
            const response = await fetch(backend.url + "/chat/completions", {
              method: "POST",
              headers,
              body: JSON.stringify(body),
            });
            
            return new Response(response.body, {
              status: response.status,
              headers: {
                "Content-Type": response.headers.get("Content-Type") || "application/json",
                "X-Vakt-Backend": result.backend,
              },
            });
          } catch (err) {
            return new Response(
              JSON.stringify({ error: `Backend error: ${err}` }),
              { status: 502, headers: { "Content-Type": "application/json" } }
            );
          }
        },
      });
      
      ok(`Router listening on http://localhost:${port}/v1`);
      info("Press Ctrl+C to stop");
      
      await new Promise(() => {});
    });
}

async function testRouting(
  config: { modelRouter?: { port: number; backends?: Record<string, { url: string }>; rules?: any[] } },
  opts: { tokens?: string; tools?: string; hasCode?: boolean; hasMath?: boolean }
): Promise<void> {
  console.log(bold("Testing routing logic...\n"));
  
  const routerConfig = config.modelRouter;
  if (!routerConfig) {
    console.error("Model router not configured.");
    process.exit(1);
  }
  
  const signals = {
    promptTokens: opts.tokens ? Number.parseInt(opts.tokens, 10) : 1000,
    toolCount: opts.tools ? Number.parseInt(opts.tools, 10) : 0,
    hasCode: opts.hasCode || false,
    hasMath: opts.hasMath || false,
  };
  
  console.log("Signals:");
  console.log(`  promptTokens: ${signals.promptTokens}`);
  console.log(`  toolCount: ${signals.toolCount}`);
  console.log(`  hasCode: ${signals.hasCode}`);
  console.log(`  hasMath: ${signals.hasMath}`);
  console.log();
  
  const result = selectBackend(routerConfig, signals);
  
  if (result.backend) {
    console.log(`${green("✓")}  Routed to: ${bold(result.backend)}`);
    if (result.matchedRule !== undefined) {
      console.log(`   Matched rule #${result.matchedRule}`);
    }
  } else {
    console.log(`${yellow("⚠")}  No backend matched`);
  }
}
