# Phase 36 — Database Reconciliation

## Audited Storage Engines
1. **IndexedDB (Dexie v5 — `src/database/db.ts`):**
   - Stores 29 workspace tables (`businessProfile`, `appSettings`, `clients`, `projects`, `tasks`, `proposals`, `quotations`, `contracts`, `invoices`, `payments`, `financeEntries`, `timeEntries`, `knowledgeDocs`, `documentChunks`, `templates`, `workflowRuns`, `serviceCatalog`, `appointments`, `workspaceGoals`, `activities`, `notifications`, `vaultFiles`, `clientPortalLinks`, `retainers`, `customWorkflows`, `webhooks`, `syncQueue`, `securityAuditLogs`, `savedViews`).
   - Added `autoSyncEnabled`, `syncPaused`, and `syncCursor` to `appSettings` with Zod defaults so pre-existing IndexedDB records remain valid without destructive reset.
2. **Backend SQLite (`server/database/sqliteDb.ts`):**
   - Versioned migrations v1 through v4 inside explicit `BEGIN`/`COMMIT` transactions (`schema_migrations` table).
   - Migration v4 added `sync_checkpoints`, `workspace_invitations`, `password_reset_tokens`, and `payment_webhook_events`.
3. **PostgreSQL / Supabase SQL (`server/database/pgMigrations/`):**
   - `001_postgresql_rls_pgvector.sql` + `002_phase37_40_domains_rls_buckets.sql` align normalized tables, RLS helper functions, and nullable vector metadata with SQLite & Dexie entities.
