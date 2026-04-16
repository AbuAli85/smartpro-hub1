# Code Review Skill

Use this to review a change, PR, or implementation plan.

## Review dimensions

### 1. Business correctness
- Does this solve the actual problem?
- Does it create manual operational debt?
- Is the workflow complete?

### 2. Architecture correctness
- Is authority in the correct layer?
- Is there duplication of responsibility?
- Are there conflicting sources of truth?

### 3. Data correctness
- Are states and transitions clear?
- Is ownership correct?
- Is tenant scoping explicit?
- Are transactions needed?

### 4. UX correctness
- Does the interface reflect the actual backend state?
- Are users given valid actions only?
- Are empty/error/loading states handled?

### 5. Governance correctness
- auditability
- permission enforcement
- traceability
- compliance implications

### 6. Delivery correctness
- Is the change too broad?
- What should be phased?
- Is the test coverage adequate?

## Required output

- Executive verdict
- Critical issues
- Medium concerns
- What is solid
- Recommended changes
- Proof still needed before merge
