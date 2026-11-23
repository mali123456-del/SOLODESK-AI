# SOLODESK AI — Phase 96: Independent Production Readiness Audit & Remediation

**Audit Date:** 2026-11-23  
**Workspace Root:** `/app/applet` (no `.git` directory)  
**Scope:** Full-stack security, authentication, multi-tenancy, Dexie v6 / SQLite v8 / PostgreSQL `001`–`006` schema parity, billing webhooks, server entitlements, AI gateway, privacy governance, Web Worker timer, and Dashboard analytics audit.  
**Audit Outcome:** **PASS (Local & Backend Hardening Verified)** — All identified code-level High/Medium/Low defects fixed and regression-tested; external hosted service handshakes remain `BLOCKED_EXTERNAL_CREDENTIALS`.

---

## 1. Audited Surface & Verified Inventory

| Domain | Key Files Verified | Baseline / Upgrade | Status |
|---|---|---|---|
| Browser Database (33 tables, v6) | `src/database/solodeskDatabase.ts`, `src/database/workspaceManager.ts`, `src/database/repositories/dexieRepositories.ts` | 33 Dexie stores, multi-workspace isolation, drained deletion | **PASS** |
| SQLite WAL Backend (v8) | `server/database/sqliteDb.ts` | Upgraded v7 -> **v8** (`privacy_consents` + composite indexes + `verifySqliteIntegrity` + `createAndVerifySqliteBackup`) | **PASS** |
| PostgreSQL RLS Migrations (`001`–`006`) | `server/database/pgMigrations/001..006.sql` | Added `006_privacy_consents_and_immutability.sql` (`privacy_consents` RLS + `prevent_audit_log_mutation()` trigger) | **PASS** |
| Express App & Security Headers | `server/createApp.ts` | Raw `req.rawBody` capture, `COOP`, `Permissions-Policy`, conditional `HSTS`, cookie-auth CSRF origin check | **PASS** |
| Auth, Sessions & RBAC | `server/auth/authService.ts`, `server/middleware/auth.ts` | `scrypt` + `timingSafeEqual`, SHA-256 token hashing, HttpOnly cookie, RBAC matrix, standardized audit logging | **PASS** |
| Entitlements & Payment Webhooks | `server/billing/entitlements.ts`, `server/billing/paymentProviders.ts`, `server/api/v1/router.ts` | Server quota checks, raw-body HMAC, cancellation downgrade to `'free'`, workspace existence checks | **PASS** |
| AI Gateway & Privacy Consents | `server/api/v1/router.ts`, `server/monitoring/auditService.ts` | Protected server `GEMINI_API_KEY` from anonymous drain; `/privacy/consents` & `/audit-logs/:ws/purge` | **PASS** |
| Frontend Features & CSP | `src/workers/timerWorker.ts`, `src/services/backgroundTimerService.ts`, `src/domain/calculations/revenueTrend.ts`, `src/features/dashboard/DashboardView.tsx`, `src/features/time-tracker/TimeTrackerView.tsx`, `src/features/commercial/HelpPlansTourView.tsx` | Module Web Worker timer compatible with `worker-src 'self'`; `big.js` Recharts Monthly Revenue Trend; Legal/Commercial disclosure card | **PASS** |

---

## 2. Findings & Applied Remediations

### High Severity

1. **H-01 (FIXED) — Unauthenticated Access to Server-Managed `GEMINI_API_KEY` (`server/api/v1/router.ts`)**
   - **Finding:** `POST /api/v1/ai/generate` previously allowed requests omitting `workspaceId`, session auth, and `x-gemini-key` to invoke `process.env.GEMINI_API_KEY` anonymously if configured.
   - **Remediation:** Requests without a valid authenticated session or caller-supplied `x-gemini-key` are now rejected with `401 UNAUTHORIZED` whenever `process.env.GEMINI_API_KEY` is configured, while preserving existing BYOK (`400 missing_key`) behavior when no server key exists. Verified by automated negative test in `tests/integration/phase96-98-security-ops.test.ts`.

2. **H-02 (FIXED) — Plan Entitlements Only Enforced Client-Side (`server/billing/entitlements.ts`, `server/api/v1/router.ts`)**
   - **Finding:** `subscriptions.plan_tier` existed in SQLite/PostgreSQL, but `/storage/objects`, `/webhooks`, `/sync/push`, `/ai/generate`, and paid workspace team invitations did not enforce plan quotas server-side.
   - **Remediation:** Implemented `checkWorkspaceEntitlement` & `getWorkspaceEntitlementSnapshot` in `server/billing/entitlements.ts` and exposed `GET /api/v1/billing/entitlements/:workspaceId`. Enforces vault object limits (`25` on free), webhook limits (`5` on free), monthly sync/AI quotas, and paid-tier seat caps (`pro: 1`, `ultimate: 3`, `business: 25`), returning `403 ENTITLEMENT_LIMIT_EXCEEDED`.

3. **H-03 (FIXED) — Billing Webhook Raw-Body Signature Drift, Missing Workspace Check & No Cancellation Downgrade (`server/billing/paymentProviders.ts`, `server/createApp.ts`, `server/api/v1/router.ts`)**
   - **Finding:** Billing webhook HMAC previously hashed `JSON.stringify(req.body)` instead of raw HTTP bytes, did not verify `t=<ts>,v1=<hex>` Stripe-style headers, did not validate workspace existence before `INSERT`, deduplicated `provider_event_id` globally without `provider`, and kept `plan_tier` elevated even when `billingStatus` was `'cancelled'` or `'refunded'`.
   - **Remediation:** Captured `req.rawBody` Buffer in `server/createApp.ts`, implemented `verifyRawBodyHmacSignature`, enforced workspace existence (`404 WORKSPACE_NOT_FOUND`), scoped replay checks to `(provider, provider_event_id)`, and automatically downgraded cancelled/refunded/expired events back to `'free'` inside an `IMMEDIATE` transaction with audit logging.

### Medium Severity

4. **M-01 (FIXED) — Cookie-Authenticated Mutation CSRF Hardening (`server/createApp.ts`)**
   - **Finding:** While `SameSite=Lax` cookies protected top-level navigation, mutating `/api/v1` cookie-authenticated requests lacked explicit `Origin`/`Referer` host verification.
   - **Remediation:** Added defense-in-depth middleware blocking cross-origin mutating requests carrying `solodesk_session=` without a `Bearer` token (`403 CSRF_ORIGIN_MISMATCH`), plus `Cross-Origin-Opener-Policy`, `Permissions-Policy`, and conditional `Strict-Transport-Security`.

5. **M-02 (FIXED) — Privacy Consent Server Parity & PostgreSQL `audit_logs` Immutability (`server/database/sqliteDb.ts`, `server/database/pgMigrations/006_privacy_consents_and_immutability.sql`)**
   - **Finding:** Privacy consents (`local_storage`, `ai_processing`, `cloud_sync`, `crash_telemetry`) existed only in browser IndexedDB without SQLite/PostgreSQL schema parity, and PostgreSQL `audit_logs` relied solely on RLS policy omission rather than a DB trigger to prevent tampering.
   - **Remediation:** Added SQLite migration v8 + PG migration `006` (`privacy_consents` with `FORCE ROW LEVEL SECURITY`, `prevent_audit_log_mutation()` trigger blocking `UPDATE`/`DELETE` on `audit_logs`), `GET/PUT /api/v1/privacy/consents/:workspaceId`, and `POST /api/v1/audit-logs/:workspaceId/purge` (`30–3650` day retention validation + audit entry).

6. **M-03 (FIXED) — Unbounded `portalAuditRateState` Map & Unknown Workspace Audit Insertion (`server/api/v1/router.ts`)**
   - **Finding:** `portal_access_logs` accepted arbitrary nonexistent `workspaceId` strings, and `portalAuditRateState` had no expired-entry pruning.
   - **Remediation:** Added expired-entry pruning above 2,000 entries and rejected non-`'local-workspace'` unknown workspaces with `404 WORKSPACE_NOT_FOUND`.

### Low / Residual Risks Documented

7. **L-01 (RESIDUAL ARCHITECTURAL LIMITATION)** — Live PostgreSQL migration execution (`001`–`006`) and remote `audit_logs` trigger runtime verification are `BLOCKED` locally by absence of `DATABASE_URL`; verified statically by inspection and automated SQL migration assertions (`tests/integration/phase73-76-staging-audit.test.ts`).
8. **L-02 (RESIDUAL BROWSER LIMITATION)** — Browser `urlImporter.ts` still cannot pin DNS/TCP sockets inside client `fetch()` (`docs/URL_IMPORT_LIMITATIONS.md`). Server webhooks remain fully pinned via `resolveAndValidatePinnedAddress`.
