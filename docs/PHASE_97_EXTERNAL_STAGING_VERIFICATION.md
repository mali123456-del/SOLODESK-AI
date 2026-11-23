# SOLODESK AI — Phase 97: External Staging Integrations & Verification Report

**Evaluation Date:** 2026-11-23  
**Workspace Root:** `/app/applet`  
**Honesty Standard:** Zero fabricated credentials, zero simulated remote API approvals. Every provider is classified strictly by what exists and was executed in this environment.

---

## 1. External Provider Verification Matrix

| Provider / Surface | Server Adapter / Artifact | Environment Secrets Present? | Classification | Verified Behavior & Evidence |
|---|---|---|---|---|
| **PostgreSQL / Supabase Staging** | `server/database/pgMigrations/001..006.sql`, `server/database/pgStagingVerify.ts` | No (`DATABASE_URL` / `SUPABASE_DB_URL` unset) | **`BLOCKED_EXTERNAL_CREDENTIALS`** | Static ordering, `SECURITY DEFINER` non-recursive RLS, `FORCE ROW LEVEL SECURITY`, `privacy_consents`, and `trg_audit_logs_immutable` verified via `tests/integration/phase73-76-staging-audit.test.ts`; live `psql`/RLS execution pending staging DB credentials. |
| **SQLite WAL Backend (Local Staging Runtime)** | `server/database/sqliteDb.ts` (v8) | N/A (built-in `node:sqlite`) | **`VERIFIED_SANDBOX`** | Migrations v1–v8, `PRAGMA quick_check`, `VACUUM INTO` backup restore drill, keyset pagination, and multi-tenant isolation verified across 7 integration test suites (`npm test`). |
| **Stripe Checkout** | `server/billing/paymentProviders.ts` (`initiateExternalCheckoutSession`), `POST /api/v1/billing/checkout-session` | No (`STRIPE_SECRET_KEY` unset) | **`BLOCKED_EXTERNAL_CREDENTIALS`** | Real `https://api.stripe.com/v1/checkout/sessions` adapter implemented; fails closed with `501 BLOCKED_EXTERNAL_PROVIDER_REQUIRED` when unconfigured. |
| **Safepay Pakistan** | `server/billing/paymentProviders.ts` (`initiateExternalCheckoutSession`) | No (`SAFEPAY_API_KEY` / `SAFEPAY_SECRET_KEY` unset) | **`BLOCKED_EXTERNAL_CREDENTIALS`** | Real `https://sandbox.api.getsafepay.com/order/v1/init` adapter implemented; fails closed with `501` until merchant keys are supplied. |
| **PayFast Pakistan** | `server/billing/paymentProviders.ts`, `src/services/entitlementService.ts` | No (`PAYFAST_MERCHANT_ID` / `PAYFAST_SECURED_KEY` unset) | **`BLOCKED_EXTERNAL_CREDENTIALS`** | Merchant readiness checked in `getExternalProviderReadiness()`; automated server checkout blocked cleanly (`501`) until Pakistani merchant onboarding completes. |
| **Signed Billing Webhooks** | `POST /api/v1/billing/webhook/:provider`, `verifyRawBodyHmacSignature` | Test secret verified in integration suite; prod secret unset | **`VERIFIED_SANDBOX`** (code) / **`BLOCKED_EXTERNAL_CREDENTIALS`** (live provider) | Raw-body HMAC-SHA256 (`sha256=<hex>`, raw hex, and `t=<ts>,v1=<hex>`), replay idempotency, workspace check, and `cancelled`/`refunded` tier downgrade verified locally in `tests/integration/phase96-98-security-ops.test.ts`. |
| **Google Workspace OAuth** | `src/features/integrations/IntegrationHubView.tsx`, `/api/v1/integrations/provider-status` | No (`GOOGLE_OAUTH_CLIENT_ID` unset) | **`BLOCKED_EXTERNAL_CREDENTIALS`** | Reported honestly via `GET /api/v1/integrations/provider-status`; local email+password `scrypt` sessions remain active. |
| **Transactional Email (SMTP / Resend)** | `server/auth/authService.ts`, `/api/v1/integrations/provider-status` | No (`SMTP_HOST` / `RESEND_API_KEY` unset) | **`BLOCKED_EXTERNAL_CREDENTIALS`** | Invitation & password reset tokens operate locally/API-returnable without faking outbound SMTP delivery. |
| **Gemini Server Gateway** | `server/ai/geminiGateway.ts`, `POST /api/v1/ai/generate` | No (`GEMINI_API_KEY` unset; BYOK in session memory) | **`BLOCKED_EXTERNAL_CREDENTIALS`** (server key) / **`VERIFIED_SANDBOX`** (auth guard + offline draft) | Verified unauthenticated server-key protection (`401 UNAUTHORIZED` when `GEMINI_API_KEY` set) + client offline deterministic draft in Chromium E2E. |
| **Remote E-Signature** | `src/features/contracts/ContractsView.tsx`, `/api/v1/integrations/provider-status` | No (`ESIGN_API_KEY` unset) | **`BLOCKED_EXTERNAL_CREDENTIALS`** | Local signature capture and prominent legal disclaimer remain active and tested. |

---

## 2. Provider Status API Verification

- Authenticated endpoint `GET /api/v1/integrations/provider-status` returns non-secret readiness metadata (`provider`, `category`, `status`, `configured`, `details`) without exposing environment key values.
- Unauthenticated endpoint `GET /api/v1/ready` exposes only boolean/list capability metadata (`geminiServerKeyConfigured`, `externalProvidersConfigured: string[]`) and SQLite `PRAGMA quick_check` status.
