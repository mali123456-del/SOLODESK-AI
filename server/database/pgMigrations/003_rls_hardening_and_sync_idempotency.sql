-- SOLODESK AI — Phase 71 PostgreSQL / Supabase RLS Hardening & Sync Idempotency Migration
-- Covers sync tombstones/idempotency tables, remaining tenant tables, explicit WITH CHECK clauses,
-- password_reset_tokens RLS lockdown, and role-scoped read/write policies.
-- NOTE: Requires live PostgreSQL/Supabase deployment with pgcrypto/vector & auth.uid() to execute
-- (BLOCKED — EXTERNAL REQUIREMENT locally; DO NOT claim verified until executed against staging).

CREATE TABLE IF NOT EXISTS sync_tombstones (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS sync_idempotency_keys (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS vault_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('public', 'client_shared', 'internal', 'confidential')),
  storage_path TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL DEFAULT 'system',
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  detail TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable & force RLS across all tenant and auth-sensitive tables
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_members FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_records FORCE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_checkpoints FORCE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_webhook_events FORCE ROW LEVEL SECURITY;
ALTER TABLE entitlements FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_tombstones ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_tombstones FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_idempotency_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE vault_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_objects FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE support_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_requests FORCE ROW LEVEL SECURITY;

-- Replace permissive/missing policies with explicit role + WITH CHECK enforcement
DROP POLICY IF EXISTS sync_records_tenant_isolation ON sync_records;
DROP POLICY IF EXISTS sync_checkpoints_tenant_isolation ON sync_checkpoints;
DROP POLICY IF EXISTS workflow_executions_tenant_isolation ON workflow_executions;

CREATE POLICY workspaces_owner_insert ON workspaces
  FOR INSERT WITH CHECK (owner_user_id = (SELECT auth.uid()));

CREATE POLICY workspaces_admin_update ON workspaces
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = workspaces.id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = workspaces.id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin')
    )
  );

CREATE POLICY workspace_members_member_read ON workspace_members
  FOR SELECT USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = workspace_members.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
    )
  );

CREATE POLICY workspace_members_admin_write ON workspace_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = workspace_members.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = workspace_members.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin')
    )
  );

CREATE POLICY workspace_invitations_admin_manage ON workspace_invitations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = workspace_invitations.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = workspace_invitations.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin')
    )
  );

CREATE POLICY sync_records_member_read ON sync_records
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = sync_records.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
    )
  );

CREATE POLICY sync_records_writer_mutate ON sync_records
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = sync_records.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin', 'manager', 'collaborator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = sync_records.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin', 'manager', 'collaborator')
    )
  );

CREATE POLICY sync_tombstones_writer_mutate ON sync_tombstones
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = sync_tombstones.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin', 'manager', 'collaborator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = sync_tombstones.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin', 'manager', 'collaborator')
    )
  );

CREATE POLICY sync_idempotency_keys_writer ON sync_idempotency_keys
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = sync_idempotency_keys.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin', 'manager', 'collaborator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = sync_idempotency_keys.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin', 'manager', 'collaborator')
    )
  );

CREATE POLICY sync_checkpoints_member_read ON sync_checkpoints
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = sync_checkpoints.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
    )
  );

CREATE POLICY sync_checkpoints_writer_mutate ON sync_checkpoints
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = sync_checkpoints.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin', 'manager', 'collaborator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = sync_checkpoints.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin', 'manager', 'collaborator')
    )
  );

CREATE POLICY knowledge_chunks_writer_mutate ON knowledge_chunks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = knowledge_chunks.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin', 'manager', 'collaborator')
    )
  );

CREATE POLICY vault_objects_scope_read ON vault_objects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = vault_objects.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND (
          m.role IN ('owner', 'admin', 'manager', 'collaborator')
          OR vault_objects.classification IN ('public', 'client_shared')
        )
    )
  );

CREATE POLICY vault_objects_writer_mutate ON vault_objects
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = vault_objects.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin', 'manager', 'collaborator')
    )
  );

CREATE POLICY workflow_executions_member_read ON workflow_executions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = workflow_executions.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin', 'manager', 'collaborator')
    )
  );

CREATE POLICY workflow_executions_writer_mutate ON workflow_executions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = workflow_executions.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = workflow_executions.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin', 'manager')
    )
  );

CREATE POLICY audit_logs_admin_read ON audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = audit_logs.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin')
    )
  );

CREATE POLICY support_requests_member_access ON support_requests
  FOR ALL
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = support_requests.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = support_requests.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
    )
  );

-- Note: password_reset_tokens intentionally has ZERO permissive RLS policies so only
-- privileged server-side roles (bypassing RLS) can issue or redeem reset tokens.
