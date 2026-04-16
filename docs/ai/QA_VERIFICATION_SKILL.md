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
- typecheck (`pnpm check`) and tests (`pnpm test`) run or gaps stated
- **do not claim “lint passed”** unless a real lint command was run for the touched code — there is **no root `lint` script** in `package.json`; say exactly what ran
- tests added or updated
- translations handled
- no hidden regressions in adjacent modules

## Required output

- What was tested automatically (name commands: e.g. `pnpm check`, `pnpm test` — not vague “lint” unless lint actually ran)
- What was tested manually
- What was not verified
- Residual risks
- Final readiness verdict

For substantive work, align the write-up with `FINAL_REPORT_TEMPLATE.md`.
