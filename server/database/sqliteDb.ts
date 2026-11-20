import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface MigrationRecord {
  version: number;
  name: string;
  sql: string;
}

const MIGRATIONS: MigrationRecord[] = [
  {
    version: 1,
    name: '001_initial_saas_auth_tenants_sync',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        ip_address TEXT NOT NULL DEFAULT '',
        user_agent TEXT NOT NULL DEFAULT '',
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS login_history (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        user_id TEXT NOT NULL DEFAULT '',
        success INTEGER NOT NULL,
        ip_address TEXT NOT NULL DEFAULT '',
        reason TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        owner_user_id TEXT NOT NULL REFERENCES users(id),
        plan_tier TEXT NOT NULL DEFAULT 'free',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspace_members (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'collaborator', 'client_viewer')),
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        UNIQUE(workspace_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS sync_records (
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        operation TEXT NOT NULL DEFAULT 'upsert',
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (workspace_id, entity_type, entity_id)
      );

      CREATE TABLE IF NOT EXISTS sync_tombstones (
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        deleted_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, entity_type, entity_id)
      );
    `,
  },
  {
    version: 2,
    name: '002_storage_rag_jobs_webhooks',
    sql: `
      CREATE TABLE IF NOT EXISTS vault_objects (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        classification TEXT NOT NULL CHECK (classification IN ('public', 'client_shared', 'internal', 'confidential')),
        content_base64 TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS knowledge_sources (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        collection TEXT NOT NULL DEFAULT 'General',
        access_scope TEXT NOT NULL CHECK (access_scope IN ('workspace', 'client_portal', 'internal_only')),
        license_or_rights TEXT NOT NULL DEFAULT '',
        content_hash TEXT NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'note',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        document_title TEXT NOT NULL,
        access_scope TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        keywords_json TEXT NOT NULL,
        embedding_json TEXT NOT NULL,
        vector_model TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        job_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
        idempotency_key TEXT NOT NULL UNIQUE,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT NOT NULL DEFAULT '',
        run_at TEXT NOT NULL,
        executed_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS webhooks (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        event_type TEXT NOT NULL,
        secret_hash TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        last_status TEXT NOT NULL DEFAULT '',
        last_attempt_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id TEXT PRIMARY KEY,
        webhook_id TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        delivery_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        status_code INTEGER NOT NULL DEFAULT 0,
        ok INTEGER NOT NULL DEFAULT 0,
        error_message TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 3,
    name: '003_billing_ai_metering_audit_support',
    sql: `
      CREATE TABLE IF NOT EXISTS subscriptions (
        workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
        plan_tier TEXT NOT NULL DEFAULT 'free',
        billing_provider TEXT NOT NULL DEFAULT 'none_configured',
        billing_status TEXT NOT NULL DEFAULT 'free_active',
        seat_count INTEGER NOT NULL DEFAULT 1,
        ai_tokens_used_month INTEGER NOT NULL DEFAULT 0,
        sync_ops_month INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ai_usage_records (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL DEFAULT '',
        agent_id TEXT NOT NULL DEFAULT 'copilot',
        model TEXT NOT NULL,
        prompt_chars INTEGER NOT NULL DEFAULT 0,
        completion_chars INTEGER NOT NULL DEFAULT 0,
        estimated_cost_usd REAL NOT NULL DEFAULT 0,
        latency_ms REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ok',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        actor_user_id TEXT NOT NULL DEFAULT 'system',
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
        detail TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS portal_access_logs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        token_prefix TEXT NOT NULL,
        valid INTEGER NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        ip_address TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS support_requests (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        subject TEXT NOT NULL,
        details TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 4,
    name: '004_checkpoints_invites_resets_payment_webhooks',
    sql: `
      CREATE TABLE IF NOT EXISTS sync_checkpoints (
        workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
        last_cursor TEXT NOT NULL DEFAULT '',
        last_synced_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspace_invitations (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'collaborator', 'client_viewer')),
        token_hash TEXT NOT NULL UNIQUE,
        invited_by_user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        accepted_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS payment_webhook_events (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        provider_event_id TEXT NOT NULL UNIQUE,
        amount_cents INTEGER NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        verified INTEGER NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL,
        received_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 5,
    name: '005_sync_idempotency_keys',
    sql: `
      CREATE TABLE IF NOT EXISTS sync_idempotency_keys (
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        idempotency_key TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, idempotency_key)
      );
    `,
  },
  {
    version: 6,
    name: '006_scope_jobs_idempotency_per_workspace',
    sql: `
      CREATE TABLE jobs_v6 (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        job_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
        idempotency_key TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT NOT NULL DEFAULT '',
        run_at TEXT NOT NULL,
        executed_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        UNIQUE(workspace_id, idempotency_key)
      );
      INSERT INTO jobs_v6 (
        id, workspace_id, job_type, payload_json, status, idempotency_key,
        attempts, last_error, run_at, executed_at, created_at
      )
      SELECT
        id, workspace_id, job_type, payload_json, status, idempotency_key,
        attempts, last_error, run_at, executed_at, created_at
      FROM jobs;
      DROP TABLE jobs;
      ALTER TABLE jobs_v6 RENAME TO jobs;
    `,
  },
];

export function openSqliteDatabase(dbPath = './data/solodesk-saas.sqlite'): DatabaseSync {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(path.resolve(dbPath));
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db.prepare('SELECT version FROM schema_migrations').all() as Array<{
    version: number;
  }>;
  const applied = new Set(appliedRows.map((r) => r.version));

  const insertMigration = db.prepare(
    'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
  );

  for (const mig of MIGRATIONS) {
    if (applied.has(mig.version)) continue;
    db.exec('BEGIN;');
    try {
      db.exec(mig.sql);
      insertMigration.run(mig.version, mig.name, new Date().toISOString());
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  return db;
}

export function getAppliedMigrations(db: DatabaseSync): Array<{ version: number; name: string }> {
  return db.prepare('SELECT version, name FROM schema_migrations ORDER BY version ASC').all() as Array<{
    version: number;
    name: string;
  }>;
}
