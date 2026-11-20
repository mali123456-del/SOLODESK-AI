# PHASE 77 — SaaS Release Candidate Gate

**Baseline Tag:** SOLODESK AI v1.0.0 — Phases 0–77  
**Verification Date:** 2026-11-20

---

## 1. Strict 6-Tier Release Classification Matrix

| Tier | Status | Exact Evidence / External Blocker |
|---|---|---|
| **LOCAL VERIFIED** | **ACHIEVED** | `tsc --noEmit`, Vite build, `24/24` Vitest files (`108/108` tests), Chromium E2E + Axe accessibility, bundle secret scan (`0` leaks), SQLite v1–v6 & IndexedDB v5 verified locally |
| **STAGING PREPARED** | **ACHIEVED** | PostgreSQL `001`–`004` migrations (including RLS recursion fix `004`), Express health/readiness/docs probes, runbook, rollback scripts, and `.env.example` verified and ready |
| **STAGING VERIFIED** | **BLOCKED (EXTERNAL)** | Requires live staging `DATABASE_URL` / `SUPABASE_URL` + `psql`/`supabase` execution outside this container |
| **PAYMENT VERIFIED** | **BLOCKED (EXTERNAL)** | No `PAYFAST_MERCHANT_ID`, `SAFEPAY_API_KEY`, `JAZZCASH_*`, or `STRIPE_SECRET_KEY` sandbox credentials exist; `/api/v1/billing/catalog` accurately reports `BLOCKED_EXTERNAL_PROVIDER_REQUIRED` |
| **CLOUD VERIFIED** | **BLOCKED (EXTERNAL)** | Requires live hosted OAuth (`GOOGLE_CLIENT_ID`, `MICROSOFT_CLIENT_ID`), SMTP/email relay, managed `GEMINI_API_KEY`, and cloud object storage staging run |
| **PRODUCTION READY** | **NOT READY (PENDING ABOVE)** | Must achieve `STAGING VERIFIED`, `CLOUD VERIFIED`, and (if charging subscriptions) `PAYMENT VERIFIED` first |

---

## 2. Consolidated Sub-Reports

### 2.1 Health Check & Readiness
- `GET /api/v1/health` returns service identity, version (`1.0.0`), and ISO timestamp.
- `GET /api/v1/ready` verifies active SQLite query (`SELECT 1`), applied migration count (`6`), runtime metrics snapshot, and `geminiServerKeyConfigured` boolean without revealing secrets.

### 2.2 Database Migration Verification
- **Client IndexedDB (Dexie v5, 29 domain tables + separate `solodesk_ai_workspaces_meta` v1):** Verified clean install, workspace isolation, interrupted `taskCompletionMigration` atomic rollback, idempotent repeat execution, and backup/restore preservation.
- **Server SQLite (v1–v6):** Verified WAL mode, foreign keys ON, and v6 `jobs` workspace-scoped idempotency migration (`UNIQUE(workspace_id, idempotency_key)`).
- **Server PostgreSQL (`001`–`004`):** Statically audited; `004` fixes `42P17` RLS recursion and completes remaining table parity (`STAGING PREPARED`).

### 2.3 Tenant Isolation, Auth & RBAC
- Express `requireWorkspaceRole` + `resolveCanonicalWorkspaceId` block cross-tenant reads/writes, parameter pollution, and privilege escalation across all 5 roles (`owner`, `admin`, `manager`, `collaborator`, `client_viewer`), unauthenticated callers, and revoked sessions.

### 2.4 Sync Push/Pull & Conflict Resolution
- Deterministic monotonic server cursors, composite `nextPageCursor` keyset pagination (0 dropped same-timestamp records), `Idempotency-Key` request hashing (`409` on mismatch), tombstone enforcement, and manual/policy conflict resolution awaiting server ACK.

### 2.5 Backup & Recovery
- Encrypted (`AES-GCM` PBKDF2) and plain JSON workspace backups include explicit `workspaceId`/`workspaceName`, warn on cross-workspace import, and execute atomic restore inside Dexie transactions (`phase8` + `phase68` tests passed).

### 2.6 Performance & Bundle Baseline
- **Vite Production Build:** Built cleanly in **2.62s** (`2898` modules transformed, `64` JS chunks, `2741.4 KB` uncompressed total across lazy route/vendor chunks; PWA `77` precached entries / `2810.67 KiB`).
- **Bundle Secret Scan:** Scanned all 64 `dist/assets/*.js` files -> **`0` leaked API keys or service tokens**.
- **Test Execution:** Full TypeScript check + `24/24` Vitest files (`108/108` tests) completed in **55.38s**; Chromium Playwright E2E completed in **59.0s**.

### 2.7 Accessibility & Multi-Viewport Verification
- Verified via `@axe-core/playwright` (`tests/e2e/solodesk.spec.ts`) across desktop and mobile viewports (navigation, onboarding, CRM, workflows, timer reload recovery, diagnostics, offline PWA).

### 2.8 Dependency & Vulnerability Audit (`npm audit`)
- **Repository Lockfile:** Uses `bun.lock` (`package-lock.json` generated ephemerally for `npm audit --json`, then deleted).
- **Production Dependencies (`209` prod packages):** **0 critical, 0 high, 0 moderate, 0 low vulnerabilities.**
- **Dev Build Tooling (`356` dev packages):** **4 moderate** advisories confined to build-time PWA generator chain (`vite-plugin-pwa -> workbox-build -> glob / minimatch`: `GHSA-3g3m-2fjr-6pw4`, `GHSA-g3hv-75wg-m249`); zero runtime client or server exposure.

### 2.9 Payment Gateways & OAuth Providers (Truthful External Status)
- **Payments (`PayFast PK`, `Safepay`, `JazzCash/Easypaisa`, `Stripe`):** `BLOCKED_EXTERNAL_PROVIDER_REQUIRED`. Automated card checkout is disabled cleanly in UI and API (`billing/catalog`) until merchant keys + webhook secrets are configured in staging/production.
- **OAuth (`Google Calendar/Gmail`, `Microsoft Graph`):** No client IDs/secrets provisioned in container; local ICS export & mailto/draft workflows active.
- **AI Provider (`Gemini`):** Supports optional server `GEMINI_API_KEY`, session BYOK key (`x-gemini-key`), or transparent deterministic local draft fallback when unconfigured.

### 2.10 Deployment & Rollback Runbook
1. Copy `.env.example` to `.env` (supply real `PORT`, `SOLODESK_SQLITE_PATH` or staging `DATABASE_URL`/`SUPABASE_URL`, and optional `GEMINI_API_KEY`).
2. Run `npm ci` / `bun install --frozen-lockfile`, `npx tsc --noEmit`, `npm test`, and `npm run build`.
3. If using hosted PostgreSQL, execute `001`–`004` with `ON_ERROR_STOP=1 --single-transaction` against a backed-up staging DB first (`docs/PHASE_74_STAGING_DATABASE.md`).
4. Start server: `npm start` (`NODE_ENV=production tsx server.ts`), verify `GET /api/v1/health` and `GET /api/v1/ready`.
5. **Rollback:** Restore prior release artifact (`dist/` + previous SQLite file or `pg_restore` snapshot before migrations).

### 2.11 Known Limitations
- Hosted PostgreSQL RLS live execution, remote cloud object storage, transactional email delivery (password resets/invites currently return `NOT_CONFIGURED_LOCAL_ONLY`), and real payment sandbox webhooks require external infrastructure provisioning.
- Browser client URL importer cannot pin TCP socket IPs at connect time (CORS + hostname policy only).
- Single-node SQLite backend + in-memory login rate limiter require Postgres + shared Redis store before horizontal multi-replica scaling.
