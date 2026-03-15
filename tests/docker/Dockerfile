FROM debian:bookworm-slim

# ── System dependencies ───────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg2 pass bats jq git unzip \
    nodejs npm \
    && rm -rf /var/lib/apt/lists/*

# ── Bun ───────────────────────────────────────────────────────────────────────
# Note: installs latest Bun; no version pin (intentional for test harness)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

# ── Install main project dependencies (cached unless lockfiles change) ────────
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

# ── Install MCP server fixture (cached unless fixture lockfile changes) ───────
COPY tests/fixtures/mcp/package.json tests/fixtures/mcp/package-lock.json \
     tests/fixtures/mcp/
RUN cd tests/fixtures/mcp && npm ci

# ── Copy full source ──────────────────────────────────────────────────────────
COPY . .

# ── Entrypoint ────────────────────────────────────────────────────────────────
ENTRYPOINT ["/app/tests/docker/entrypoint.sh"]
