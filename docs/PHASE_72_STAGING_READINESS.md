# Phase 72 — Staging Readiness & Release Gate

**Overall Classification:**
- **Local Web PWA + Express/SQLite SaaS Backend + Unit/Integration/E2E Gates:** `LOCALLY VERIFIED`
- **Hosted Cloud Infrastructure (PostgreSQL/Supabase RLS, TLS Ingress, OAuth, Billing Gateways, Managed LLM Keys):** `BLOCKED — EXTERNAL REQUIREMENT`

---

## 1. Local Verification Gate Summary (Observed Command Outputs)

| Check | Command | Observed Result |
| :--- | :--- | :--- |
| **TypeScript Typecheck** | `npx tsc --noEmit` | **Passed** (0 errors) |
| **Repository Lint** | `npm run lint` | **Passed** (0 errors) |
| **Unit & Integration Suite** | `npm test` | **Passed** (**23 / 23 test files**, **102 / 102 tests**, 0 unhandled errors) |
| **Production Build & PWA** | `npm run build` | **Passed** (2.72s, `vite-plugin-pwa` v2.0.0, `dist/sw.js` 77 entries / 2811.63 KiB) |
| **Bundle Secret / SDK Audit** | `grep -rnE "@google/genai\|AIza" dist/assets/*.js` | **Passed (`BUNDLE_CLEAN`)** — zero `@google/genai` SDK or `AIza` keys in frontend bundle |
| **Chromium E2E + Axe Accessibility** | `npm run test:e2e` | **Passed** (**1 / 1 Chromium test** in 1.0m, 0 `pageerror`, 0 `console.error`, 0 horizontal overflow across 320–1440px, 0 critical `@axe-core/playwright` violations) |

---

## 2. Staging Deployment & Environment Checklist (No Secrets)

### Required Runtime Variables (`.env.example` + Staging Secrets Manager)
- `PORT=3000`
- `NODE_ENV=production`
- `SOLODESK_SQLITE_PATH` (only if running single-node SQLite mode on persistent volume; must NOT reside on ephemeral `/tmp`)
- `GEMINI_API_KEY` (server-side only, never prefixed with `VITE_`; required if enabling managed AI quota, otherwise app degrades safely to BYOK / Offline Draft mode)
- `DATABASE_URL` / `SUPABASE_URL` / `SUPABASE_ANON_KEY` (required when cutting storage/sync persistence from SQLite to hosted PostgreSQL + Supabase RLS)
- `SUPABASE_SERVICE_ROLE_KEY` (server-side admin/reset workflows ONLY; never exposed to browser)
- Payment provider credentials (`PAYFAST_*`, `SAFEPAY_*`, `JAZZCASH_*`, or `STRIPE_*` depending on legal entity)
- Optional OAuth client IDs/secrets if third-party Google Workspace/OAuth sync is provisioned later

---

## 3. Strictly Ordered Staging Migration Plan

1. **Pre-Migration Backup:** Snapshot existing SQLite file (`SOLODESK_SQLITE_PATH` + `-wal`/`-shm`) or managed PostgreSQL automated backup prior to schema rollout.
2. **PostgreSQL / Supabase DDL Rollout Order (do NOT skip):**
   1. `server/database/pgMigrations/001_postgresql_rls_pgvector.sql`
   2. `server/database/pgMigrations/002_phase37_40_domains_rls_buckets.sql`
   3. `server/database/pgMigrations/003_rls_hardening_and_sync_idempotency.sql`
3. **Browser IndexedDB Migrations:** Client Dexie schema upgrades automatically on boot (`SOLODESK_SCHEMA_VERSION = 5`) and executes `runTaskCompletionTimestampMigration(activeDb)` atomically once per workspace.
4. **Rollback Procedure:**
   - **App container:** Revert to prior image tag cleanly (additive IndexedDB schema and SQL columns remain backward compatible).
   - **PostgreSQL:** Restore pre-migration snapshot if DDL rollback is necessary; never run destructive `DROP TABLE` without confirmed backup.

---

## 4. Post-Deploy Staging Smoke Verification Steps

1. **Liveness & Readiness Probes:**
   - `GET /api/v1/health` -> `200 { ok: true }`
   - `GET /api/v1/ready` -> `200 { ok: true, migrationsApplied >= 5 }`
2. **TLS & Cookie Hardening Check:**
   - Confirm staging reverse proxy forwards `X-Forwarded-Proto: https` and `POST /api/v1/auth/login` sets `HttpOnly; SameSite=Lax; Secure`.
3. **Sync Idempotency & Conflict Smoke Test:**
   - Push change with `Idempotency-Key`, replay identical payload -> verify `idempotentReplay: true`; verify pull cursor returns change cleanly.
4. **Tenant Isolation & Live RLS Verification (Two Real Staging Users):**
   - Authenticate User A and User B against staging; confirm User B receives `403 TENANT_ACCESS_DENIED` on User A endpoints AND verify direct Supabase/Postgres PostgREST queries with User B JWT return 0 rows from User A tables under RLS (`003_rls_hardening_and_sync_idempotency.sql`).
5. **Cloud Backup/Recovery Smoke Test:**
   - Export encrypted workspace JSON backup, restore into staging browser profile, and confirm workspace switcher + 29 tables remain intact.

---

## 5. External Blockers (Not Claimed Verified Locally)

- **Managed PostgreSQL / Supabase Instance (`BLOCKED — EXTERNAL REQUIREMENT`):** `001`–`003` SQL migrations have not been executed against live Postgres/Supabase yet.
- **Payment Checkout (`BLOCKED — EXTERNAL REQUIREMENT`):** `/api/v1/billing/catalog` intentionally reports `BLOCKED_EXTERNAL_PROVIDER_REQUIRED` and `stripeDirectInPakistan: UNSUPPORTED_WITHOUT_FOREIGN_ENTITY` until merchant API credentials (PayFast, Safepay, JazzCash, or Stripe) are provisioned.
- **Managed Cloud AI Quota (`BLOCKED — EXTERNAL REQUIREMENT` unless `GEMINI_API_KEY` set):** Without server `GEMINI_API_KEY`, server gateway returns deterministic `400 missing_key` and frontend falls back cleanly to Offline Draft / user session BYOK.
- **Transactional Password Reset / Invite Email Delivery (`BLOCKED — EXTERNAL REQUIREMENT`):** SMTP/provider credentials are not provisioned (`emailDeliveryStatus: 'NOT_CONFIGURED_LOCAL_ONLY'`).
