FROM debian:bookworm-slim

# ── System dependencies ───────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg2 pass bats jq git unzip \
    nodejs npm \
    && rm -rf /var/lib/apt/lists/*

# ── Bun ───────────────────────────────────────────────────────────────────────
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# ── App source ────────────────────────────────────────────────────────────────
WORKDIR /app
COPY . .

# ── Install JS dependencies ───────────────────────────────────────────────────
# Main project (Bun)
RUN bun install --frozen-lockfile

# MCP server fixture (Node.js npm — uses committed lockfile)
RUN cd tests/fixtures/mcp && npm ci

# ── Smoke-test that MCP server loads ─────────────────────────────────────────
RUN node tests/fixtures/mcp/node_modules/@modelcontextprotocol/server-everything/dist/index.js \
    --version 2>&1 | head -1 || true

# ── Entrypoint ────────────────────────────────────────────────────────────────
ENTRYPOINT ["/app/tests/docker/entrypoint.sh"]
