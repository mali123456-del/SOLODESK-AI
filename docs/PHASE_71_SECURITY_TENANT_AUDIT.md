# Phase 71 — Security & SaaS Tenant Isolation Audit

**Status:** `LOCALLY VERIFIED` (Express/SQLite + SSRF + Agent RBAC + Log Scrubbing tests passed; PostgreSQL/Supabase RLS SQL verified by static audit only — `BLOCKED — EXTERNAL REQUIREMENT` for live execution)

> **Explicit Assurance Disclosure:** Passing automated unit and integration tests does **NOT** constitute security certification, formal OWASP ASVS 5.0 compliance attestation, or third-party penetration testing clearance.

---

## 1. Files Inspected & Modified

### Inspected
- `server/middleware/auth.ts`
- `server/auth/authService.ts`
- `server/api/v1/router.ts`
- `server/ai/geminiGateway.ts`
- `server/rag/ragService.ts`
- `server/jobs/jobRunner.ts`
- `server/monitoring/telemetry.ts`
- `server/database/pgMigrations/001_postgresql_rls_pgvector.sql`
- `server/database/pgMigrations/002_phase37_40_domains_rls_buckets.sql`
- `src/security/urlPolicy.ts`
- `src/ai/agents/agentRegistry.ts`
- `src/ai/agent/permissions.ts`

### Modified / Created
- `server/middleware/auth.ts` (added `authorizedWorkspaceId`, array/non-string rejection, `TENANT_PARAM_MISMATCH` cross-field check)
- `server/api/v1/router.ts` (enforced `authorizedWorkspaceId` across handlers, added auth/membership/role guard on `POST /ai/generate` when `workspaceId` is supplied, added HTTPS `Secure` cookie attribute, added per-IP rate limiting on `POST /portal/audit`)
- `server/ai/geminiGateway.ts` (scrubbed provider SDK error strings through `scrubSensitiveData`)
- `server/jobs/jobRunner.ts` (added `redirect: 'error'` and pre-dispatch Node DNS private-IP verification on outbound webhooks)
- `server/monitoring/telemetry.ts` (expanded `SENSITIVE_KEY_RE` and inline token/API-key regex scrubbing)
- `src/security/urlPolicy.ts` (fixed WHATWG hex-normalized IPv4-mapped IPv6 SSRF bypass)
- `server/database/pgMigrations/003_rls_hardening_and_sync_idempotency.sql` (new hardened RLS migration — not executed remotely)
- `tests/integration/phase71-security-tenant-audit.test.ts` (new automated security & tenant isolation test suite)

---

## 2. Critical Vulnerabilities Found & Remediated

| Severity | Finding | Fix Applied |
| :--- | :--- | :--- |
| **High** | **IPv4-mapped IPv6 SSRF Bypass (`urlPolicy.ts`):** WHATWG `new URL('http://[::ffff:127.0.0.1]/')` normalizes `hostname` to `"[::ffff:7f00:1]"` hex pairs, bypassing `isPrivateOrReservedIpv4()`. | Decoded both dotted (`::ffff:a.b.c.d`) and colon-hex (`::ffff:XXXX:XXXX`, `0:0:0:0:0:ffff:XXXX:XXXX`) forms into dotted IPv4 before checking private/loopback/metadata CIDRs. |
| **High** | **Tenant Parameter Pollution (`middleware/auth.ts`):** `req.params.workspaceId \|\| req.body?.workspaceId \|\| req.query?.workspaceId` allowed conflicting `workspaceId` values across route/query/body or Express query array coercion (`?workspaceId=a&workspaceId=b`). | Added `resolveCanonicalWorkspaceId()`: rejects non-string/array `workspaceId` with `400 VALIDATION_ERROR`, rejects mismatched multi-source values with `400 TENANT_PARAM_MISMATCH`, and attaches `req.authorizedWorkspaceId` as the single source of truth for all handlers. |
| **High** | **Unauthenticated/Cross-Tenant `/ai/generate` Metering Abuse (`router.ts`):** Passing `workspaceId` in `POST /api/v1/ai/generate` could meter `ai_usage_records` and increment `subscriptions.ai_tokens_used_month` on an arbitrary workspace without verifying membership or role. | Enforced active session (`401`), workspace membership (`403 TENANT_ACCESS_DENIED`), and write-role check (`403 INSUFFICIENT_ROLE`, blocking `client_viewer`) whenever `workspaceId` is provided. |
| **High** | **PostgreSQL / Supabase RLS Policy Gaps (`001` & `002`):** `password_reset_tokens` lacked `ENABLE ROW LEVEL SECURITY`; `workspaces`, `workspace_members`, and `workspace_invitations` lacked write/read policies; `sync_records`, `sync_checkpoints`, `workflow_executions` used `FOR ALL USING` without explicit `WITH CHECK`; `sync_tombstones`, `sync_idempotency_keys`, `vault_objects`, `audit_logs`, `support_requests` were missing from PG migrations. | Authored `003_rls_hardening_and_sync_idempotency.sql` enabling + forcing RLS (`FORCE ROW LEVEL SECURITY`), adding missing tenant tables, locking down `password_reset_tokens` with zero client policies, and scoping read vs write `USING`/`WITH CHECK` policies with `(SELECT auth.uid())`. |
| **Medium** | **Partial Secret Scrubbing in Telemetry (`telemetry.ts` & `geminiGateway.ts`):** `scrubSensitiveData` missed camelCase secret keys (`sessionToken`, `signingSecret`) and inline secrets embedded inside error strings (`Bearer sd_...`, `AIza...`, `sdwh_...`). | Expanded key regex and added inline token/key redaction + scrubbed external Gemini SDK error strings before surfacing `GatewayError`. |
| **Medium** | **Outbound Webhook Redirects & DNS Rebinding (`jobRunner.ts`):** Webhook `fetch` allowed default redirect following and skipped runtime DNS resolution checks on hostnames. | Added `redirect: 'error'` on outbound webhook requests and added `dns.lookup(..., { all: true })` private-IP verification before unmocked live dispatches. |
| **Low** | **Unthrottled `/portal/audit` Log Insertion (`router.ts`):** Public portal telemetry endpoint lacked per-IP rate limiting. | Added per-IP sliding window limit (`25 req/min`, returning `429 RATE_LIMITED`) and minimum `tokenPrefix` validation. |

---

## 3. Security Limitations & External Requirements

1. **Client-Side Browser URL Importer DNS Rebinding:** Browser `fetch()` inside SPA client (`src/integrations/crawler/urlImporter.ts`) cannot inspect resolved DNS A/AAAA IPs prior to connection due to browser sandbox API limits; server-side proxying or DNS pinning is required for untrusted SSRF protection against DNS rebinding.
2. **PostgreSQL RLS Execution (`BLOCKED — EXTERNAL REQUIREMENT`):** `003_rls_hardening_and_sync_idempotency.sql` has not been executed against a live PostgreSQL/Supabase cluster (`psql` / Supabase Auth `auth.uid()` harness) because no database credentials exist locally.
3. **Authentication Session Transport:** Over plain HTTP on local development (`http://127.0.0.1:3000`), `Set-Cookie` omits `; Secure` so local browser & Playwright testing functions; TLS termination with `X-Forwarded-Proto: https` in staging/production automatically enables `; Secure`.
4. **OWASP ASVS Alignment Note:** Controls tested locally map cleanly to ASVS V2 (scrypt + session revocation), V4 (RBAC + tenant binding), V5 (Zod input validation + SSRF + log scrubbing), and V10 (no client bundle secrets), but have **not** undergone independent penetration testing.
