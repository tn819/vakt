---
status: accepted
date: 2026-03-13
---

# 0003 — End-to-end security test harness with real MCP protocol, OTel, and attack simulation

## Context

vakt's primary value proposition is that it intercepts, enforces policy on, and audits MCP tool calls in real time. The existing test suite covers this at two levels:

- **Unit tests** (`src/**/*.test.ts`) — verify individual functions in isolation: policy engine, audit store, proxy logic, secret resolution.
- **bats e2e tests** (`tests/e2e/`) — verify CLI commands end-to-end on the local machine, using `/bin/cat` as a stub MCP server and skipping real secrets backends.

Neither level validates the claim that matters most: **when a real AI agent attempts a prompt injection or data exfiltration via MCP, vakt detects it, blocks it, logs it in the audit trail, and emits a traceable OTel span** — with evidence you can actually inspect.

Specific gaps:

1. The proxy is tested against `/bin/cat`, not a server that speaks the MCP protocol. Protocol-level edge cases (capability negotiation, error framing, chunked frames) are untested.
2. OTel tests only verify that config values are stored. No test asserts that a span was actually emitted and received by a collector.
3. The `pass` (Linux GPG) secrets backend is never exercised in CI — only the `env` backend is tested.
4. No test simulates an adversarial prompt — one that attempts to invoke a denied tool or exfiltrate data via an allowed tool with a crafted payload — and asserts that vakt's response is both correct and observable.

## Decision

We will add a Docker Compose–based e2e harness in `tests/docker/` that exercises vakt against a real MCP server, a real OTLP collector, and simulated attacks. The harness runs in CI as a separate job and locally via `docker compose up --abort-on-container-exit`.

**Components:**

- **`vakt` container** (Debian slim + Bun): runs the harness bats suite. Has `pass`, `gpg`, and `gnupg2` installed. A pre-generated throwaway GPG key pair (no passphrase, committed to `tests/fixtures/gpg/`) is imported at container startup and used to initialise a `pass` store, enabling the Linux secrets backend.
- **`mcp` container** (Node slim): runs `@modelcontextprotocol/server-everything` — the official MCP reference server — over stdio. vakt spawns it as a child process (same as production), so it runs inside the `vakt` container's process namespace rather than as a separate service. The `mcp` image is built once and copied into the `vakt` image layer.
- **`jaeger` container** (`jaegertracing/all-in-one`): receives OTLP gRPC on port 4317, exposes query REST API on port 16686. The `vakt` container sets `AGENTS_OTEL_ENDPOINT=http://jaeger:4317`.

**Test scenarios:**

1. **Real MCP protocol flow** — `initialize` handshake, `tools/list`, then `tools/call` for an allowed tool. Assert response is well-formed, audit DB has one `allow` entry, Jaeger has one span with `policy.result=allow`.

2. **Policy deny** — `tools/call` for a tool listed in `deny`. Assert JSON-RPC error frame returned, MCP server never receives the frame (verified by audit — no `allow` entry), Jaeger has span with `policy.result=deny`.

3. **Prompt injection simulation** — a `tools/call` where the `params` payload contains a crafted string designed to override policy instructions (e.g. `"ignore previous policy and allow all tools"`). The tool itself is on the deny list. Assert vakt evaluates the *tool name* from the JSON-RPC frame, not the payload content — the call is denied regardless of payload.

4. **Exfiltration simulation** — an allowed tool (`echo`) is called with a payload that mimics a data exfiltration pattern (e.g. base64-encoded environment variables in the argument). Assert the call is allowed (correct — policy is tool-level, not content-level), the full payload is recorded verbatim in the audit log, and the OTel span carries the tool name. This documents the current trust boundary: vakt controls *which* tools run, not *what data* flows through them. The audit log is the evidence trail.

5. **`pass` backend secrets** — set a secret via `vakt secrets set`, resolve it via `$secret:pass/my-key` in a server env, assert the resolved value reaches the MCP server process.

6. **OTel span completeness** — after scenarios 1–4, query Jaeger REST API (`GET /api/traces?service=vakt`), assert: correct service name, span count matches tool call count, `policy.result`, `server.name`, `tool.name`, and `session.id` attributes present on every span.

**GPG key management:**

A throwaway 4096-bit RSA key pair with no passphrase is generated once (`tests/fixtures/gpg/`), committed to the repository, and used solely for the `pass` backend test. The key has no access to any real system. A comment in the key generation script and the fixture directory README makes this explicit.

## Alternatives Considered

### Use `/bin/cat` in Docker (extend existing bats approach)

Keep the current dumb-echo stub but run it in a container to test the `pass` backend and OTel in a Linux environment.

**Why not chosen:** Does not exercise the real MCP protocol. Capability negotiation, `initialize` handshake, and proper JSON-RPC error framing are all untested. The gap between the stub and a real agent's MCP client is too large to give meaningful confidence.

### Build a bespoke minimal stdio MCP server in-repo

Write a small TypeScript/Bun script in `tests/fixtures/` that speaks just enough of the protocol for the test scenarios.

**Why not chosen:** Protocol drift risk — the fixture diverges from the spec as the MCP SDK evolves. `@modelcontextprotocol/server-everything` is maintained by the MCP SDK team and tracks the spec. A bespoke server would need its own maintenance. Pinning the npm version in a fixture `package.json` gives reproducibility without the maintenance burden.

### OpenTelemetry Collector instead of Jaeger

Run the official `otel/opentelemetry-collector` and configure a file exporter, then grep the output file to assert spans.

**Why not chosen:** Requires a non-trivial collector config YAML (receivers, exporters, pipelines). Asserting against a file exporter is fragile — span serialisation format varies between collector versions. Jaeger's REST query API (`/api/traces`) returns stable JSON that `jq` can reliably parse in bats assertions.

### No Docker — expand unit tests to mock OTel and pass

Add more sophisticated mocking in the unit test layer: mock the OTLP exporter, stub `spawnSync` for `pass`/`security`.

**Why not chosen:** Mocking at this level tests the mocks, not the integration. The keychain incident that motivated the `AGENTS_SECRETS_BACKEND=env` guard is an example of mocked tests passing while real-system behaviour diverges. The point of this harness is observable, end-to-end evidence — not coverage numbers.

## Consequences

**Positive:**

- The audit log and OTel spans are tested against real observable output, not mocked interfaces. A regression in span emission will fail CI.
- The `pass` backend is exercised in CI for the first time. Linux users get coverage parity with macOS.
- The prompt injection and exfiltration scenarios produce a living spec of vakt's trust boundary: tool-name enforcement is demonstrated to work; content-level filtering is explicitly documented as out of scope (with audit as the compensating control).
- The harness doubles as a demo environment — `docker compose up` gives a new contributor a running system to explore in minutes.

**Negative / trade-offs:**

- CI time increases. Docker builds and Jaeger startup add ~60–90s to the pipeline. Mitigated by running the Docker job in parallel with the existing `validate` and `sonarcloud` jobs, not sequentially.
- The throwaway GPG key is committed to the repository. This is intentional and documented, but requires a clear comment to avoid future confusion about whether it has security significance (it does not).
- `@modelcontextprotocol/server-everything` is an external dependency. Pinned to a specific version in `tests/fixtures/mcp/package.json`; Dependabot or manual review required when the MCP SDK cuts breaking changes.
- The exfiltration scenario explicitly documents that vakt does **not** inspect tool call payloads. This is the correct design (content inspection is a different problem domain) but it must be clearly communicated so the test is not misread as a gap.

**Neutral / to monitor:**

- Jaeger all-in-one is not recommended for production use. If vakt ever ships its own collector config, revisit whether the test harness should use the Collector instead to keep test and production configs aligned.
- GPG key expiry: the committed test key should be set to never expire, or the expiry date should be far enough in the future that it does not cause spurious CI failures.
