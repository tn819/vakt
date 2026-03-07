# Agent Development Guidelines for agentctl

This document provides guidelines for AI agents working on the agentctl codebase.

## Project Overview

`agentctl` is a provider-agnostic CLI tool for managing MCP servers and skills across multiple AI coding tools (OpenCode, Claude Code, Gemini CLI, Codex). It provides cross-platform secrets management and configurable paths.

## Architecture

```
agentctl/
├── src/
│   ├── agentctl.sh         # Main CLI entry point
│   ├── commands/           # Command implementations
│   │   └── sync.sh
│   ├── lib/                # Shared libraries
│   │   └── secrets.sh
│   └── templates/          # Configuration templates
├── skills/                 # Bundled skills (5 default)
├── tests/                  # Test suite
│   ├── e2e/               # End-to-end tests
│   └── test_helper.bash   # Test utilities
└── install.sh             # One-line installer
```

## Testing Requirements

### MANDATORY: All Core CLI Functionality Must Be Tested

**Every core CLI command must have comprehensive e2e tests using a terminal emulator.**

#### Core Commands Requiring Tests

1. **init** - Initialize `~/.agents/` directory
2. **sync** - Sync MCP servers and skills to providers
3. **secrets** - Manage secrets (set, get, delete, list)
4. **config** - View/edit configuration
5. **add-server** - Add MCP server to config
6. **add-skill** - Add skill to skills directory
7. **list** - List servers, skills, and secrets

#### Test Coverage Requirements

Each command must be tested for:

- ✅ **Success path** - Command works as documented
- ✅ **Error handling** - Invalid inputs, missing arguments
- ✅ **Edge cases** - Existing directories, special characters, permissions
- ✅ **Cross-platform behavior** - macOS vs Linux differences
- ✅ **Integration** - Commands work together (init → add → sync)

#### Testing Framework

Use `bats` (Bash Automated Testing System) for all tests:

```bash
# Install bats
brew install bats-core  # macOS
apt install bats        # Linux

# Run tests
bats tests/e2e/
```

#### Test Structure

```bash
#!/usr/bin/env bats

# tests/e2e/init.bats

load '../test_helper'

setup() {
  # Create isolated test environment
  export AGENTS_DIR="$(mktemp -d)"
}

teardown() {
  # Clean up test environment
  rm -rf "$AGENTS_DIR"
}

@test "init creates ~/.agents/ directory" {
  run agentctl init

  [ "$status" -eq 0 ]
  [ -d "$AGENTS_DIR" ]
  [ -f "$AGENTS_DIR/config.json" ]
  [ -f "$AGENTS_DIR/mcp-config.json" ]
}

@test "init fails gracefully if directory exists" {
  agentctl init
  run agentctl init <<< "n"

  [ "$status" -eq 1 ]
}
```

#### Running Tests Locally

```bash
# Run all tests
bats tests/

# Run specific test file
bats tests/e2e/init.bats

# Run with verbose output
bats --tap tests/e2e/
```

## Code Style Guidelines

### Bash Scripts

- Use `set -euo pipefail` for strict mode
- Quote all variables: `"$variable"`
- Use `[[ ]]` for conditionals (not `[ ]`)
- Functions should be lowercase with underscores: `function_name()`
- Use `local` for function-scoped variables
- Prefer `printf` over `echo` for formatted output

### Error Handling

```bash
if [[ ! -f "$config_file" ]]; then
  echo "Error: Config not found. Run 'agentctl init' first." >&2
  return 1
fi
```

### User Feedback

- Use colors for visual feedback (✓ for success, ✗ for error, ⚠ for warning)
- Provide actionable error messages
- Suggest next steps after commands

## Secrets Management

### Security Requirements

- **NEVER** log or print secret values
- **ALWAYS** use secure backend (Keychain/pass) in production
- **ONLY** use env file fallback for development/testing
- **VALIDATE** secret references at sync time
- **MASK** secrets in error messages

### Backend Detection Logic

```bash
# Auto-detect secrets backend
if [[ "$(uname)" == "Darwin" ]]; then
  # macOS: Use Keychain
  backend="keychain"
elif command -v pass &>/dev/null; then
  # Linux with pass installed
  backend="pass"
else
  # Fallback to env file
  backend="env"
fi
```

## Path Templating

Variables in `mcp-config.json` are resolved from `config.json`:

- `{{paths.code}}` → `config.paths.code`
- `{{paths.documents}}` → `config.paths.documents`
- `{{paths.vault}}` → `config.paths.vault`

Implementation:

```bash
resolve_paths() {
  local json="$1"
  local config="$AGENTS_DIR/config.json"

  # Read paths from config
  local code=$(python3 -c "import json; print(json.load(open('$config'))['paths']['code'])")

  # Replace template variables
  json="${json//\{\{paths.code\}\}/$code}"

  echo "$json"
}
```

## Sync Process

The sync command:

1. Reads `~/.agents/mcp-config.json`
2. Resolves `secret:KEY` references
3. Expands `{{paths.X}}` variables
4. Writes to each provider's config location
5. Symlinks skills to each provider

### Provider Config Locations

| Provider    | Config Path                        |
| ----------- | ---------------------------------- |
| OpenCode    | `~/.config/opencode/opencode.json` |
| Claude Code | `~/.claude.json`                   |
| Gemini CLI  | `~/.gemini/settings.json`          |
| Codex       | `~/.codex/config.toml`             |

## Skill Development

Skills are stored as `SKILL.md` files with YAML frontmatter:

```markdown
---
name: skill-name
description: Brief description
---

# Skill Name

Detailed instructions for AI agents...

## Usage

How to use this skill...
```

### Skill Structure

```
skills/skill-name/
├── SKILL.md           # Required: Skill definition
├── references/        # Optional: Reference docs
├── scripts/           # Optional: Helper scripts
└── README.md          # Optional: User documentation
```

## Release Checklist

Before releasing:

- [ ] All tests pass (`bats tests/`)
- [ ] Cross-platform testing (macOS + Linux)
- [ ] Documentation updated
- [ ] Version bumped in `src/agentctl.sh`
- [ ] CHANGELOG.md updated with new version section

### Release Process (Automated)

Releases are **fully automated** using semantic-release:

1. Make commits with conventional commit messages:
   - `feat:` → minor version bump (0.1.0)
   - `fix:` → patch version bump (0.0.2)
   - `chore:`, `docs:`, `refactor:` → patch bump

2. Create PR to `main` branch

3. When PR merges:
   - Tests run automatically
   - Semantic-release analyzes commits
   - Version is bumped automatically
   - CHANGELOG.md is generated
   - GitHub release is created
   - Tarball is uploaded

**No manual steps required!**

### Manual Release (Emergency Only)

If semantic-release fails:

```bash
# Create PR with conventional commit message
git checkout -b fix/release-issue
# Make fixes
git commit -m "fix: resolve release issue"
git push origin fix/release-issue
gh pr create --base main
# Merge PR, semantic-release will trigger
```

## Common Patterns

### Adding a New Command

1. Add command to `agentctl.sh` case statement
2. Implement command function
3. Add tests in `tests/e2e/command.bats`
4. Update README.md with usage examples
5. Update this AGENTS.md if needed

### Adding a New Provider

1. Add provider to sync logic in `src/commands/sync.sh`
2. Map config format to provider's schema
3. Add tests for provider sync
4. Update README.md provider table
5. Test on fresh installation

## Debugging

Enable debug mode:

```bash
export AGENTS_DEBUG=1
agentctl sync
```

Verbose output:

```bash
bash -x src/agentctl.sh sync
```

## Security Considerations

- Secrets are **NEVER** written to provider configs
- Template variables are validated before expansion
- Config files use restrictive permissions (600)
- Git repos are scanned for leaked secrets (audit-credentials skill)
- All external commands are validated before execution

## Performance

- Minimize file I/O operations
- Use `python3` for JSON manipulation (faster than multiple jq calls)
- Cache config reads when possible
- Parallelize provider syncs when safe

## Contributing

1. Write tests first (TDD)
2. Ensure all existing tests pass
3. Follow code style guidelines
4. Update documentation
5. Test on both macOS and Linux
