# QA Verification Skill

Use this after implementation and before claiming a task is complete.

## Verification checklist

### Functional
- happy path works
- failure path works
- empty state works
- loading state works
- edge cases reviewed

### Role / authority
- correct role can access
- wrong role cannot access
- tenant boundaries hold
- UI does not expose forbidden actions
- server rejects invalid actions

### Data
- state transitions are correct
- persistence is correct
- no duplicate records or stale derived state
- audit/logging occurs where expected

### UX
- status labels are accurate
- navigation path is coherent
- actions are not duplicated
- feedback / errors are understandable

### Quality
- lint / typecheck implications considered
- tests added or updated
- translations handled
- no hidden regressions in adjacent modules

## Required output

- What was tested automatically
- What was tested manually
- What was not verified
- Residual risks
- Final readiness verdict
