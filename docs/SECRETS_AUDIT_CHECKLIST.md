# SmartPRO Secrets Audit Checklist

**Purpose:** Pre-deployment and periodic verification that all secrets are present, correctly typed, and rotated on schedule.  
**Audience:** DevOps / security lead performing production deployments.  
**Source of truth:** `.env.example` in repository root.

---

## 1. Required Secrets (application fails without these)

Check each item before every production deployment:

- [ ] `DATABASE_URL` — present, points to production MySQL 8.0, password is not the default/dev value
- [ ] `JWT_SECRET` — present, ≥ 16 characters, randomly generated (not a passphrase or dictionary word)
- [ ] `OAUTH_SERVER_URL` — present, HTTPS in production
- [ ] `VITE_OAUTH_PORTAL_URL` — present, HTTPS in production
- [ ] `VITE_APP_ID` — present, matches the app registration on the IdP

---

## 2. Required Conditionally (based on enabled features)

### 2FA (enable when `TWO_FACTOR_ENCRYPTION_KEY` is populated)

- [ ] `TWO_FACTOR_ENCRYPTION_KEY` — ≥ 32 characters, AES-256-GCM compatible, randomly generated
  - Generate: `openssl rand -hex 32`
  - **Warning:** changing this key invalidates all existing TOTP secrets stored in the database. Rotate only with a coordinated migration to re-encrypt stored secrets.

### Thawani payments

- [ ] `THAWANI_SECRET_KEY` — server-side; never exposed to client
- [ ] `THAWANI_PUBLISHABLE_KEY` — client-side; safe to expose but must match Thawani dashboard
- [ ] `THAWANI_WEBHOOK_SECRET` — validates webhook POST signatures; must match value in Thawani dashboard
- [ ] `THAWANI_SANDBOX` — set to `false` in production; omit or set `true` in staging

### Stripe payments

- [ ] `STRIPE_SECRET_KEY` — server-side (`sk_live_...`); never exposed to client
- [ ] `STRIPE_WEBHOOK_SECRET` — validates webhook POST signatures (`whsec_...`); must match Stripe dashboard endpoint
  - Stripe webhook endpoint: `https://<host>/api/webhooks/stripe`

### HR document generation (Google Docs)

- [ ] `GOOGLE_DOCS_SERVICE_ACCOUNT_JSON` — full JSON object of a service account with Drive + Docs API enabled; templates shared with `client_email`
- [ ] `GOOGLE_DOCS_SHARED_DRIVE_ID` — Team Drive ID; service account added as Content Manager
- [ ] `GOOGLE_DOCS_IMPERSONATE_EMAIL` — (if using domain-wide delegation instead of Shared Drive) workspace user email; requires DWD configured in Google Workspace Admin

### WhatsApp Cloud API (optional notifications)

- [ ] `WHATSAPP_CLOUD_ACCESS_TOKEN` — Meta system user token; permanent token preferred for production
- [ ] `WHATSAPP_CLOUD_PHONE_NUMBER_ID` — phone number ID from Meta Business Suite
- [ ] `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — arbitrary string; must match value entered in Meta webhook configuration
- [ ] `WHATSAPP_CLOUD_APP_SECRET` — (if signature validation enabled) app secret from Meta; enables `X-Hub-Signature-256` verification on incoming webhooks

### Storage proxy (Forge / Manus)

- [ ] `BUILT_IN_FORGE_API_URL` — required if any feature uses `storagePut`
- [ ] `BUILT_IN_FORGE_API_KEY` — must not be a dev/placeholder key in production

### Error monitoring

- [ ] `SENTRY_DSN` — production DSN from Sentry project settings; leave blank to disable
- [ ] `SENTRY_ENVIRONMENT` — set to `production` (controls Sentry issue grouping and alert routing)

---

## 3. Secrets That Must Never Appear in Source Control

Verify with `git log --all -S "<value>"` for any suspected leaks.

| Secret | Risk if leaked |
|--------|---------------|
| `DATABASE_URL` (with password) | Full database read/write access |
| `JWT_SECRET` | Forge arbitrary session tokens for any user |
| `TWO_FACTOR_ENCRYPTION_KEY` | Decrypt all stored TOTP authenticator secrets |
| `THAWANI_SECRET_KEY` | Initiate or cancel payment sessions |
| `STRIPE_SECRET_KEY` | Full Stripe account control |
| `STRIPE_WEBHOOK_SECRET` | Forge Stripe webhook events |
| `GOOGLE_DOCS_SERVICE_ACCOUNT_JSON` | Access all documents and drives shared with service account |
| `WHATSAPP_CLOUD_ACCESS_TOKEN` | Send messages from the registered phone number |

---

## 4. Storage Policy

| Location | Acceptable | Notes |
|----------|-----------|-------|
| `.env` file on server | Yes | `chmod 600`; excluded from backups that leave the server |
| Docker secrets | Yes | For orchestrators supporting `secrets:` (Swarm, Kubernetes) |
| Secrets manager (Vault, AWS SM, GCP SM) | Yes | Preferred for team environments |
| `docker-compose.yml` `environment:` block in repository | No | File is committed; never put real values here |
| Repository `.env` file | No | `.env` is in `.gitignore`; verify with `git check-ignore -v .env` |
| Application logs / Sentry payloads | No | Audit logging policy explicitly excludes secret values |

---

## 5. Rotation Schedule

| Secret | Rotation trigger | Notes |
|--------|-----------------|-------|
| `JWT_SECRET` | Every 90 days, or on any suspected compromise | Rotation invalidates all active sessions; coordinate with users |
| `DATABASE_URL` (password) | Every 90 days, or after any personnel change with DB access | Update in all `.env` files and secrets manager simultaneously |
| `TWO_FACTOR_ENCRYPTION_KEY` | Only when compromised | Requires re-encryption of all stored TOTP secrets before rotation |
| `STRIPE_SECRET_KEY` | On any suspected compromise; otherwise yearly | Roll in Stripe dashboard → update env → deploy |
| `THAWANI_SECRET_KEY` | On any suspected compromise | Coordinate with Thawani support |
| `GOOGLE_DOCS_SERVICE_ACCOUNT_JSON` | When service account is removed from team; yearly otherwise | Revoke old key in GCP Console before deleting |
| `WHATSAPP_CLOUD_ACCESS_TOKEN` | When Meta system user is removed; on expiry | Token expiry date visible in Meta Business Suite |
| `TWO_FACTOR_ENCRYPTION_KEY` | Never routine-rotate | Rotation requires a coordinated DB migration to re-encrypt all TOTP secrets |

---

## 6. Pre-Deployment Verification Commands

Run these against the production environment before cutting over:

```sh
# DATABASE_URL is set and reachable
mysql "$DATABASE_URL" -e "SELECT 1;" && echo "DB OK"

# JWT_SECRET meets minimum length
python3 -c "import os; s = os.environ['JWT_SECRET']; assert len(s) >= 16, 'JWT_SECRET too short'; print('JWT_SECRET OK')"

# No placeholder values remain
grep -E "^(DATABASE_URL|JWT_SECRET|OAUTH_SERVER_URL|VITE_OAUTH_PORTAL_URL|VITE_APP_ID)=$" .env \
  && echo "ERROR: required secrets are empty" && exit 1 || echo "Required secrets populated"

# .env is not tracked by git
git check-ignore -v .env && echo ".env is gitignored OK" || echo "WARNING: .env may not be gitignored"
```

---

## 7. Audit Log Field Exclusions (what is never logged)

The audit logging system (`server/hrOrgAudit.ts`, `server/auditLogging.ts`) enforces the following exclusions at the code level. This is not a policy note — these fields are stripped by `pickSafeEmployeeFields()` before any audit write:

**Never logged as values:**
- Salary amounts
- IBAN / bank account numbers
- Passport numbers
- Civil / national ID numbers
- PASI numbers
- Date of birth
- Emergency contact details
- Marital status

**May appear only in `metadata.changedFields` / `metadata.providedFields`** (field name only, no value):
- Any of the above if the field key itself is useful for change tracking

This policy means a compromised `audit_events` table does not expose the above categories of data.

---

## 8. Sign-Off

Before deploying to production, confirm:

- [ ] All required secrets in section 1 are populated in production `.env`
- [ ] All conditional secrets for enabled features (section 2) are populated
- [ ] No secret values appear in git history (section 3 check complete)
- [ ] `.env` file permissions are `600` on the production server
- [ ] Rotation schedule (section 5) is documented in team calendar or secrets manager
- [ ] Database dump taken before migration (see `DEPLOYMENT_RUNBOOK.md` section 2d)
- [ ] Post-deploy verification completed (see `DEPLOYMENT_RUNBOOK.md` section 5)
