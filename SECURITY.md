# Security Policy

## Supported Versions

This repository ships as **SmartPRO Hub** (see root `package.json` for the current package version). Security fixes are intended for the **actively maintained default branch** (`main`) and deployments built from it.

| Scope | Supported for security updates |
| ----- | ------------------------------ |
| `main` branch (latest commit) | Yes |
| Release tags / production builds cut from `main` | Yes, while that line is the current supported deployment |
| Old tags, abandoned branches, or unmaintained forks | No |

If you depend on a fork or an old snapshot, you are responsible for merging upstream security fixes.

## Reporting a Vulnerability

**Please do not** open a public GitHub issue for undisclosed security vulnerabilities (that can put users at risk before a fix exists).

1. **Preferred:** Use [GitHub private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) for this repository (Repository **Security** tab → **Report a vulnerability**), if the feature is enabled.
2. **Alternative:** Contact the maintainers through a private channel they have published for this project (for example organization or maintainer contact on the GitHub profile), with enough detail to reproduce and assess impact.

### What to include

- A clear description of the issue, affected components (e.g. API route, auth, file upload), and steps to reproduce.
- Whether you believe it affects confidentiality, integrity, availability, or tenant isolation.
- Any suggested fix or patch (optional but welcome).

### What to expect

- Acknowledgment when the report is triaged (timing depends on maintainer availability).
- Updates as the issue is confirmed, fixed, or declined (with a brief reason if declined).
- Coordinated disclosure: we ask that you **not** publish details until an agreed fix or mitigation window has passed.

Thank you for helping keep SmartPRO Hub and its users safe.
