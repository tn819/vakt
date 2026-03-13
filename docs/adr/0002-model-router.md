---
status: accepted
date: 2026-03-13
---

# 0002 — Model router: route completions between local and remote LLMs

## Context

vakt already sits between AI coding agents and MCP servers — it sees every tool call, enforces policy, and keeps an audit log. That positions it naturally as the control plane for AI agent infrastructure, not just MCP config management.

The obvious next layer is model completions. Right now, agents send every request — a two-line autocomplete and a 40-file refactor alike — to the same frontier API. That's expensive and sometimes the wrong call:

**Cost.** Frontier models (Claude, GPT-4o, Gemini) aren't cheap at volume. Most completions are short and routine. A fine-tuned 7B on a €250/mo Hetzner GPU handles those just fine, at near-zero marginal cost.

**Context limits.** The local model tops out around 8k–32k tokens. Anything bigger — large refactors, multi-file analysis, requests with a lot of tool schemas — needs to go to a frontier API with 128k+ context. The router handles this automatically.

**EU data sovereignty.** If data can't leave the EU, US-hosted APIs (Anthropic, OpenAI) aren't an option. Mistral (Paris) covers the frontier case. The router becomes the enforcement point.

**One control plane.** Teams using vakt for MCP policy don't want a second proxy sitting alongside it with its own secrets, its own logs, and no idea what vakt is doing. Fragmentation is the problem vakt exists to solve.

The routing logic itself is deliberately simple: two signals — estimated prompt token count and number of tool schemas — are enough to predict whether the local model will cope. No ML, no classifier. Just a rule list evaluated in order, first match wins.

## Decision

`vakt route` starts a local OpenAI-compatible HTTP proxy (default port 4000). Point your AI coding tool at `http://localhost:4000/v1` instead of the model API directly, and vakt figures out which backend to use per request.

Rules live in `~/.agents/config.json` under `modelRouter`, alongside the existing MCP config. Backend API keys use the same `secret:KEY` syntax as everything else in vakt — resolved at startup, never hardcoded.

```json
{
  "modelRouter": {
    "port": 4000,
    "backends": {
      "local":   { "url": "http://10.0.0.5:8000/v1", "apiKey": "secret:HETZNER_KEY", "maxCtx": 8192 },
      "mistral": { "url": "https://api.mistral.ai/v1",  "apiKey": "secret:MISTRAL_KEY", "maxCtx": 131072 }
    },
    "rules": [
      { "if": { "promptTokens": { "gt": 16000 } }, "use": "mistral" },
      { "if": { "toolCount":    { "gt": 5 }      }, "use": "mistral" },
      { "use": "local" }
    ]
  }
}
```

The routing logic is a pure function in `src/lib/router.ts` with no I/O — easy to unit test in isolation. The HTTP proxy uses Bun's built-in `Bun.serve()` and `fetch()`, so there are no new runtime dependencies. Routing events land in the existing AuditStore SQLite database alongside MCP tool call events.

Token estimation is `Math.ceil(JSON.stringify(messages).length / 4)` — no tokenizer needed, accurate enough for routing, not for billing.

## Alternatives Considered

### LiteLLM

The closest existing tool to what we're building — an OpenAI-compatible proxy that routes to 100+ backends.

**Why not chosen:** LiteLLM knows nothing about MCP tool calls, vakt policy, `secret:KEY` refs, or the AuditStore. Running it next to vakt means two control planes, duplicated secret management, and no way to correlate a model request with the tool call session that triggered it. That's exactly the fragmentation we're trying to avoid.

### PortKey / OpenRouter / Helicone

Hosted gateways with routing and observability features.

**Why not chosen:** They're external services, which immediately rules them out for EU-sovereignty deployments. Same integration gap as LiteLLM otherwise.

### Fold it into the existing `vakt proxy`

The MCP proxy intercepts JSON-RPC over stdio. Model completions are OpenAI HTTP API over TCP. They're different protocols on different transports, initiated by different parties. Jamming both into one process mixes concerns and forces the MCP proxy to bind a TCP port.

**Why not chosen:** Wrong layer. Keep them separate.

### Let the AI tool handle routing itself

Some tools let you configure multiple model endpoints and switch manually.

**Why not chosen:** No central enforcement, no audit trail, per-developer drift. Again — the problem vakt exists to solve.

### ML-based routing (RouteLLM-style classifier)

Train a small model to predict which backend will give the best quality/cost result.

**Why not chosen:** We're adding a router to a security and policy tool. Predictability and auditability matter more than squeezing out a few extra quality points. Token count and tool count are observable, deterministic, and sufficient. We can revisit if rule-based routing shows real gaps.

## Consequences

**Positive:**

- Agents get a single model endpoint; vakt routes transparently behind it
- ~80% of routine completions can hit the local model at near-zero cost
- EU-sovereignty enforcement becomes a config rule, not a manual process
- Model routing events join MCP tool call events in the same audit log
- No new dependencies — Bun handles the HTTP primitives

**Negative / trade-offs:**

- Token estimation is approximate (±20–30% on code-heavy or non-ASCII content). Fine for routing thresholds, not for billing
- `vakt route` is another process to keep running. Daemon integration would fix this — it's not done yet
- Streaming responses pass through uninspected; we can't count tokens in the stream. That's fine — routing decisions happen on the request, not the response

**Neutral / to monitor:**

- `maxCtx` is advisory metadata, not enforced. The upstream model will reject an overlong request with an error. Add a hard-block rule if this becomes a recurring issue
- If rules get complex, a `--test` flag that dry-runs routing for a given token/tool count would be useful
- Provider-side prompt caching (Anthropic and Mistral both cache repeated system prompt prefixes) means skills injected by vakt already get ~90% token savings on that content automatically — stacks well with model routing
- MCP tool response caching is deferred until the spec standardizes `cache-control` semantics on tool schemas. The `interceptResponse` hook in `daemon/proxy.ts` is already in position to act on it
