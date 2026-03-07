---
name: find-skills
description: Helps users discover and install agent skills when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or express interest in extending capabilities. This skill should be used when the user is looking for functionality that might exist as an installable skill.
---

# Find Skills

This skill helps you discover and install skills using agentctl's provider-agnostic approach.

## When to Use This Skill

Use this skill when the user:

- Asks "how do I do X" where X might be a common task with an existing skill
- Says "find a skill for X" or "is there a skill for X"
- Asks "can you do X" where X is a specialized capability
- Expresses interest in extending agent capabilities
- Wants to search for tools, templates, or workflows
- Mentions they wish they had help with a specific domain (design, testing, deployment, etc.)

## Provider-Agnostic Skill Installation

agentctl manages skills in a single location (`~/.agents/skills/`) and syncs them to all AI coding tools (Claude Code, OpenCode, Gemini CLI, Codex, etc.).

**Key commands:**

```bash
agentctl add-skill <repo-url>           # Install from git repository
agentctl add-skill ./local-skill        # Install from local directory
agentctl sync                            # Sync to all providers
agentctl list                            # List installed skills
```

## How to Help Users Find Skills

### Step 1: Understand What They Need

When a user asks for help with something, identify:

1. The domain (e.g., React, testing, design, deployment)
2. The specific task (e.g., writing tests, creating animations, reviewing PRs)
3. Whether this is a common enough task that a skill likely exists

### Step 2: Search for Skills

Search these skill registries:

**Primary sources:**

- https://skills.sh/ - Official skills registry browser
- https://github.com/vercel-labs/agent-skills - Vercel's official skills
- https://github.com/anthropics/claude-code-skills - Anthropic's skills
- https://github.com/VoltAgent/awesome-agent-skills - Curated skill list

**Search patterns:**

```bash
# Use web search to find skills
web-search query: "agent skills [domain] site:github.com"
web-search query: "SKILL.md [domain] claude code"
```

### Step 3: Present Options to the User

When you find relevant skills, present them with:

1. The skill name and what it does
2. The repository URL
3. The install command

Example response:

```
I found a skill that might help! The "react-best-practices" skill provides
React and Next.js performance optimization guidelines from Vercel Engineering.

To install it:
agentctl add-skill https://github.com/vercel-labs/agent-skills

Then sync to all your AI tools:
agentctl sync
```

### Step 4: Install the Skill

Install skills using agentctl:

```bash
# From a git repository
agentctl add-skill https://github.com/owner/skill-repo

# From a specific subdirectory in a repo (for multi-skill repos)
agentctl add-skill https://github.com/vercel-labs/agent-skills react-best-practices

# From a local directory (during development)
agentctl add-skill ./my-skill
```

### Step 5: Sync to All Providers

After installing, sync to make the skill available across all AI tools:

```bash
agentctl sync
```

This creates symlinks in each provider's skills directory:

- `~/.claude/skills/` → Claude Code
- `~/.config/opencode/skills/` → OpenCode
- `~/.gemini/skills/` → Gemini CLI
- `~/.codex/skills/` → Codex

## Common Skill Categories

When searching, consider these common categories:

| Category        | Example Queries                          |
| --------------- | ---------------------------------------- |
| Web Development | react, nextjs, typescript, css, tailwind |
| Testing         | testing, jest, playwright, e2e           |
| DevOps          | deploy, docker, kubernetes, ci-cd        |
| Documentation   | docs, readme, changelog, api-docs        |
| Code Quality    | review, lint, refactor, best-practices   |
| Design          | ui, ux, design-system, accessibility     |
| Productivity    | workflow, automation, git                |

## Popular Skill Repositories

| Repository                         | Description                                        |
| ---------------------------------- | -------------------------------------------------- |
| `vercel-labs/agent-skills`         | Vercel's official skills (React, deployment, etc.) |
| `anthropics/claude-code-skills`    | Anthropic's example skills                         |
| `microsoft/skills`                 | Microsoft's Azure-focused skills                   |
| `ComposioHQ/awesome-claude-skills` | Community skill collection                         |

## When No Skills Are Found

If no relevant skills exist:

1. Acknowledge that no existing skill was found
2. Offer to help with the task directly using your general capabilities
3. Suggest the user could create their own skill with `agentctl` and the `skill-creator` skill

Example:

```
I searched for skills related to "xyz" but didn't find any matches.
I can still help you with this task directly! Would you like me to proceed?

If this is something you do often, you could create your own skill.
Just say "create a skill for X" and I'll help you build one.
```

## Verifying Installation

After installing and syncing, verify the skill is available:

```bash
agentctl list
```

This shows all installed skills and which providers they're synced to.

## Troubleshooting

**Skill not appearing in provider:**

```bash
# Re-sync to all providers
agentctl sync

# Check skill is installed
agentctl list
```

**Skill from multi-skill repo not installing:**

```bash
# Specify the skill name after the repo URL
agentctl add-skill https://github.com/owner/multi-skill-repo skill-name
```

**Updating a skill:**

```bash
# Remove and reinstall
rm -rf ~/.agents/skills/skill-name
agentctl add-skill https://github.com/owner/skill-repo
agentctl sync
```
