# Final report template

Use this structure for substantive tasks (features, fixes, refactors that touch behavior). Keeps handoffs and AI outputs consistent. Repo commands: see `REPO_CONTEXT.md`.

---

## 1. Task status

e.g. In progress / Blocked / Complete — brief note.

## 2. Problem summary

What was wrong or what was requested, in plain language.

## 3. Findings

What you discovered tracing the flow (routes, APIs, data, edge cases).

## 4. Root cause

Why it failed or what gap existed (not symptoms only).

## 5. Plan

What you changed and at which layers (client / tRPC / DB / shared).

## 6. Implementation

- Files touched (bullet list or table)
- Schema/API changes (yes/no; summarize)

## 7. Verification

- **Commands run:** e.g. `pnpm check`, `pnpm test` — list each. Do **not** claim “lint passed” unless a real linter was run; this repo has no root `lint` script.
- **Manual QA:** what you exercised (roles, tenant, error paths).
- **Not verified:** explicit gaps.

## 8. Tests

- Added/updated tests (paths)
- Or: why none were added (with risk note)

## 9. Residual risks

Known limitations, follow-ups, or monitoring needs.

## 10. Completion verdict

Merge-ready / needs more work — one sentence why.
