# Phase 37 — PostgreSQL Schema & Incremental Migrations

## Migration Files
- `server/database/pgMigrations/001_postgresql_rls_pgvector.sql`: Core tenants (`workspaces`, `users`, `workspace_members`), CRM/finance JSONB sync tables (`sync_records`, `sync_outbox`), `knowledge_chunks`, `audit_logs`, `webhooks`, `subscriptions`, and helper `app.current_user_id()`.
- `server/database/pgMigrations/002_phase37_40_domains_rls_buckets.sql`: Idempotent incremental migration (`IF NOT EXISTS`) adding:
  - `workspace_invitations` (token hash, role, expiry, accepted timestamp)
  - `password_reset_tokens` (token hash, expiry, used timestamp)
  - `sync_checkpoints` (per-user/device monotonic cursor tracking)
  - `workflow_executions` (automation audit trail)
  - `payment_webhook_events` (provider event idempotency + signature verified flag)
  - `ai_agents` (governance role & timeout/token budget policy)
  - `dataset_registry` (license, PII status, SHA-256 checksum)
  - `entitlements` (plan tier enforcement)
  - Relaxes `knowledge_chunks.embedding` to nullable alongside `embedding_provider`, `embedding_model`, and `embedding_dimensions`.

## Verification Status
- Schema structure validated; SQLite parity tested in `tests/integration/phase36-60-backend.test.ts`.
- **Remote Cloud Execution Status:** `BLOCKED — EXTERNAL REQUIREMENT` (no remote Postgres/Supabase credentials inside sandbox).
