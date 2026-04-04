# Architecture Decision Records — Index

**Repository:** `AbuAli85/smartpro-hub1`  
**Maintained by:** SmartPRO Hub Engineering  
**Last updated:** 4 April 2026

---

## What is an ADR?

An Architecture Decision Record (ADR) is a short document that captures a significant technical decision made during the development of SmartPRO Hub. Each ADR records the context that made the decision necessary, the decision itself, the rationale behind it, and the consequences — both positive and negative.

ADRs are immutable once accepted. They are never deleted or rewritten. If a decision is reversed or superseded, a new ADR is created with a reference back to the original.

---

## ADR Lifecycle

| Status | Meaning |
|--------|---------|
| **Proposed** | Under discussion — not yet decided |
| **Accepted** | Decision made and in effect |
| **Deprecated** | Still in effect but being phased out |
| **Superseded** | Replaced by a newer ADR (linked) |

---

## ADR Registry

| ID | Title | Status | Date | Area | Related Issues |
|----|-------|--------|------|------|----------------|
| [ADR-001](./ADR-001-rbac-phase1-ui-interpretation-layer.md) | RBAC Phase 1 — UI Interpretation Layer Without Schema Migration | **Accepted** | 4 Apr 2026 | Access Control | [#2](https://github.com/AbuAli85/smartpro-hub1/issues/2), [#3](https://github.com/AbuAli85/smartpro-hub1/issues/3) |

---

## How to Add a New ADR

1. Copy the template below into a new file: `docs/adr/ADR-NNN-short-title.md`
2. Use the next sequential number for `NNN`
3. Fill in all sections — do not leave any blank
4. Add a row to the registry table above
5. Commit both files in the same commit

### ADR Template

```markdown
# ADR-NNN: [Short Title]

**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-NNN
**Date:** DD Month YYYY
**Deciders:** [Team or individuals]
**Technical Area:** [e.g., Access Control, Database, API, Frontend]
**Document Reference:** SMARTPRO-ADR-NNN

---

## Context

[What situation or problem made this decision necessary?]

---

## Decision

[What was decided?]

---

## Rationale

[Why was this option chosen over alternatives?]

---

## Consequences

### Positive
[What improves as a result?]

### Negative / Trade-offs
[What gets worse or more complex?]

---

## Alternatives Considered

[What other options were evaluated and why were they rejected?]

---

## Related Documents

| Document | Path |
|----------|------|
| | |
```

---

## Naming Convention

Files must follow the pattern: `ADR-NNN-kebab-case-title.md`

- `NNN` is zero-padded to three digits: `001`, `002`, `010`, `100`
- Title is lowercase kebab-case: `rbac-phase1-ui-interpretation-layer`
- No spaces, no special characters other than hyphens

---

*For questions about the ADR process, refer to the project README or open a discussion on GitHub.*
