# SmartPRO Domain Guardrails

These guardrails reflect the nature of this platform.

## Treat the product as a business operating system

AI tools must assume this codebase is not a toy app. It contains workflows that may impact:
- operations
- employee records
- attendance
- payroll
- compliance
- customer/account data
- company administration
- reporting / audits

## Guardrails

### Multi-tenant
- every read/write must respect company scope
- global/platform roles must not silently bypass tenant rules unless explicitly designed
- route visibility is not enough; server checks are required

### RBAC
- distinguish platform-level roles from company membership roles
- do not infer authority from UI state
- verify mutations and sensitive reads server-side

### Workflow integrity
- do not add actions that break lifecycle consistency
- status labels must match real backend state
- avoid duplicate actions across cards, dialogs, and detail pages without a reason

### Data integrity
- check enums, transitions, and shared constants
- avoid drift between schema, server, and client
- consider transactions for multi-step writes

### Audit / traceability
- important administrative, financial, payroll, workforce, or compliance actions should be traceable
- if a change affects operational history, audit/reporting implications must be reviewed

### Localization
- user-facing strings should not be hardcoded when the surrounding system is localized
- do not introduce translation leakage

### No speculative UI work
- do not add dashboards, cards, badges, panels, or components unless tied to a real workflow or acceptance criterion

### No shallow completion
- “looks fixed” is not enough
- the full flow must be checked
