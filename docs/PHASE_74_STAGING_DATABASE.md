# PHASE 74 — PostgreSQL / Supabase Staging Database Integration

**Status Classification:** `STAGING PREPARED` (Migration SQL chain `001 -> 002 -> 003 -> 004` audited, repaired, and statically validated; **live remote PostgreSQL execution is BLOCKED** because no external `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `psql`, or `supabase` CLI exists in this container).

---

## 1. Environment & Tooling Check (Executed)

| Resource | Status in Runtime | Impact |
|---|---|---|
| `DATABASE_URL` | `UNSET` | Cannot connect to remote PostgreSQL/Supabase |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | `UNSET` | Cannot test Supabase Auth/PostgREST/Storage |
| `psql`, `supabase`, `pg_isready` CLIs | `NOT_FOUND` | Cannot execute live `psql` schema/policy tests locally |
| Embedded SQLite (`node:sqlite` WAL + `PRAGMA foreign_keys = ON`) | **ACTIVE (`v1`–`v6`)** | Verified locally in full integration suite |

---

## 2. Migration Ordering & Inventory (`server/database/pgMigrations/`)

Migrations must be applied in strict lexicographical order on a fresh or existing staging database:

1. `001_postgresql_rls_pgvector.sql` — Enables `pgcrypto` and `vector`, creates `workspaces`, `workspace_members`, `sync_records`, `knowledge_chunks`, indexes, and initial RLS enablement.
2. `002_phase37_40_domains_rls_buckets.sql` — Adds embedding provenance columns on `knowledge_chunks`, removes fixed 128-dim NOT NULL requirement, creates `workspace_invitations`, `password_reset_tokens`, `sync_checkpoints`, `workflow_executions`, `payment_webhook_events`, `ai_agents`, `dataset_registry`, `entitlements`, and enables RLS.
3. `003_rls_hardening_and_sync_idempotency.sql` — Creates `sync_tombstones`, `sync_idempotency_keys`, `vault_objects`, `audit_logs`, `support_requests`, and enforces `FORCE ROW LEVEL SECURITY` across all tenant & auth-sensitive tables.
4. `004_rls_security_definer_functions_and_remaining_tables.sql` — **Added in Phase 73**:
   - Fixes `42P17` self-referential RLS recursion on `workspace_members` by introducing `public.is_workspace_member(UUID)` and `public.has_workspace_role(UUID, TEXT[])` (`SECURITY DEFINER`, `STABLE`, `SET search_path = ''`, granted strictly `TO authenticated`).
   - Adds missing SQLite parity tables: `knowledge_sources`, `jobs` (`UNIQUE (workspace_id, idempotency_key)`), `webhooks`, `webhook_deliveries` with `ENABLE` + `FORCE ROW LEVEL SECURITY`.
   - Drops legacy/recursive policies idempotently (`DROP POLICY IF EXISTS`) and recreates all tenant policies explicitly `TO authenticated`.

---

## 3. Staging Provisioning & Rollback Runbook (To Execute Once Credentials Are Supplied)

```bash
# 1. Verify connectivity to disposable STAGING database (NEVER production)
export STAGING_DATABASE_URL="postgres://..."
psql "$STAGING_DATABASE_URL" -c "SELECT version();"

# 2. Apply migrations 001 -> 004 sequentially with stop-on-error inside psql
for f in server/database/pgMigrations/00*.sql; do
  echo "Applying $f ..."
  psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f "$f"
done

# 3. Verify extensions, forced RLS flags, functions, and policies
psql "$STAGING_DATABASE_URL" -c "SELECT extname, extversion FROM pg_extension WHERE extname IN ('pgcrypto','vector');"
psql "$STAGING_DATABASE_URL" -c "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND relkind='r' ORDER BY 1;"
psql "$STAGING_DATABASE_URL" -c "SELECT tablename, policyname, roles, cmd FROM pg_policies WHERE schemaname='public' ORDER BY 1,2;"
```

### Safe Rollback Strategy
- Each file runs under `--single-transaction` (`ON_ERROR_STOP=1`), so a failure in `004` rolls back automatically without leaving partial functions or policies.
- For pre-migration safety on an existing staging instance, take a logical snapshot first (`pg_dump --format=custom --file=staging_pre_004.dump "$STAGING_DATABASE_URL"`), and restore via `pg_restore --clean --if-exists`.

---

## 4. Known External Blockers
- Live PostgreSQL connection, `pgvector` extension privilege verification, Supabase `auth.uid()` JWT claim context, and live `001 -> 004` execution on a managed PostgreSQL instance cannot run inside this isolated container until staging credentials are provided.
