# Phase 26 Database Architecture (Dual Offline + SaaS Schema)

**Local Client Storage:** IndexedDB via Dexie `v5` (`IMPLEMENTED AND VERIFIED`)  
**Backend Relational Storage:** Node `node:sqlite` WAL SQLite (`IMPLEMENTED AND VERIFIED`)  
**Hosted Cloud PostgreSQL / RLS / `pgvector` Migration:** `server/database/pgMigrations/001_postgresql_rls_pgvector.sql` (`IMPLEMENTED` SQL artifact; `BLOCKED — EXTERNAL REQUIREMENT` for live Postgres execution without provisioned credentials)

---

## 1. Local Client Database (Dexie v5 — Preserved)

Non-destructive versioned IndexedDB schema continues to serve offline-first SPA users across `clients`, `projects`, `tasks`, `proposals`, `quotations`, `contracts`, `invoices`, `payments`, `financeEntries`, `timeEntries`, `knowledgeDocs`, `documentChunks`, `syncQueue`, `securityAuditLogs`, `vaultFiles`, `clientPortalLinks`, `retainers`, and settings.

## 2. Server SQLite Schema (`server/database/sqliteDb.ts`)

Uses Node.js built-in `node:sqlite` (`DatabaseSync`) with `PRAGMA journal_mode = WAL;` and `PRAGMA foreign_keys = ON;`. Versioned migrations (`schema_migrations` v1–v3) manage 18 tables:

- Identity & Tenancy: `users`, `sessions`, `login_history`, `workspaces`, `workspace_members`
- Incremental Sync: `sync_records` (unique `(workspace_id, entity_type, entity_id)` + optimistic `revision` checks), `sync_tombstones`
- Knowledge & AI: `knowledge_sources`, `knowledge_chunks`, `ai_usage_records`
- Automation & Storage: `vault_objects`, `jobs`, `webhooks`, `webhook_deliveries`
- Commercial & Compliance: `subscriptions`, `support_requests`, `audit_logs`, `portal_access_logs`

## 3. PostgreSQL + RLS + `pgvector` Migration Artifact

`server/database/pgMigrations/001_postgresql_rls_pgvector.sql` defines PostgreSQL-ready equivalents including `vector(128)` / embedding storage readiness and Row-Level Security policies scoped to `current_setting('app.current_workspace_id')`. Execution against a remote PostgreSQL/Supabase cluster remains `BLOCKED — EXTERNAL REQUIREMENT` until connection strings are provisioned.
