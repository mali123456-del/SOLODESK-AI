# PHASE 75 — Authentication, JWT & RLS Verification

**Status Classification:**
- **API Auth, Session Lifecycle & 5-Role RBAC Matrix (Express + SQLite):** `LOCAL VERIFIED`
- **Direct PostgreSQL / Supabase JWT + Live RLS Policy Execution:** `STAGING PREPARED` (**BLOCKED** — external `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DATABASE_URL` absent in runtime)

---

## 1. Local API RBAC & Session Lifecycle Matrix (`LOCAL VERIFIED`)

Verified by automated integration tests in `tests/integration/phase73-76-staging-audit.test.ts` and `tests/integration/phase71-security-tenant-audit.test.ts`:

| Operation | Owner | Admin | Manager | Collaborator | Client Viewer | Non-Member Outsider | Unauthenticated / Revoked |
|---|---|---|---|---|---|---|---|
| `POST /workspaces/:id/members` | `201` Allow | `201` Allow | `403` Deny | `403` Deny | `403` Deny | `403` Deny | `401` Deny |
| `POST /webhooks` / `GET /security/audit/:id` | `200/201` Allow | `200/201` Allow | `403` Deny | `403` Deny | `403` Deny | `403` Deny | `401` Deny |
| `GET /analytics/overview/:id`, `GET /billing/subscription/:id` | `200` Allow | `200` Allow | `200` Allow | `403` Deny | `403` Deny | `403` Deny | `401` Deny |
| `POST /sync/push`, `POST /rag/documents`, `POST /storage/objects` | `200/201` Allow | `200/201` Allow | `200/201` Allow | `200/201` Allow | `403` Deny | `403` Deny | `401` Deny |
| `GET /sync/pull` | `200` Allow | `200` Allow | `200` Allow | `200` Allow | `200` Allow | `403` Deny | `401` Deny |
| `GET /storage/objects` | All classes | All classes | All classes | All classes | `public` / `client_shared` only | `403` Deny | `401` Deny |
| `POST /rag/search` (`requestedScope=internal_only`) | `internal_only` | `internal_only` | `workspace` clamped | `workspace` clamped | `client_portal` clamped | `403` Deny | `401` Deny |
| `POST /jobs/enqueue` (`idempotencyKey`) | Workspace-scoped | Workspace-scoped | Workspace-scoped | Workspace-scoped | `403` Deny | `403` Deny | `401` Deny |

Additional auth checks verified locally:
- Parameter pollution (`?workspaceId=wsB` + body `workspaceId: wsA`, or repeated `?workspaceId=`) returns `400 TENANT_PARAM_MISMATCH` / `400 VALIDATION_ERROR`.
- Logout (`POST /auth/logout`) and password reset (`POST /auth/password-reset/confirm`) immediately invalidate active sessions (`401 UNAUTHORIZED` on subsequent `GET /auth/me`).
- Cross-email workspace invitation hijacking rejected with `400 INVITE_INVALID_OR_EXPIRED`.

---

## 2. Direct PostgreSQL RLS Matrix (`STAGING PREPARED` — Pending Remote Staging DB)

Migration `004_rls_security_definer_functions_and_remaining_tables.sql` resolves the Phase 73 recursion defect (`42P17`) and prepares the exact RLS policies to test as the `authenticated` role once connected to staging PostgreSQL/Supabase:

- `public.is_workspace_member(ws_id UUID)` and `public.has_workspace_role(ws_id UUID, allowed_roles TEXT[])` execute with `SECURITY DEFINER`, `SET search_path = ''`, and `GRANT EXECUTE TO authenticated`.
- `anon` (`PUBLIC`) cannot invoke membership helpers or satisfy `TO authenticated` policies.
- `password_reset_tokens` enforces `FORCE ROW LEVEL SECURITY` with zero permissive client policies (service/server role only).

### Exact Staging SQL Verification Harness (Run After Phase 74 Migration)
```sql
-- Test under low-privilege authenticated role (NEVER postgres/service_role)
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"<OWNER_UUID>","role":"authenticated"}', true);
-- Assert owner reads/writes own workspace and zero cross-tenant rows from Tenant B
ROLLBACK;
```
