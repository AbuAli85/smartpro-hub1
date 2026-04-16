# End-to-End Implementation Skill

Use this for any feature, workflow, or significant fix.

## Working model

Treat every request as a workflow, not as a component task.

Map the full path before coding:

user intent
-> route / page
-> state / hooks
-> API contract
-> server rules
-> database / persistence
-> audit / notifications / reporting
-> test coverage

## Required pre-code output

1. Business objective
2. Roles affected
3. Current behavior
4. Gaps
5. Proposed design
6. Acceptance criteria
7. File-by-file plan

## Implementation rules

- Prefer server authority before client polish
- Maintain tenant isolation
- Add boundary validation
- Use existing patterns when possible
- Add audit trail for business-critical actions
- Support loading / empty / error states if user-facing
- Support i18n for user-facing strings
- Keep the scope minimal and complete

## Completion rules

The task is not complete unless:

- the real entry point works
- the data persists correctly
- permissions are correct
- role-based behavior is checked
- regressions were reviewed
- tests were updated appropriately
- the final report is provided
