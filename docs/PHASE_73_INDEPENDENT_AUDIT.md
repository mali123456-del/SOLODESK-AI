# PHASE 73 — Independent Architecture & Security Review

**Verification Scope:** Complete repository audit covering all 29 workspace-scoped IndexedDB tables, workspace registry/lifecycle, repository DB binding, SQLite migrations v1–v6, PostgreSQL migrations `001`–`004`, auth/session lifecycle, Express tenant middleware, all API v1 routes, AI gateway, sync push/pull & idempotency, conflict resolution, webhook SSRF & DNS pinning, client portal, backup/recovery, and telemetry/secret scrubbing.  
**Audit Outcome Status:** `LOCAL VERIFIED` (all verified High/Medium/Low code defects fixed and regression-tested); remote PostgreSQL execution remains `STAGING PREPARED`.

---

## 1. Audited Surface Summary

| Area | Primary Files Inspected | Verdict |
|---|---|---|
| IndexedDB 29 tables & Workspace Manager | `src/database/solodeskDatabase.ts`, `src/database/workspaceManager.ts`, `src/database/migrations/taskCompletionMigration.ts` | Verified (concurrency & migration rollback protected) |
| Repository DB Binding | `src/database/repositories/dexieRepositories.ts` | **Fixed (Medium)** — multi-await writes pinned via `runWrite(scoped, db)` |
| SQLite Schema & Migrations | `server/database/sqliteDb.ts` | **Fixed (High)** — added Migration v6 `006_scope_jobs_idempotency_per_workspace` |
| PostgreSQL / Supabase Migrations | `server/database/pgMigrations/001..004.sql` | **Fixed (High)** — `004` breaks self-referential RLS recursion (`42P17`) & adds remaining tables |
| Auth & Session Lifecycle | `server/auth/authService.ts`, `server/middleware/auth.ts` | Verified (`scrypt` + `timingSafeEqual`, SHA-256 session tokens, HttpOnly cookie + Bearer, 8-attempt login rate limit) |
| Tenant Middleware & API Routes | `server/middleware/auth.ts`, `server/api/v1/router.ts`, `server/createApp.ts` | **Fixed (Medium/Low)** — composite keyset sync cursor + scrubbed Express error middleware |
| Webhook Execution & SSRF Pinning | `src/security/urlPolicy.ts`, `server/jobs/jobRunner.ts`, `src/integrations/crawler/urlImporter.ts` | **Fixed (High)** — connection-time DNS/IP pinning & fail-closed DNS; browser fetch limitation documented |
| AI Provider Gateway | `server/ai/geminiGateway.ts`, `src/ai/providers/GeminiProvider.ts`, `src/ai/agents/agentRegistry.ts` | Verified (no bundled secret; per-call server/BYOK key; deterministic offline fallback; tool RBAC intersection) |
| Client Portal, Backup, Telemetry | `src/services/clientPortalService.ts`, `src/services/backupService.ts`, `server/monitoring/telemetry.ts` | Verified (capability-token portal, AES-GCM backup encryption option, workspace mismatch warning, regex + key scrubbing) |

---

## 2. Classified Security & Data-Integrity Findings

### High Severity

1. **H-01 (FIXED) — Outbound Webhook DNS Rebinding TOCTOU & Fail-Open Lookup (`server/jobs/jobRunner.ts`)**
   - **Defect:** `dispatchServerWebhookTest` previously resolved DNS via `dns.lookup(..., { all: true }).catch(() => [])`, failing open if DNS errored or returned `[]`, and subsequently invoked native `fetch(urlCheck.normalizedUrl)` which re-resolved DNS independently (Time-of-Check to Time-of-Use DNS rebinding window).
   - **Fix:** Added `validateResolvedIpAddress` in `src/security/urlPolicy.ts` (including IPv6 zone-ID stripping and IPv4-mapped IPv6 validation) and implemented `resolveAndValidatePinnedAddress` + `dispatchPinnedWebhookRequest` in `server/jobs/jobRunner.ts`. Unmocked webhook deliveries fail closed on DNS error or empty answer, validate every returned IP, and pin the validated socket IP directly inside `node:http`/`node:https` custom `lookup` with TLS `servername` SNI preservation and explicit 3xx redirect blocking.

2. **H-02 (FIXED) — Cross-Tenant Background Job Idempotency Key Collision (`server/database/sqliteDb.ts`, `server/jobs/jobRunner.ts`)**
   - **Defect:** `jobs.idempotency_key` had a global `UNIQUE` constraint across the entire database, and `enqueueServerJob` looked up `WHERE idempotency_key = ?` without `workspace_id`. Tenant B using an idempotency key already used by Tenant A would read Tenant A's `job.id`, `status`, and `created_at` (`deduplicated: true`) instead of creating Tenant B's job.
   - **Fix:** Added SQLite migration v6 (`006_scope_jobs_idempotency_per_workspace`) rebuilding `jobs` with `UNIQUE(workspace_id, idempotency_key)` while migrating existing rows atomically, and scoped `enqueueServerJob` lookup strictly to `WHERE workspace_id = ? AND idempotency_key = ?`.

3. **H-03 (FIXED IN `004`) — PostgreSQL RLS Infinite Recursion (`42P17`) on `workspace_members` (`server/database/pgMigrations/003..004.sql`)**
   - **Defect:** `003_rls_hardening_and_sync_idempotency.sql` defined `workspace_members_member_read` and `workspace_members_admin_write` with `EXISTS (SELECT 1 FROM workspace_members m ...)` directly on `workspace_members`. In live PostgreSQL, self-referential SELECTs inside table RLS policies trigger `42P17: infinite recursion detected in policy`. Furthermore, `knowledge_sources`, `jobs`, `webhooks`, and `webhook_deliveries` lacked PostgreSQL DDL/RLS parity and policies lacked explicit `TO authenticated`.
   - **Fix:** Created `server/database/pgMigrations/004_rls_security_definer_functions_and_remaining_tables.sql` defining schema-qualified `SECURITY DEFINER` helpers `public.is_workspace_member(UUID)` and `public.has_workspace_role(UUID, TEXT[])` with `SET search_path = ''`, creating missing tables with `FORCE ROW LEVEL SECURITY`, and replacing recursive policies `TO authenticated`.

### Medium Severity

4. **M-01 (FIXED) — Sync Pull Pagination Drops Same-Timestamp Records (`server/api/v1/router.ts`, `src/services/backendAuthClient.ts`)**
   - **Defect:** `/api/v1/sync/pull` filtered exclusively by `updated_at > ?` and emitted scalar `nextCursor = updatedAt`. Because batched `/sync/push` assigns one monotonic server timestamp across up to 200 items, paginating with `limit < batchSize` skipped all remaining items sharing the boundary timestamp.
   - **Fix:** Added opaque `base64url` composite keyset `cursor` support (`(updated_at, entity_type, entity_id)` for records and `(deleted_at, entity_type, entity_id)` for tombstones) returning `nextPageCursor` alongside backward-compatible `since` and `nextCursor`. Verified via `limit=2` pagination across 5 same-timestamp records and 3 same-timestamp tombstones (0 skips, 0 duplicates).

5. **M-02 (FIXED) — Multi-Await Repository Writes Not Pinned Against Concurrent Workspace Switch (`src/database/repositories/dexieRepositories.ts`)**
   - **Defect:** When called via the default `repositories` singleton, write methods like `createClient`, `createProject`, `createInvoice`, `recordPayment`, and `refreshOverdueInvoices` read `this.db` dynamically before and after `await` boundaries (such as `clients.add` followed by `this.logActivity`), allowing a concurrent `switchActiveWorkspace()` call mid-await to split child/activity rows into a newly active workspace DB.
   - **Fix:** Refactored `runWrite` to capture `const database = this.db; const scoped = this.withDatabase(database);` once at method entry and pass `(scoped, db)` into every write closure, plus pinned `database = this.db` at entry in `refreshOverdueInvoices` and `updateSyncQueueItem`.

6. **M-03 (DOCUMENTED RESIDUAL LIMITATION) — Browser Client URL Importer Cannot Pin TCP/DNS (`src/integrations/crawler/urlImporter.ts`)**
   - **Finding:** Browser `fetch()` enforces CORS and `validatePublicHttpUrl` preflight hostname/IP checks, but browsers do not expose DNS resolution APIs or socket-level IP pinning to JS callers.
   - **Mitigation:** Clearly classified as an architectural browser boundary (`docs/URL_IMPORT_LIMITATIONS.md`); production untrusted-URL ingestion should route through a server SSRF-pinned fetch endpoint using `dispatchPinnedWebhookRequest`-style pinning.

### Low Severity

7. **L-01 (FIXED) — Unscrubbed Express Malformed JSON / Unhandled Error Fallback (`server/createApp.ts`)**
   - **Defect:** Express 5 default error handler returns HTML error pages when malformed JSON (`SyntaxError`) or unexpected exceptions bypass route try/catch blocks.
   - **Fix:** Added a 4-argument Express error middleware in `server/createApp.ts` returning `{ ok: false, error: { code: 'INVALID_JSON' } }` on 400 JSON syntax errors and scrubbing unexpected errors via `scrubSensitiveData` before returning JSON 500 `INTERNAL_ERROR`.

8. **L-02 (FIXED) — Inconsistent `req.params.workspaceId` vs `req.authorizedWorkspaceId` (`server/api/v1/router.ts`)**
   - **Defect:** `/workspaces/:workspaceId/members` and `/invitations` read `String(req.params.workspaceId)` directly after `requireWorkspaceRole`, whereas other routes used `req.authorizedWorkspaceId!`.
   - **Fix:** Standardized both handlers to read `req.authorizedWorkspaceId!`.

### Informational

9. **I-01 — Client Auth Storage & Rate Limit Persistence:** No `localStorage`/`sessionStorage` is used for app state or tokens; backend session cookies use `HttpOnly; SameSite=Lax` (plus `Secure` when TLS/forwarded-HTTPS). In-memory failed-login rate limiter resets on process restart unless backed by shared Redis/DB store in multi-replica deployments.
10. **I-02 — Repository Uses `bun.lock` + Built-in `node:sqlite`:** Production dependencies (`209` packages) report `0` vulnerabilities; dev-only `vite-plugin-pwa -> workbox-build -> glob/minimatch` carries 4 moderate build-time advisories (see Phase 77 audit).

---

## 3. Targeted Investigation Checklist (1–6)

| Investigation Topic | Outcome |
|---|---|
| 1. DNS resolution & connection-time IP validation (DNS rebinding) | **Fixed** for server webhook dispatch via `resolveAndValidatePinnedAddress` + `dispatchPinnedWebhookRequest` (`node:http`/`https` pinned `lookup`); browser `fetch` gap explicitly documented. |
| 2. PostgreSQL RLS behavior for application DB roles | **Fixed statically in `004`** (`SECURITY DEFINER` helpers break `42P17` recursion; `TO authenticated` explicit); live execution against PostgreSQL remains `STAGING PREPARED` until `DATABASE_URL` is provisioned. |
| 3. Cross-tenant access across every API input & job | Verified on Express/SQLite + fixed cross-tenant `jobs.idempotency_key` collision in v6 (`UNIQUE(workspace_id, idempotency_key)`). |
| 4. Concurrent sync operations & pagination correctness | **Fixed** `/sync/pull` composite keyset pagination (`nextPageCursor`) + verified revision conflict & idempotency mismatch rejection. |
| 5. Workspace deletion during active operations | Verified `deletingWorkspaceIds` + `waitForWorkspaceOperationsToDrain` + entry-time DB pinning in `dexieRepositories.ts` prevent stale writes/split activities. |
| 6. Interrupted migration & recovery behavior | Verified IndexedDB `taskCompletionMigration` atomic rollback + idempotent re-run + malformed metadata recovery, plus SQLite v1–v6 transactional migration. |
