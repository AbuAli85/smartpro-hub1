# Feature Gate Skill

Use this before implementing any new feature, screen, workflow, table, abstraction, or major UI change.

## Goal

Decide whether the proposed work is actually needed, and what the minimum safe implementation should be.

## Required questions

1. What exact business or operational problem does this solve?
2. Which users / roles are affected?
3. Does the current system already solve this fully or partially?
4. What is the smallest change that fully solves the problem?
5. What complexity or maintenance burden would this add?
6. Does this belong inside an existing module rather than a new one?
7. Is this blocked by missing foundations such as auth, RBAC, data model, audit, or workflow design?

## Decision outcomes

Choose one:

- Not needed; existing capability should be used or adjusted
- Needed; implement within an existing module
- Needed; requires a new module
- Needed; but blocked by foundational work that must happen first

## Required output

- Recommendation
- Rationale
- Scope
- Non-scope
- Acceptance criteria
- Risks if implemented incorrectly

## Rule

Do not write code during this review unless explicitly instructed afterward.
