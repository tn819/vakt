# CLI Rename: agentctl → mcpctl

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename the CLI binary and package from `agentctl` to `mcpctl` to eliminate the GitHub namespace conflict with `iheanyi/agentctl` and improve organic discoverability for developers searching for MCP tooling.

**Architecture:** Rename is purely cosmetic at the code level — the binary name, package name, and all user-visible strings change. Internal module structure and command names stay the same. The `~/.agents/` directory and config schema are unchanged (no migration needed).

**Tech Stack:** Bash, package.json, install.sh, README.md

**Research context:**
- `github.com/iheanyi/agentctl` is an active competing project with the same name and same concept (Go-based universal MCP config manager)
- `mcpctl` follows the `kubectl` pattern; puts `mcp` in the name for search discoverability
- npm namespace for `mcpctl` appears clear; GitHub namespace unoccupied
- Rename does not affect `~/.agents/` directory (canonical config location stays)

---

### Task 1: Update package.json

**Files:**
- Modify: `package.json`

**Step 1: Update the name and description fields**

```json
{
  "name": "mcpctl",
  "description": "Provider-agnostic MCP server, skills, and secrets manager",
  "repository": {
    "type": "git",
    "url": "https://github.com/tn819/mcpctl.git"
  }
}
```

**Step 2: Verify package.json is valid JSON**

```bash
node -e "require('./package.json')" && echo "Valid JSON"
```
Expected: `Valid JSON`

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore: rename package from agentctl to mcpctl"
```

---

### Task 2: Rename the binary entrypoint

**Files:**
- Modify: `src/agentctl.sh` (rename to `src/mcpctl.sh`)
- Modify: `src/agentctl.sh` internal `version()` string

**Step 1: Update version string in src/agentctl.sh**

Change line:
```bash
echo "agentctl 0.0.1"
```
To:
```bash
echo "mcpctl 0.0.1"
```

**Step 2: Rename the file**

```bash
git mv src/agentctl.sh src/mcpctl.sh
```

**Step 3: Update package.json scripts to reference new filename**

```json
{
  "scripts": {
    "test": "bats tests/",
    "pretest": "chmod +x src/mcpctl.sh",
    "prepare": "husky"
  }
}
```

**Step 4: Run tests to verify nothing broken**

```bash
npm test
```
Expected: all tests pass (or same pass/fail as before rename)

**Step 5: Commit**

```bash
git add src/mcpctl.sh package.json
git commit -m "feat: rename binary from agentctl to mcpctl"
```

---

### Task 3: Update install.sh

**Files:**
- Modify: `install.sh`

**Step 1: Read current install.sh to understand what references agentctl**

Check for: PATH export lines, symlink targets, directory names, printed instructions

**Step 2: Replace all `agentctl` references with `mcpctl`**

Key lines to update (exact content depends on current install.sh):
- Any `~/.agentctl` directory references → `~/.mcpctl`
- Any `export PATH="$PATH:$HOME/.agentctl/src"` → `export PATH="$PATH:$HOME/.mcpctl/src"`
- Any `git clone ... ~/.agentctl` → `git clone ... ~/.mcpctl`
- Any printed "agentctl" in echo/printf statements

**Step 3: Test the install script dry-run**

```bash
bash -n install.sh && echo "Syntax OK"
```
Expected: `Syntax OK`

**Step 4: Commit**

```bash
git add install.sh
git commit -m "chore: update install.sh for mcpctl rename"
```

---

### Task 4: Update README.md

**Files:**
- Modify: `README.md`

**Step 1: Update the headline and tagline**

Replace:
```markdown
# agentctl
> Build your MCP servers, skills, and config once. Use them in every AI coding tool — securely, portably, forever.
```

With:
```markdown
# mcpctl
> Configure your MCP servers, skills, and secrets once. Works in every AI coding tool — securely, portably, everywhere.
```

**Step 2: Replace all `agentctl` command examples with `mcpctl`**

Every code block that shows:
```bash
agentctl init
agentctl sync
agentctl secrets set GITHUB_TOKEN ghp_...
```

Becomes:
```bash
mcpctl init
mcpctl sync
mcpctl secrets set GITHUB_TOKEN ghp_...
```

**Step 3: Update the clone URL in "Get started in 60 seconds"**

```bash
git clone https://github.com/tn819/mcpctl ~/.mcpctl
export PATH="$PATH:$HOME/.mcpctl/src"
```

**Step 4: Add a compatibility note for existing agentctl users**

At the bottom of the README, add:

```markdown
## Migrating from agentctl

If you previously installed `agentctl`, no config migration is needed — `~/.agents/` is unchanged.
Update your PATH to point to the new install location:

```bash
git clone https://github.com/tn819/mcpctl ~/.mcpctl
export PATH="$PATH:$HOME/.mcpctl/src"
```

**Step 5: Commit**

```bash
git add README.md
git commit -m "docs: update README for mcpctl rename"
```

---

### Task 5: Update test files

**Files:**
- Modify: `tests/*.bats` (any test that asserts the binary name or version string)

**Step 1: Search for agentctl references in tests**

```bash
grep -r "agentctl" tests/
```

**Step 2: Replace binary name in test assertions**

Any line like:
```bash
run agentctl version
[ "$output" = "agentctl 0.0.1" ]
```
Becomes:
```bash
run mcpctl version
[ "$output" = "mcpctl 0.0.1" ]
```

**Step 3: Run full test suite**

```bash
npm test
```
Expected: all tests pass

**Step 4: Commit**

```bash
git add tests/
git commit -m "test: update test assertions for mcpctl rename"
```

---

### Task 6: Rename GitHub repository and update remote

**Step 1: Rename repository on GitHub**

Go to `github.com/tn819/agentctl` → Settings → Repository name → `mcpctl` → Rename

GitHub automatically creates a redirect from the old URL. Existing clones continue to work.

**Step 2: Update local remote URL**

```bash
git remote set-url origin git@github.com:tn819/mcpctl.git
```

**Step 3: Verify remote updated**

```bash
git remote -v
```
Expected: shows `git@github.com:tn819/mcpctl.git`

**Step 4: Push all changes**

```bash
git push origin feat/cli-rename
```

**Step 5: Open PR and merge to main**

PR title: `feat: rename CLI from agentctl to mcpctl`

---

### Done

The binary is now `mcpctl`. The `~/.agents/` config directory is unchanged — no user migration required. Update any documentation, blog posts, or external links from `agentctl` to `mcpctl`.
