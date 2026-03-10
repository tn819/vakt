# IT Admin Console: Non-Developer Path

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Design the enterprise web console that allows IT/security teams to govern AI tool access for all users — including non-technical business users — without requiring anyone to touch a CLI or edit JSON files.

**Architecture:** The admin console is a web application that sits on top of the team tier registry API. IT admins govern the org's approved MCP server list, manage team access, view audit logs, and configure AI capabilities for non-developer users (who consume these capabilities through Claude Desktop or similar tools). Business users never see the console — they see AI capabilities surfaced in their tools, pre-configured by IT.

**Tech Stack:** Web app (framework TBD — React or similar), REST API (the same API defined in the team tier design), existing `~/.agents/` schema with org layer. Authentication via SSO (SAML/OIDC via Okta, Azure AD, Google Workspace).

**Why the non-developer path runs through IT:**

Research finding: non-technical users (HR, finance, ops) are beginning to use MCP-connected AI tools (Claude Desktop, Claude Cowork). Their compliance/audit requirements are what force the enterprise purchase — but they never interact with the CLI. The web console is the IT/security surface; business users consume the output (configured AI capabilities) through their existing tools.

The non-developer user never runs `mcpctl`. They get AI tools pre-configured by IT, the same way they get their laptop pre-configured — they just use it.

**Buyers this unlocks:**

- CISO — audit logs, policy enforcement, shadow MCP visibility
- Platform Engineering Lead — fleet-wide visibility, automated onboarding/offboarding
- CTO/VP Eng — strategic AI tooling platform
- GRC/Compliance — SOC 2, EU AI Act, ISO 27001 attestation artifacts

---

### Task 1: Define the admin console personas and jobs-to-be-done

**Files:**
- Create: `docs/admin-console/personas.md`

**Step 1: Write the personas document**

```markdown
# Admin Console Personas

## Primary Persona: IT/Platform Engineering Lead (daily operator)

**Who they are:** The person responsible for maintaining AI tooling across the engineering org.
May have a title like "Platform Engineer," "DevEx Lead," or "Developer Tooling." Technical.
Comes to the console 2–3x per week. Uses it to onboard new hires, approve new MCP servers,
and check fleet health.

**Jobs to be done:**
1. Generate an invite token for a new hire → they run `mcpctl join` and get everything
2. Approve a new MCP server requested by the team → add to org registry
3. Remove a departing employee → revoke access, see rotation recommendations
4. See which machines haven't synced recently → identify config drift
5. Add an MCP server for non-developer users (Claude Desktop) → configure without CLI

---

## Secondary Persona: CISO / Security Lead (weekly/monthly, audit-driven)

**Who they are:** Responsible for security posture. May not be highly technical. Comes to the
console to run audits, review the approved server list, export evidence for compliance reviews.

**Jobs to be done:**
1. See every approved MCP server with its approval history and approver identity
2. Export an audit log for a date range (for SOC 2 auditor)
3. Verify that no unapproved servers are in use (shadow MCP visibility)
4. Review which users have access to which secrets/credentials
5. Enforce a policy change org-wide (block a category of servers)

---

## Tertiary Persona: Non-technical business user (never touches the console)

**Who they are:** HR manager, finance analyst, operations coordinator using Claude Desktop with
MCP connections to Salesforce, HR systems, or internal databases. Has no idea what MCP is.

**Their experience:** IT pre-configures their Claude Desktop with the approved MCP servers for
their role. They see their AI assistant can access Salesforce. They never run a CLI command or
edit a config file. The console is the IT admin's surface; they are the beneficiary.

**What IT configures for them:**
- Which MCP servers their Claude Desktop instance is allowed to connect to
- Which service account credentials are injected (never exposed to the user)
- Role-based tool access: Finance gets the ERP MCP, HR gets the HRIS MCP
```

**Step 2: Commit**

```bash
git add docs/admin-console/personas.md
git commit -m "docs: define admin console personas and jobs-to-be-done"
```

---

### Task 2: Design the MCP server registry UI

**Files:**
- Create: `docs/admin-console/screens/server-registry.md`

**Step 1: Write the screen spec**

```markdown
# Screen: Server Registry

## URL: /admin/servers

## What it shows

A table of every MCP server in the org registry:

| Server name | Package | Version | Status | Approved by | Approved date | Actions |
|-------------|---------|---------|--------|-------------|---------------|---------|
| github | @modelcontextprotocol/server-github | 1.2.3 | ✅ Approved | alice@acme.com | 2026-01-15 | Edit / Remove |
| postgres | @modelcontextprotocol/server-postgres | 0.6.0 | ⏳ Pending | — | — | Approve / Reject |
| internal-crm | acme/mcp-crm | 2.1.0 | ✅ Approved | bob@acme.com | 2026-02-01 | Edit / Remove |

## Actions

**Add server** button → modal with fields:
- Package name or git URL
- Version (pinned, required)
- Display name
- Description
- Required secrets (named references only, no values)
- Assignable to: [Engineering / Finance / HR / All roles]

**Approve / Reject** — pending servers submitted by developers awaiting admin sign-off

**Edit** — change version, description, or role assignment; creates an audit log entry

**Remove** — marks as deactivated; next `mcpctl sync` on member machines removes the server

## Policy banner

At the top: current policy for unlisted servers:
🔴 "Unlisted servers are blocked — members cannot add unapproved servers"
🟡 "Unlisted servers are allowed with warning — members see a caution flag"
🟢 "Unlisted servers are allowed — no restriction"

Change policy → confirmation dialog with impact estimate ("affects 47 members")

## Empty state

"No MCP servers configured yet. Add your first server or import from a member's existing config."
```

**Step 2: Commit**

```bash
git add docs/admin-console/screens/server-registry.md
git commit -m "docs: spec server registry admin screen"
```

---

### Task 3: Design the audit log screen

**Files:**
- Create: `docs/admin-console/screens/audit-log.md`

**Step 1: Write the screen spec**

```markdown
# Screen: Audit Log

## URL: /admin/activity

## What it shows

Chronological log of every config change, secret access, sync event, and policy change:

| Timestamp | Actor | Event type | Target | Details |
|-----------|-------|-----------|--------|---------|
| 2026-03-10 14:23 | alice@acme.com | server.approved | github | Version 1.2.3 |
| 2026-03-10 14:01 | system | member.synced | bob@acme.com | 12 servers, machine: MacBook-Pro |
| 2026-03-09 09:15 | carol@acme.com | server.requested | slack-mcp | Pending approval |
| 2026-03-09 09:00 | admin@acme.com | member.offboarded | dave@acme.com | Access revoked |
| 2026-03-08 16:45 | system | secret.rotated | GITHUB_ORG_TOKEN | Rotated by alice@acme.com |

## Event types logged

- `server.added` / `server.approved` / `server.rejected` / `server.removed`
- `member.joined` / `member.offboarded` / `member.synced`
- `secret.created` / `secret.rotated` / `secret.accessed` / `secret.deleted`
- `policy.changed` — who changed what policy, before and after value
- `invite.generated` / `invite.used` / `invite.expired`

## Filters

- Date range picker (default: last 30 days)
- Actor filter (search by email)
- Event type filter (multi-select)
- Export button → CSV or JSON for auditor delivery

## SOC 2 export

"Export for SOC 2 audit" button → generates a structured report covering the
requested time period, formatted for auditor consumption.

## Retention

Audit logs are retained for 12 months by default. Enterprise tier: configurable retention
up to 7 years for regulatory requirements.
```

**Step 2: Commit**

```bash
git add docs/admin-console/screens/audit-log.md
git commit -m "docs: spec audit log admin screen"
```

---

### Task 4: Design the member management and non-developer provisioning screens

**Files:**
- Create: `docs/admin-console/screens/members.md`

**Step 1: Write the screen spec**

```markdown
# Screen: Member Management

## URL: /admin/members

## Developer members table

| Name | Email | Role | Last sync | Active servers | Status | Actions |
|------|-------|------|-----------|----------------|--------|---------|
| Alice | alice@acme.com | Admin | 2 min ago | 12 | ✅ Current | — |
| Bob | bob@acme.com | Member | 3 days ago | 8 | ⚠️ Outdated | Nudge |
| Carol | carol@acme.com | Member | Never | 0 | ❌ Not configured | Resend invite |

**Outdated** = member's config is >2 versions behind the registry
**Not configured** = member has the CLI installed but hasn't run `mcpctl join`

**Actions:**
- Invite member → generates a single-use invite token, copyable link to share
- Resend invite → regenerates token (previous token expires)
- Remove member → revokes session token; next sync fails; logs offboarding event
- Change role → Admin / Member / Read-only

## Non-developer users (new section)

Business users who use Claude Desktop or similar tools — no CLI required.

| Name | Email | Department | AI tools | Assigned MCP servers | Last active |
|------|-------|-----------|---------|----------------------|-------------|
| Dave | dave@acme.com | Finance | Claude Desktop | finance-erp, pdf-reader | Yesterday |
| Eve | eve@acme.com | HR | Claude Desktop | hris-connector | 1 week ago |

**Adding a non-developer user:**
1. Admin enters email + department
2. Selects which MCP servers to assign (filtered by role-appropriate servers)
3. System generates a Claude Desktop extension config
4. Admin shares the config with the user (or pushes via MDM)
5. User installs the extension — their Claude Desktop now has the assigned tools

The user never runs a CLI. The admin console is the configuration surface.

## Offboarding flow

When admin clicks "Remove member":
1. Session token revoked immediately
2. Audit log entry created
3. List of team secrets the member had access to shown
4. Admin prompted: "Rotate these credentials? (recommended)"
5. Rotation is optional but logged either way
```

**Step 2: Commit**

```bash
git add docs/admin-console/screens/members.md
git commit -m "docs: spec member management and non-developer provisioning screens"
```

---

### Task 5: Define the SSO integration and enterprise auth requirements

**Files:**
- Create: `docs/admin-console/auth.md`

**Step 1: Write the auth requirements document**

```markdown
# Authentication & SSO

## Individual / Team tier

Email + password with TOTP. Session tokens stored in OS keychain on developer machines.

## Enterprise tier

SSO via SAML 2.0 / OIDC. Integrates with:
- Okta
- Microsoft Azure Active Directory / Entra ID
- Google Workspace
- Any SAML 2.0 or OIDC-compliant IdP

**SCIM provisioning** — members automatically added/removed when HR updates the IdP:
- New hire added to IdP → mcpctl org membership created → invite token sent
- Employee terminated in IdP → mcpctl session revoked → offboarding flow triggered

This means: a departing employee's AI tool access is revoked as part of standard HR offboarding,
with no manual action required from the IT admin.

## Permissions model

| Role | What they can do |
|------|-----------------|
| Owner (1 per org) | Everything, including billing and org deletion |
| Admin | Add/remove members, approve servers, rotate secrets, export audit logs |
| Member | Use CLI to sync approved servers; request new servers (pending admin approval) |
| Read-only | View dashboard and audit log; no write access |
| Non-developer | No console access; receives pre-configured AI capabilities |

## Session management

Developer CLI sessions: scoped to the org, stored in OS keychain, expire after 90 days.
Re-authentication triggers a new `mcpctl join` flow (invite not required for re-auth).

Admin console sessions: scoped to the web app, expire after 8 hours idle.
SSO sessions follow the IdP's session policy.
```

**Step 2: Commit**

```bash
git add docs/admin-console/auth.md
git commit -m "docs: define SSO and enterprise auth requirements"
```

---

### Task 6: Define the compliance and certification roadmap

**Files:**
- Create: `docs/admin-console/compliance.md`

**Step 1: Write the compliance document**

```markdown
# Compliance and Certifications

## SOC 2 Type II

Target: 12 months post-enterprise tier launch.

Controls to demonstrate:
- CC6.1 — Logical access controls (RBAC, SSO, MFA)
- CC6.2 — Access provisioning and deprovisioning (SCIM onboarding/offboarding)
- CC6.3 — Access removal (offboarding audit trail)
- CC7.2 — System monitoring (audit logs)
- CC8.1 — Change management (server approval workflow with audit trail)

The audit log screen (all events, exportable) is the primary evidence artifact.

## EU AI Act

High-risk system rules effective August 2026.

mcpctl's compliance value for EU AI Act:
- Demonstrates "human oversight" of which AI tools access which data (server registry)
- Provides audit trail of AI agent actions (MCP invocations logged)
- Enables risk classification per MCP server (admin console tags each server's risk level)

## ISO/IEC 42001 (AI Management System)

Relevant controls:
- 6.1 — Risk assessment: server registry with approval status = documented risk assessment
- 9.1 — Monitoring: audit log = evidence of ongoing monitoring
- 10.2 — Nonconformity: offboarding flow with rotation recommendation = corrective action

## HIPAA (healthcare vertical)

For customers in healthcare, mcpctl must ensure:
- No PHI passes through config files (it shouldn't — MCP configs contain endpoints, not data)
- Audit logs include user identity for access control evidence
- Business Associate Agreement (BAA) available for enterprise tier

## FedRAMP (government vertical)

FedRAMP Moderate authorization: 18-24 month roadmap item.
Requires self-hosted deployment option (included in enterprise tier) and FedRAMP-authorized
infrastructure for the hosted registry.
```

**Step 2: Commit**

```bash
git add docs/admin-console/compliance.md
git commit -m "docs: define compliance certification roadmap"
```

---

### Done

The IT admin console design is fully documented across six artifacts:

- `docs/admin-console/personas.md` — who uses the console and what they need
- `docs/admin-console/screens/server-registry.md` — MCP server approval and policy enforcement
- `docs/admin-console/screens/audit-log.md` — compliance evidence and SIEM integration
- `docs/admin-console/screens/members.md` — onboarding, offboarding, and non-developer provisioning
- `docs/admin-console/auth.md` — SSO, SCIM, and enterprise session management
- `docs/admin-console/compliance.md` — SOC 2, EU AI Act, ISO 42001, HIPAA, FedRAMP roadmap

The non-developer path is fully designed: IT admins provision AI capabilities for business users through the console; business users receive pre-configured tools and never touch a CLI. The CISO gets audit logs and OWASP MCP coverage evidence. The Platform Engineering Lead gets fleet visibility and automated onboarding/offboarding.

**Next step:** Implement the team tier server and registry API (prerequisite for the admin console), then build the web app on top of it.
