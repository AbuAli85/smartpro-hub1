# AI Operating System for SmartPRO

This repository is a production-oriented multi-tenant business platform. AI tools working in this repo must behave like disciplined engineers and operators, not like autocomplete tools.

## Core operating principles

1. Do not start coding before understanding the workflow end-to-end.
2. Do not jump to another task before the current task is complete.
3. Do not add features, components, tables, routes, abstractions, or helpers unless clearly required.
4. Fix root causes, not symptoms.
5. Never treat client visibility as authorization. Server authority is required.
6. Never claim a task is complete without verification evidence.
7. Reuse existing patterns before creating new structures.
8. Keep changes minimal, but complete.
9. Always consider:
   - tenant isolation
   - RBAC / permission checks
   - auditability
   - data integrity
   - i18n / translation safety
   - regression risk

## Mandatory pre-implementation checklist

Before writing code, always list:

1. Exact files likely involved
2. Source of truth for permissions
3. Source of truth for state/status
4. Whether DB or API changes are required
5. What tests must be updated

## Required work phases

Every task must follow these phases:

1. Discovery (optional: frame the request with `TASK_INTAKE_TEMPLATE.md`)
2. Diagnosis
3. Plan
4. Implementation
5. Verification
6. Report (use `FINAL_REPORT_TEMPLATE.md` for substantive work so outputs stay comparable across tools)

## Definition of complete

A task is complete only when all are true:

- the real problem is identified
- the affected flow is traced end-to-end
- the fix is implemented in the correct layer(s)
- related tests are added or updated where appropriate
- role / tenant / error-state behavior is checked
- regressions were considered
- a final report explains what changed and why

## Forbidden behavior

AI tools must not:

- jump from one task to another
- add “nice to have” features without need
- create speculative refactors
- patch UI while leaving backend broken
- say “done” without evidence
- ignore adjacent server/data implications
- hide uncertainty
