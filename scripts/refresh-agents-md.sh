#!/usr/bin/env bash
# Regenerate the Architecture tree section of AGENTS.md from the actual filesystem.
# Replaces everything between "```" fences inside ## Architecture.
# Safe to run repeatedly — idempotent.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS_MD="$REPO_ROOT/AGENTS.md"

# ── Build the new tree ────────────────────────────────────────────────────────

build_tree() {
  local src="$REPO_ROOT/src"

  # commands — sorted, with annotations for known TODO stubs
  cmd_lines=""
  for f in "$src"/commands/*.ts; do
    name="$(basename "$f")"
    cmd_lines+="│   │   ├── $name\n"
  done
  # Trim trailing newline and fix last entry to use └──
  cmd_lines="$(printf '%b' "$cmd_lines" | sed '$ s/├/└/')"

  # daemon
  daemon_lines=""
  for f in "$src"/daemon/*.ts; do
    name="$(basename "$f")"
    daemon_lines+="│   │   ├── $name\n"
  done
  daemon_lines="$(printf '%b' "$daemon_lines" | sed '$ s/├/└/')"

  # lib
  lib_lines=""
  for f in "$src"/lib/*.ts; do
    name="$(basename "$f")"
    lib_lines+="│       ├── $name\n"
  done
  lib_lines="$(printf '%b' "$lib_lines" | sed '$ s/├/└/')"

  cat <<TREE
vakt/
├── src/
│   ├── index.ts                  # CLI entry (commander) — registers all commands
│   ├── providers.json            # Provider registry (data-driven, validated by ProvidersSchema)
│   ├── agentctl.sh               # Thin shim: exec bun run src/index.ts "\$@"
│   ├── commands/                 # One file per top-level command
$(printf '%b' "$cmd_lines")
│   ├── daemon/                   # Background process manager + IPC server
$(printf '%b' "$daemon_lines")
│   └── lib/                      # Shared libraries — pure functions, no CLI side effects
$(printf '%b' "$lib_lines")
├── tests/
│   ├── unit/                     # Bun unit tests (*.test.ts)
│   │   ├── setup.ts              # Bun test preload — configured in bunfig.toml
│   │   └── *.test.ts
│   └── e2e/                      # bats end-to-end tests (invoke vakt CLI via agentctl.sh)
│       └── *.bats
├── skills/                       # Bundled skills (bash scripts + SKILL.md)
├── scripts/                      # Dev scripts (refresh-agents-md.sh, etc.)
├── docs/                         # TODO: GitHub Pages static site
└── install.sh
TREE
}

NEW_TREE="$(build_tree)"

# ── Splice into AGENTS.md ─────────────────────────────────────────────────────
# Replace the content of the first ``` block inside ## Architecture

python3 - "$AGENTS_MD" "$NEW_TREE" <<'PYEOF'
import sys, re

path = sys.argv[1]
new_tree = sys.argv[2]

with open(path) as f:
    content = f.read()

# Find the ## Architecture section and replace its first fenced code block
pattern = r'(## Architecture\s*\n\s*```\s*\n)([^`]*?)(```)'
replacement = r'\g<1>' + new_tree + '\n' + r'\g<3>'
updated = re.sub(pattern, replacement, content, count=1, flags=re.DOTALL)

if updated == content:
    print("AGENTS.md architecture tree: no changes needed")
else:
    with open(path, 'w') as f:
        f.write(updated)
    print("AGENTS.md architecture tree: refreshed")
PYEOF
