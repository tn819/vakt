# OWASP MCP Top 10 Compliance Mapping

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a comprehensive OWASP MCP Top 10 compliance mapping document that serves as a procurement checklist for enterprise buyers — mapping each of the 10 items to mcpctl's current capabilities or roadmap.

**Architecture:** Two output artifacts: (1) `docs/security/owasp-mcp-top10.md` — the detailed technical mapping; (2) a summary table suitable for embedding in the README and a future website landing page. No code changes required. Document-only.

**Tech Stack:** Markdown, OWASP MCP Top 10 (https://owasp.org/www-project-mcp-top-10/)

**Why this matters:**
- Lakera's OWASP LLM Top 10 mapping page drove enterprise procurement deals — the OWASP item numbers become a procurement checklist buyers hand to vendors
- No config-layer MCP tool has published this mapping yet
- Microsoft published OWASP MCP guidance for Azure; CSA announced an MCP Security Resource Center — the framework is being institutionalized
- Enterprise buyers arrive via "OWASP MCP" searches and discover mcpctl as the answer
- The 12-18 month window before platform vendors consolidate this space starts now

**Coverage key used throughout:**
- ✅ **Covered** — current functionality directly addresses this item
- 🔶 **Partial** — mcpctl reduces surface area but doesn't fully solve it
- 🗺️ **Roadmap** — planned for team/enterprise tier
- ⬜ **Out of scope** — runtime/network concern, not a config-layer problem

---

### Task 1: Create the security docs directory and mapping document skeleton

**Files:**
- Create: `docs/security/owasp-mcp-top10.md`

**Step 1: Create the directory**

```bash
mkdir -p docs/security
```

**Step 2: Create the file with the header and coverage summary table**

```markdown
# mcpctl and the OWASP MCP Top 10

The [OWASP MCP Top 10](https://owasp.org/www-project-mcp-top-10/) defines the ten most critical
security risks for systems built on the Model Context Protocol. This document maps each item to
mcpctl's current capabilities and roadmap.

## Coverage Summary

| # | Item | Coverage | mcpctl answer |
|---|------|----------|---------------|
| MCP01 | Token Mismanagement & Secret Exposure | ✅ Covered | Secrets in OS keychain, never in dotfiles |
| MCP02 | Privilege Escalation via Scope Creep | 🔶 Partial | Canonical scope definitions in config |
| MCP03 | Tool Poisoning | ⬜ Out of scope | Runtime concern; complement with gateway |
| MCP04 | Supply Chain Attacks & Dependency Tampering | 🗺️ Roadmap | Server version pinning + private registry |
| MCP05 | Command Injection & Execution | ⬜ Out of scope | Runtime concern; complement with gateway |
| MCP06 | Intent Flow Subversion | ⬜ Out of scope | Runtime concern; complement with gateway |
| MCP07 | Insufficient Authentication & Authorization | 🔶 Partial | Auth config standardization across tools |
| MCP08 | Lack of Audit and Telemetry | 🗺️ Roadmap | Config change audit trail (team tier) |
| MCP09 | Shadow MCP Servers | ✅ Covered | Canonical approved-server registry |
| MCP10 | Context Injection & Over-Sharing | ⬜ Out of scope | Runtime concern; complement with gateway |
```

**Step 3: Commit the skeleton**

```bash
git add docs/security/owasp-mcp-top10.md
git commit -m "docs: add OWASP MCP Top 10 mapping skeleton"
```

---

### Task 2: Write the MCP01 and MCP09 sections (the two ✅ Covered items)

**Files:**
- Modify: `docs/security/owasp-mcp-top10.md`

**Step 1: Write the MCP01 section**

```markdown
## MCP01:2025 — Token Mismanagement & Secret Exposure ✅ Covered

**The risk:** Hard-coded credentials, long-lived tokens, and secrets stored in model memory
expose systems to unauthorized access. MCP's stateful sessions mean a token stored in a config
file can be retrieved via prompt injection at any future point in the session.

**The industry default (unsafe):** Every AI coding tool guide instructs users to paste API keys
directly into `~/.cursor/mcp.json`, `~/.claude.json`, or `~/.gemini/settings.json`. These files
are swept into iCloud, Dropbox, dotfile repos, and screenshots. Trail of Bits documented this
in "Insecure credential storage plagues MCP" (April 2025). OWASP named it #1 for a reason.

**How mcpctl addresses it:**

mcpctl's `~/.agents/mcp-config.json` contains only named references — never values:

```json
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": { "GITHUB_TOKEN": "secret:GITHUB_TOKEN" }
  }
}
```

Secrets are resolved from the OS keychain (macOS Keychain, Linux `pass`) at sync time and
injected into each tool's config in memory. They are never written to `~/.agents/` in plaintext.

**Result:**
- `cat ~/.agents/mcp-config.json` — safe to run in public or share with teammates
- Dotfile repos, cloud sync, and screen shares expose zero credentials
- `mcpctl secrets set GITHUB_TOKEN ghp_...` stores the value in your OS keychain
- Revoking access means removing from keychain — not hunting for which dotfiles contain the value
```

**Step 2: Write the MCP09 section**

```markdown
## MCP09:2025 — Shadow MCP Servers ✅ Covered

**The risk:** Unapproved MCP server deployments operate outside formal security governance,
frequently using default credentials, permissive configurations, or unsecured APIs. Attackers
scan for and exploit these shadow instances. OWASP's mitigation recommendation: a centralized
registry where every MCP instance must be registered before deployment.

**The industry default (unsafe):** Each developer independently adds MCP servers to their local
tool configs. There is no org-level visibility into which servers are running, who deployed them,
or whether they've been approved. By definition: if your security team cannot list all active
MCP servers in your environment, shadow deployments already exist.

**How mcpctl addresses it:**

mcpctl's `~/.agents/mcp-config.json` is the single source of truth for which MCP servers are
configured. At the individual tier, this gives each developer a canonical list they manage
deliberately rather than accumulating ad-hoc. At the team tier (roadmap), the org-level
registry becomes the source of truth that individual configs are derived from — nothing runs
that isn't on the approved list.

**Team tier (roadmap):**
- Administrators define the org's approved MCP server registry
- `mcpctl sync` on a developer machine derives configs from the org registry
- Unapproved servers cannot be added without admin approval
- The org registry answers: "list every MCP server configured across our engineering team,
  with owner, version, and approval status"
```

**Step 3: Commit**

```bash
git add docs/security/owasp-mcp-top10.md
git commit -m "docs: add MCP01 and MCP09 coverage sections"
```

---

### Task 3: Write the Partial and Roadmap sections

**Files:**
- Modify: `docs/security/owasp-mcp-top10.md`

**Step 1: Write the MCP02, MCP07 sections (Partial)**

```markdown
## MCP02:2025 — Privilege Escalation via Scope Creep 🔶 Partial

**The risk:** Permissions expand over time without enforcement, allowing agents to perform
unintended actions including data exfiltration or repository modification.

**How mcpctl partially addresses it:** mcpctl's canonical config makes scope explicit and
version-controlled. Scope definitions don't silently drift across tool restarts or upgrades —
the config is the declaration of intent. What mcpctl does not provide is runtime enforcement
of scope boundaries; that requires a gateway layer.

**Complement with:** Runlayer, MintMCP, or another MCP gateway for runtime enforcement.

---

## MCP07:2025 — Insufficient Authentication & Authorization 🔶 Partial

**The risk:** MCP servers and agents fail to properly verify identities or enforce access
controls during interactions.

**How mcpctl partially addresses it:** mcpctl standardizes auth configuration across all AI
coding tools from a single config. Rather than configuring OAuth tokens or bearer credentials
differently in each tool (or forgetting to configure them at all), mcpctl ensures consistent
auth config is deployed everywhere. At the team tier (roadmap), auth configs can be centrally
managed with rotation policies.

**Complement with:** An identity-aware MCP gateway for server-side authz enforcement.
```

**Step 2: Write the MCP04, MCP08 sections (Roadmap)**

```markdown
## MCP04:2025 — Supply Chain Attacks & Dependency Tampering 🗺️ Roadmap

**The risk:** Compromised dependencies in MCP ecosystems can alter agent behavior or introduce
execution-level backdoors. With 13,000+ MCP servers launched in 2025 alone, developers integrate
third-party servers faster than security teams can catalog them.

**Roadmap:** Server version pinning (lock `@modelcontextprotocol/server-github@1.2.3`, not
`@latest`) and a private registry for org-vetted server versions. Config changes that introduce
new servers or version changes trigger an approval step in the team tier.

---

## MCP08:2025 — Lack of Audit and Telemetry 🗺️ Roadmap

**The risk:** Limited logging impedes incident investigation and response. Regulators and auditors
(EU AI Act, SOC 2, ISO 27001) now require audit trails of AI tool access.

**Roadmap:** Every config change, server addition, secret access, and sync operation logged with
attribution (who, what, when, from which machine). Audit log export for SIEM integration. This
is a team/enterprise tier feature — individual CLI logs locally; the team tier centralizes and
retains.
```

**Step 3: Write the Out of Scope sections**

```markdown
## MCP03, MCP05, MCP06, MCP10 — Runtime Concerns ⬜ Out of Scope

These items (Tool Poisoning, Command Injection, Intent Flow Subversion, Context Injection) are
runtime security concerns — they occur during agent execution, not during configuration.

mcpctl is a configuration-layer tool. It does not inspect or intercept live MCP traffic.

**Recommended complementary tools for runtime protection:**
- [Zenity](https://zenity.io) — agent security monitoring and threat detection
- [Lasso Security](https://lasso.security) — MCP gateway with security plugin
- [Runlayer](https://runlayer.com) — centralized MCP server registry with threat detection

mcpctl and these tools are complementary, not competitive. mcpctl governs what gets configured;
gateway tools govern what runs.
```

**Step 4: Commit**

```bash
git add docs/security/owasp-mcp-top10.md
git commit -m "docs: complete all OWASP MCP Top 10 sections"
```

---

### Task 4: Add the README security section

**Files:**
- Modify: `README.md`

**Step 1: Add OWASP reference to the existing security section in README**

After the existing threat model table, add:

```markdown
### OWASP MCP Top 10

mcpctl directly addresses the top-priority items from the
[OWASP MCP Top 10](https://owasp.org/www-project-mcp-top-10/):

| Item | Coverage |
|------|----------|
| MCP01 — Token Mismanagement & Secret Exposure | ✅ Covered — OS keychain, no plaintext |
| MCP09 — Shadow MCP Servers | ✅ Covered — canonical approved-server registry |
| MCP08 — Lack of Audit and Telemetry | 🗺️ Team tier |
| MCP02 — Privilege Escalation via Scope Creep | 🔶 Partial — explicit config declarations |

Full mapping: [docs/security/owasp-mcp-top10.md](docs/security/owasp-mcp-top10.md)
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add OWASP MCP Top 10 coverage table to README"
```

---

### Done

Two artifacts exist:
1. `docs/security/owasp-mcp-top10.md` — full technical mapping, suitable for enterprise procurement review
2. README summary table — visible to any developer landing on the repo

Enterprise buyers can reference the OWASP item numbers directly. Security teams can hand `owasp-mcp-top10.md` to their auditors as evidence of security posture.
