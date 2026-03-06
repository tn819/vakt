---
name: skill-creator
description: Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, update or optimize an existing skill, run evals to test a skill, benchmark skill performance with variance analysis, or optimize a skill's description for better triggering accuracy.
---

# Skill Creator

A skill for creating new skills and iteratively improving them using agentctl's provider-agnostic approach.

## Overview

At a high level, the process of creating a skill goes like this:

- Decide what you want the skill to do and roughly how it should do it
- Write a draft of the skill
- Create a few test prompts and run claude-with-access-to-the-skill on them
- Help the user evaluate the results both qualitatively and quantitatively
- Rewrite the skill based on feedback
- Repeat until satisfied
- Use agentctl to install and sync the skill to all providers

## Communicating with the User

The skill creator is liable to be used by people across a wide range of familiarity with coding jargon. Pay attention to context cues to understand how to phrase your communication.

---

## Creating a Skill

### Step 1: Capture Intent

Start by understanding the user's intent. The current conversation might already contain a workflow the user wants to capture.

1. What should this skill enable Claude to do?
2. When should this skill trigger? (what user phrases/contexts)
3. What's the expected output format?
4. Should we set up test cases to verify the skill works?

### Step 2: Interview and Research

Proactively ask questions about edge cases, input/output formats, example files, success criteria, and dependencies.

### Step 3: Create the Skill Directory

Create the skill in `~/.agents/skills/<skill-name>/`:

```bash
mkdir -p ~/.agents/skills/<skill-name>
```

### Step 4: Write the SKILL.md

Create `~/.agents/skills/<skill-name>/SKILL.md` with:

```markdown
---
name: skill-name
description: When to trigger, what it does. Be specific about trigger phrases.
---

# Skill Name

[Instructions for the skill...]
```

**Key frontmatter fields:**

- **name**: Skill identifier (required)
- **description**: When to trigger + what it does (required, this is the primary triggering mechanism)

### Skill Writing Guide

#### Anatomy of a Skill

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description required)
│   └── Markdown instructions
└── Bundled Resources (optional)
    ├── scripts/    - Executable code for deterministic tasks
    ├── references/ - Docs loaded into context as needed
    └── assets/     - Files used in output (templates, etc.)
```

#### Progressive Disclosure

Skills use a three-level loading system:

1. **Metadata** (name + description) - Always in context (~100 words)
2. **SKILL.md body** - In context whenever skill triggers (<500 lines ideal)
3. **Bundled resources** - As needed (unlimited)

#### Writing Patterns

- Prefer imperative form in instructions
- Explain the **why** behind instructions
- Include examples for clarity
- Avoid heavy-handed MUSTs when explanation works better

### Step 5: Add Bundled Resources (Optional)

Create supporting files if needed:

```bash
# Scripts for deterministic tasks
mkdir -p ~/.agents/skills/<skill-name>/scripts

# Reference documentation
mkdir -p ~/.agents/skills/<skill-name>/references

# Templates and assets
mkdir -p ~/.agents/skills/<skill-name>/assets
```

### Step 6: Register and Sync the Skill

Once the skill is created, register it and sync to all providers:

```bash
# The skill is already in ~/.agents/skills/, so just sync
agentctl sync --skills-only
```

This symlinks the skill to all installed providers:

- `~/.claude/skills/<skill-name>` → `~/.agents/skills/<skill-name>`
- `~/.config/opencode/skills/<skill-name>` → `~/.agents/skills/<skill-name>`
- `~/.gemini/skills/<skill-name>` → `~/.agents/skills/<skill-name>`

### Step 7: Verify Installation

```bash
agentctl list
```

This shows all skills and which providers they're available in.

---

## Testing the Skill

### Create Test Cases

After writing the skill draft, create 2-3 realistic test prompts. Save them for evaluation:

```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "User's task prompt",
      "expected_output": "Description of expected result"
    }
  ]
}
```

### Run Test Cases

For each test case:

1. Use the skill to complete the task
2. Compare output to expected behavior
3. Note any issues or unexpected behavior

### Evaluate and Iterate

Based on test results:

1. Identify what worked and what didn't
2. Improve the skill instructions
3. Re-test
4. Repeat until satisfied

After each improvement, re-sync:

```bash
agentctl sync --skills-only
```

---

## Improving an Existing Skill

### Locate the Skill

```bash
agentctl list
```

Skills are stored in `~/.agents/skills/<skill-name>/`.

### Edit and Sync

1. Edit `~/.agents/skills/<skill-name>/SKILL.md`
2. Re-sync to all providers:

```bash
agentctl sync --skills-only
```

### Testing Improvements

Use the same test-driven approach:

1. Create test cases
2. Run with the improved skill
3. Compare to baseline (previous version)
4. Iterate

---

## Description Optimization

The description field is the primary triggering mechanism. After creating or improving a skill, optimize it.

### Create Trigger Evals

Generate 20 test queries — mix of should-trigger and should-not-trigger:

```json
[
  { "query": "user prompt that should trigger", "should_trigger": true },
  { "query": "user prompt that should not trigger", "should_trigger": false }
]
```

### Test and Refine

1. Test each query against the skill
2. Identify false positives and false negatives
3. Adjust the description
4. Re-test
5. Repeat until triggering is accurate

---

## Sharing Skills

### Option 1: Git Repository

Create a git repo with the skill:

```bash
cd ~/.agents/skills/<skill-name>
git init
git add .
git commit -m "Initial commit"
git remote add origin git@github.com:username/<skill-name>.git
git push -u origin main
```

Others can install with:

```bash
agentctl add-skill https://github.com/username/<skill-name>
agentctl sync
```

### Option 2: Include in agentctl Bundle

For skills that should be bundled with agentctl by default, contribute to the agentctl repository.

---

## Quick Reference

| Action                 | Command                            |
| ---------------------- | ---------------------------------- |
| Create skill directory | `mkdir -p ~/.agents/skills/<name>` |
| List skills            | `agentctl list`                    |
| Sync to providers      | `agentctl sync --skills-only`      |
| Add skill from URL     | `agentctl add-skill <url>`         |
| Add skill from path    | `agentctl add-skill ./path <name>` |

---

## The Core Loop

1. **Understand** - What should the skill do?
2. **Draft** - Write the SKILL.md
3. **Test** - Run realistic prompts
4. **Evaluate** - Check outputs against expectations
5. **Improve** - Refine based on feedback
6. **Sync** - `agentctl sync --skills-only`
7. **Repeat** - Until satisfied

Good luck!
