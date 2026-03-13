---
status: accepted
date: 2026-03-13
---

# 0001 — Use ADR for architectural decisions

## Context

vakt is growing from a sync-and-policy tool into a control plane for AI coding agents. Decisions made today — how to intercept tool calls, where to enforce policy, how to route model completions — will shape the architecture for a long time. Without a lightweight record of *why* those decisions were made, future contributors (including the original authors, six months later) have no way to distinguish deliberate choices from accidents.

We need a record-keeping convention that is low-friction enough to actually be used, lives in the repository, and survives team changes.

## Decision

We will use Architecture Decision Records (ADRs) stored in `docs/adr/`, following a lightweight hybrid of Michael Nygard's format and MADR conventions. Each significant architectural decision gets one numbered Markdown file. Decisions are immutable — superseding a decision produces a new ADR, not an edit.

"Significant" means: a decision that would be surprising or non-obvious to a new contributor, that involves real trade-offs between alternatives, or that would be costly to reverse.

## Alternatives Considered

### No formal process — rely on commit messages and PR descriptions

Commit messages capture *what* changed; they rarely capture *why* alternatives were rejected. PR descriptions are buried in GitHub and not co-located with the code. This approach fails over time as team membership changes and context is lost.

**Why not chosen:** Too easy to omit reasoning; no structured way to mark decisions as superseded.

### Full architectural documentation wiki (Confluence, Notion, etc.)

Rich tooling, good for prose documentation. But external to the repository — docs drift from code, links rot, and there's no guarantee it's consulted alongside code review.

**Why not chosen:** Out-of-band from the codebase; adds external dependency; higher maintenance overhead.

### RFC process (Google Docs / GitHub Discussions)

Good for large teams debating proposals before implementation. Adds significant overhead (template, circulation, formal sign-off) for a small, fast-moving project.

**Why not chosen:** Overhead disproportionate to team size; decisions we need to record are often already made.

## Consequences

**Positive:**

- Future contributors can understand *why* the system is shaped the way it is
- Superseding a decision is explicit — the old record remains, new one links to it
- Low friction: one file per decision, no external tooling required

**Negative / trade-offs:**

- Discipline required to actually write the ADR; easy to skip under time pressure
- ADRs can become stale if not updated to `Deprecated`/`Superseded` when relevant

**Neutral / to monitor:**

- Decide on threshold for "significant enough to warrant an ADR" — err on the side of writing one; cheap to add, expensive to reconstruct
