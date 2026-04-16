# Bug Triage Skill

Use this when debugging anything reported as broken, incorrect, inconsistent, missing, or not working.

## Mandatory output structure

1. Task status
2. Bug summary
3. Affected roles
4. Affected pages / APIs / data
5. Investigation findings
6. Root cause
7. Fix plan
8. Implementation summary
9. Verification performed
10. Tests added / updated
11. Risks / follow-ups
12. Completion verdict

## Mandatory investigation steps

- Identify the user-visible symptom
- Identify the expected behavior
- Trace the affected flow end-to-end:
  - route / page
  - UI state / hooks
  - API client
  - server handler / router
  - service / domain logic
  - schema / table / enum
  - audit / logging
  - tests

## Root-cause checks

Always check whether the issue is caused by:

- missing permission or wrong role handling
- bad tenant scoping
- stale derived state
- server/client contract mismatch
- schema / enum drift
- broken status transitions
- missing transactionality
- missing audit/logging
- translation key mismatch
- duplicated logic in different layers

## Rules

- Do not patch only the visible symptom unless confirmed sufficient.
- Do not add unrelated improvements.
- Do not change architecture broadly unless the current structure makes a correct fix impossible.
- State clearly what was verified and what was not.
