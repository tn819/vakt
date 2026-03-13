# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for vakt.

An ADR documents a significant architectural decision: the context that drove it, the decision made, the alternatives considered, and the consequences. ADRs are immutable logs — when a decision is reversed or superseded, a new ADR is added rather than editing the old one.

## Format

We use a lightweight hybrid of [Michael Nygard's format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) and [MADR](https://adr.github.io/madr/).

```text
NNNN-kebab-case-title.md
```

Each ADR contains:

| Section | Description |
|---------|-------------|
| **Title** | Short noun phrase — what was decided |
| **Date** | YYYY-MM-DD of the decision |
| **Status** | `Proposed` → `Accepted` → `Deprecated` / `Superseded by [NNNN](link)` |
| **Context** | The forces at play — why a decision was needed |
| **Decision** | What we chose and the core reasoning |
| **Alternatives Considered** | Other options evaluated and why they were not chosen |
| **Consequences** | What becomes easier, harder, or needs monitoring |

## Statuses

| Status | Meaning |
|--------|---------|
| `Proposed` | Under discussion, not yet in effect |
| `Accepted` | Decision is in effect |
| `Deprecated` | No longer relevant (e.g. feature removed) |
| `Superseded by [NNNN](./NNNN-*.md)` | Replaced by a newer ADR — link to the replacement |

## Creating a new ADR

1. Copy `template.md` to the next number: `cp template.md 000N-your-title.md`
2. Fill in all sections — leave none blank
3. Set status to `Proposed`
4. Open a PR; status moves to `Accepted` on merge

## Index

| # | Title | Status |
|---|-------|--------|
| [0001](./0001-use-adr-for-architectural-decisions.md) | Use ADR for architectural decisions | Accepted |
| [0002](./0002-model-router.md) | Model router: OpenAI-compatible local proxy for multi-backend LLM routing | Accepted |
