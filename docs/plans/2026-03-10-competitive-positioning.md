# Competitive Positioning: "The Missing Middle"

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update all public-facing copy to position mcpctl accurately in the market — occupying the "missing middle" between MCP gateway vendors (network layer) and AI governance platforms (data/model layer), with a clear narrative for individual developers, teams, and enterprise buyers.

**Architecture:** Documentation and copy changes only. No code changes. Outputs: updated README, new `docs/positioning/` reference document, updated package.json description, and a one-page "why mcpctl" that can serve as the website hero copy.

**Tech Stack:** Markdown

**Market context from research:**

The market has two layers with no one in between:
- **Network/gateway layer** (Runlayer, MintMCP, Portkey) — governs MCP traffic at runtime, IT-deployed, top-down
- **Model/data layer** (IBM watsonx.governance, Collibra) — governs model risk and data lineage, GRC-facing

mcpctl lives in the unoccupied middle: the developer workstation and team configuration layer.

Key competitive facts:
- `github.com/iheanyi/agentctl` — same name, same concept (post-rename this conflict disappears)
- `dot-agents.com` — same `~/.agents/` directory convention, similar concept, has SEO presence
- `agents` CLI by amtiYo — closest CLI competitor, but uses gitignore for secrets (not keychain)
- No CLI tool combines MCP + skills + OS keychain secrets + full provider coverage

The differentiator: **mcpctl is the only CLI tool that covers all four pillars simultaneously** — MCP sync, skills, OS keychain secrets, and all major providers (Claude Code, Cursor, Gemini CLI, Codex, OpenCode, Windsurf).

---

### Task 1: Create the positioning reference document

**Files:**
- Create: `docs/positioning/market-position.md`

**Step 1: Write the positioning document**

```markdown
# mcpctl Market Position

## The problem in one sentence

Every AI coding tool uses a different config format for the same MCP servers, scatters API keys
across plaintext dotfiles, and requires you to start from scratch on every new machine.

## The market landscape

The MCP ecosystem has produced two categories of tooling with a gap between them:

**Network/gateway layer** — Runlayer, MintMCP, Portkey
These tools govern MCP traffic at runtime. They sit between AI agents and MCP servers, enforcing
access policies, logging requests, and authenticating connections. They require infrastructure
changes and are deployed by IT/platform teams top-down.

**Model/data governance layer** — IBM watsonx.governance, Collibra, Airia
These tools govern AI model risk, data lineage, and AI use-case documentation. They operate at
the GRC/compliance layer and are purchased by risk teams.

**The missing middle: the developer configuration layer**

Neither category governs what's configured on each developer's machine:
- Which MCP servers are authorized for this team?
- Where are the API keys stored, and who can access them?
- When a new developer joins, how do they get the right config?
- When someone leaves, are their credentials revoked?
- Can the security team audit what MCP servers are active across the org?

mcpctl owns this layer.

## The competitive moat

| Capability | mcpctl | agents CLI | Conductor | mcp-sync |
|-----------|--------|-----------|-----------|----------|
| CLI-first | ✅ | ✅ | ❌ (GUI only) | ✅ |
| OS keychain secrets | ✅ | ❌ (gitignore) | ✅ (desktop only) | ❌ |
| Skills management | ✅ | ✅ | ❌ | ❌ |
| All 6 major providers | ✅ | ✅ | Partial | Partial |
| Team/org registry | 🗺️ Roadmap | ❌ | ❌ | ❌ |

mcpctl is the only CLI tool that covers all four: MCP sync + skills + OS keychain + full coverage.

## Complementary, not competitive

mcpctl and gateway tools (Runlayer, MintMCP) solve different problems.
- mcpctl governs what gets configured (the config layer)
- Gateway tools govern what runs (the runtime layer)

A team using Runlayer for runtime MCP traffic governance still needs mcpctl to manage which
servers each developer has configured, where credentials are stored, and how new team members
get set up. These tools are deployed together, not instead of each other.

## Positioning by audience

**Individual developer:** "The missing config layer for your AI coding tools."
**Team / DevEx:** "One source of truth for your team's MCP servers, skills, and secrets."
**CISO:** "Eliminate shadow MCP deployments. Enforce credential security. Audit everything."
**All:** "Configure AI tools once. Enforce it everywhere. Audit everything."
```

**Step 2: Commit**

```bash
git add docs/positioning/market-position.md
git commit -m "docs: add market positioning reference document"
```

---

### Task 2: Rewrite the README hero section

**Files:**
- Modify: `README.md`

**Step 1: Replace the current tagline and opening**

Current:
```markdown
# agentctl
> Build your MCP servers, skills, and config once. Use them in every AI coding tool — securely, portably, forever.
```

New:
```markdown
# mcpctl

> Configure AI tools once. Enforce it everywhere. Audit everything.

The missing config layer for your AI coding tools.

mcpctl manages MCP servers, skills, and secrets from a single `~/.agents/` directory and syncs
them to every AI coding tool you use — with credentials in your OS keychain, never in plaintext
dotfiles.
```

**Step 2: Replace the "Three principles" section with audience-aware framing**

```markdown
## Why mcpctl

**For individual developers:** You've configured the same GitHub MCP server four times — once
for Claude Code, once for Cursor, once for Gemini CLI, once for Windsurf. The configs have
drifted. Your API key is in three different JSON files. `mcpctl init && mcpctl sync` fixes this
permanently.

**For teams:** When someone joins, they need an hour to configure their AI tools. When someone
leaves, their credentials to shared MCP servers linger in their local keychain. The team's MCP
servers accumulate — no one knows which are active or approved. mcpctl's team registry solves
all three.

**For security teams:** OWASP MCP Top 10 #1 is plaintext API keys in AI tool config files.
#9 is shadow MCP servers — deployments outside governance. mcpctl addresses both at the config
layer where they originate.
```

**Step 3: Add the competitive comparison table**

```markdown
## How mcpctl fits in

| What you need | Use |
|---|---|
| Config each developer's AI tools consistently | mcpctl (this tool) |
| Govern MCP traffic at runtime | Gateway layer (Runlayer, MintMCP) |
| AI model risk and data lineage | Governance layer (watsonx, Collibra) |

These layers are complementary. mcpctl is deployed first, at the developer config layer.
```

**Step 4: Update package.json description**

```json
{
  "description": "The missing config layer for AI coding tools — MCP servers, skills, and secrets managed once, synced everywhere"
}
```

**Step 5: Commit**

```bash
git add README.md package.json
git commit -m "docs: rewrite README with accurate competitive positioning"
```

---

### Task 3: Write the "why now" section

**Files:**
- Modify: `README.md`

**Step 1: Add a "Why now" section with market context**

```markdown
## Why now

MCP went from 100,000 to 8 million downloads in six months. Every major AI coding tool adopted
it by mid-2025. The standard has won — which means the configuration sprawl problem is now
universal.

At the same time:
- 70% of engineers use 2–4 AI coding tools simultaneously
- OWASP named plaintext MCP credentials their #1 risk (MCP01:2025)
- 88% of MCP servers require credentials; 53% store them in plaintext config files (Zuplo, 2025)
- Active exploitation of hardcoded MCP credentials was documented by Trend Micro (2025)

The ecosystem created the problem. mcpctl is the infrastructure layer it forgot to build.
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add why-now context to README"
```

---

### Task 4: Create a comparison page for developers evaluating alternatives

**Files:**
- Create: `docs/positioning/alternatives.md`

**Step 1: Write the alternatives doc**

```markdown
# mcpctl vs. Alternatives

## vs. agents CLI (amtiYo)

Both tools use `~/.agents/` as the canonical directory and sync to similar providers.

The key difference: **secrets management**.

agents CLI separates committed config (`agents.json`) from a gitignored secrets file
(`local.json`). This means secrets live in a plaintext file on disk — gitignored, but still
present, still included in filesystem backups, still readable by any process with local access.

mcpctl stores secrets in the OS keychain (macOS Keychain, Linux `pass`). No plaintext file exists.
`cat ~/.agents/mcp-config.json` is safe to share publicly.

## vs. Conductor

Conductor is the most polished GUI tool in this space. It has OS keychain integration and
Smithery registry support.

The key difference: **CLI vs. GUI**.

Conductor is a macOS desktop app. It has no CLI, no headless mode, and no CI/CD integration.
mcpctl is CLI-first, scriptable, and works on any machine including remote dev environments
and CI runners.

## vs. chezmoi + templates

chezmoi is a dotfiles manager. Some developers use it to solve the multi-tool MCP config
problem via `.tmpl` files and template facts for each provider format.

mcpctl is the purpose-built version of what chezmoi templates are trying to be for this use
case. No template authorship required — mcpctl's translation layer handles all provider
format differences automatically.

## vs. MCP gateways (Runlayer, MintMCP)

MCP gateways operate at the network layer — they govern runtime traffic between AI agents and
MCP servers. They are infrastructure tools deployed by platform/IT teams.

mcpctl operates at the configuration layer — it governs what each developer's machine has
configured, where credentials are stored, and how teams stay in sync.

These tools are complementary. A team using Runlayer for runtime governance still benefits
from mcpctl for developer-side configuration management.
```

**Step 2: Commit**

```bash
git add docs/positioning/alternatives.md
git commit -m "docs: add alternatives comparison document"
```

---

### Done

Positioning artifacts created:
- `docs/positioning/market-position.md` — the full market position document for internal reference and enterprise sales context
- `docs/positioning/alternatives.md` — head-to-head comparison for developers evaluating options
- `README.md` — updated hero, audience framing, competitive table, and why-now section
- `package.json` — updated description for npm/GitHub discovery

The narrative is consistent across all three audiences: individual dev, team/DevEx, and security/CISO.
