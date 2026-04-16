# SmartPRO AI Playbook

Start here when using Claude, Cursor, Manus, or similar tools in this repository.

This folder defines the default operating system for AI-assisted work in `smartpro-hub1`. The goal is disciplined, end-to-end execution with honest verification and consistent reporting.

---

## Order of use

### 1. Start with task framing
Use `TASK_INTAKE_TEMPLATE.md` to structure the request at the beginning of work.

Use it to clarify:
- task type
- business goal
- affected roles
- likely areas
- acceptance criteria
- what is not in scope

This frames the **what and why**.

---

### 2. Review the operating rules
Read `AI_OPERATING_SYSTEM.md`.

This is the global contract for all AI tools:
- core principles
- mandatory pre-implementation checklist
- required phases
- definition of complete
- forbidden behavior

This controls **engineering discipline**.

---

### 3. Ground yourself in the real repo
Read `REPO_CONTEXT.md`.

This explains the actual repo setup:
- commands
- entry points
- API layout
- DB/migrations
- test setup
- auth/RBAC pointers
- audit patterns
- i18n locations
- high-risk domains
- PR checklist

This prevents invented assumptions.

---

## Choose the right skill for the task

### For bugs or "not working"
Use:
1. `BUG_TRIAGE_SKILL.md`
2. `END_TO_END_IMPLEMENTATION_SKILL.md`
3. `QA_VERIFICATION_SKILL.md`
4. `FINAL_REPORT_TEMPLATE.md`

### For new features or workflow additions
Use:
1. `FEATURE_GATE_SKILL.md`
2. `END_TO_END_IMPLEMENTATION_SKILL.md`
3. `QA_VERIFICATION_SKILL.md`
4. `FINAL_REPORT_TEMPLATE.md`

### For code / architecture / PR review
Use:
1. `CODE_REVIEW_SKILL.md`
2. `REPO_CONTEXT.md`
3. `FINAL_REPORT_TEMPLATE.md` when a substantive review summary is needed

---

## Tool-specific prompts

### Cursor
Use `CURSOR_MASTER_PROMPT.md`

### Claude
Use `CLAUDE_MASTER_PROMPT.md`

### Manus
Use `MANUS_MASTER_PROMPT.md`

These prompts do not replace the skill docs. They should be used together with them.

---

## Required lifecycle

Every substantive task should follow this line:

1. Intake
2. Pre-code checklist
3. Discovery / diagnosis
4. Plan
5. Implementation
6. Verification
7. Final report

---

## Reporting rules

For substantive work, close with `FINAL_REPORT_TEMPLATE.md`.

Important:
- name the commands actually run
- do not claim "lint passed" unless a real lint command was run
- prefer explicit reporting such as `pnpm check` and `pnpm test`

---

## Domain guardrails

Read `SMARTPRO_DOMAIN_GUARDRAILS.md` whenever work touches:
- multi-tenant access
- RBAC / membership
- attendance
- payroll
- compliance
- contracts
- audit trails
- localized UI

---

## Minimal default recipe

If unsure, use this default sequence:

### Bug
- `TASK_INTAKE_TEMPLATE.md`
- `AI_OPERATING_SYSTEM.md`
- `REPO_CONTEXT.md`
- `BUG_TRIAGE_SKILL.md`
- `END_TO_END_IMPLEMENTATION_SKILL.md`
- `QA_VERIFICATION_SKILL.md`
- `FINAL_REPORT_TEMPLATE.md`

### Feature
- `TASK_INTAKE_TEMPLATE.md`
- `AI_OPERATING_SYSTEM.md`
- `REPO_CONTEXT.md`
- `FEATURE_GATE_SKILL.md`
- `END_TO_END_IMPLEMENTATION_SKILL.md`
- `QA_VERIFICATION_SKILL.md`
- `FINAL_REPORT_TEMPLATE.md`

### Review
- `TASK_INTAKE_TEMPLATE.md`
- `AI_OPERATING_SYSTEM.md`
- `REPO_CONTEXT.md`
- `CODE_REVIEW_SKILL.md`

---

## Expected outcome

AI tools working with this playbook should:
- avoid task jumping
- avoid speculative features
- fix root causes
- respect tenant/RBAC boundaries
- report honestly
- complete work end-to-end
