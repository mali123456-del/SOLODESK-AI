-- SOLODESK AI — Phase 73–75 PostgreSQL / Supabase RLS Recursion Fix & Remaining Tables
-- Fixes HIGH Phase 73 audit finding: self-referential workspace_members RLS policies in 003
-- trigger 42P17 ("infinite recursion detected in policy for relation workspace_members") in live PostgreSQL.
-- Adds SECURITY DEFINER helper functions (search_path = '') to evaluate membership/roles safely,
-- creates remaining backend tables (knowledge_sources, jobs, webhooks, webhook_deliveries) with FORCE RLS,
-- and scopes all tenant policies explicitly TO authenticated with DROP POLICY IF EXISTS idempotency.

-- 1. Schema-qualified SECURITY DEFINER membership/role helpers (break self-referential RLS recursion)
CREATE OR REPLACE FUNCTION public.is_workspace_member(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members m
    WHERE m.workspace_id = ws_id
      AND m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(ws_id UUID, allowed_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members m
    WHERE m.workspace_id = ws_id
      AND m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
      AND m.role = ANY (allowed_roles)
  );
$$;

REVOKE ALL ON FUNCTION public.is_workspace_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_workspace_role(UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_workspace_role(UUID, TEXT[]) TO authenticated;

-- 2. Remaining backend tables parity with SQLite v6
CREATE TABLE IF NOT EXISTS knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  collection TEXT NOT NULL DEFAULT 'General',
  access_scope TEXT NOT NULL CHECK (access_scope IN ('workspace', 'client_portal', 'internal_only')),
  license_or_rights TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'note',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  idempotency_key TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  event_type TEXT NOT NULL,
  secret_hash TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_status TEXT NOT NULL DEFAULT '',
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  delivery_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status_code INTEGER NOT NULL DEFAULT 0,
  ok BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks FORCE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries FORCE ROW LEVEL SECURITY;

-- 3. Replace recursive / un-scoped policies cleanly with helper-backed TO authenticated policies
DROP POLICY IF EXISTS workspace_member_read ON workspaces;
DROP POLICY IF EXISTS workspaces_owner_insert ON workspaces;
DROP POLICY IF EXISTS workspaces_admin_update ON workspaces;
DROP POLICY IF EXISTS workspace_members_member_read ON workspace_members;
DROP POLICY IF EXISTS workspace_members_admin_write ON workspace_members;
DROP POLICY IF EXISTS workspace_invitations_admin_manage ON workspace_invitations;
DROP POLICY IF EXISTS sync_records_member_read ON sync_records;
DROP POLICY IF EXISTS sync_records_writer_mutate ON sync_records;
DROP POLICY IF EXISTS sync_tombstones_writer_mutate ON sync_tombstones;
DROP POLICY IF EXISTS sync_idempotency_keys_writer ON sync_idempotency_keys;
DROP POLICY IF EXISTS sync_checkpoints_member_read ON sync_checkpoints;
DROP POLICY IF EXISTS sync_checkpoints_writer_mutate ON sync_checkpoints;
DROP POLICY IF EXISTS knowledge_chunks_scope_isolation ON knowledge_chunks;
DROP POLICY IF EXISTS knowledge_chunks_writer_mutate ON knowledge_chunks;
DROP POLICY IF EXISTS vault_objects_scope_read ON vault_objects;
DROP POLICY IF EXISTS vault_objects_writer_mutate ON vault_objects;
DROP POLICY IF EXISTS workflow_executions_member_read ON workflow_executions;
DROP POLICY IF EXISTS workflow_executions_writer_mutate ON workflow_executions;
DROP POLICY IF EXISTS payment_webhook_events_admin_read ON payment_webhook_events;
DROP POLICY IF EXISTS entitlements_member_read ON entitlements;
DROP POLICY IF EXISTS audit_logs_admin_read ON audit_logs;
DROP POLICY IF EXISTS support_requests_member_access ON support_requests;

-- Workspaces
CREATE POLICY workspace_member_read ON workspaces
  FOR SELECT TO authenticated
  USING (owner_user_id = (SELECT auth.uid()) OR public.is_workspace_member(id));

CREATE POLICY workspaces_owner_insert ON workspaces
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = (SELECT auth.uid()));

CREATE POLICY workspaces_admin_update ON workspaces
  FOR UPDATE TO authenticated
  USING (public.has_workspace_role(id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_workspace_role(id, ARRAY['owner', 'admin']));

-- Workspace members (recursion-free via SECURITY DEFINER helpers)
CREATE POLICY workspace_members_member_read ON workspace_members
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_workspace_member(workspace_id));

CREATE POLICY workspace_members_admin_write ON workspace_members
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- Invitations
CREATE POLICY workspace_invitations_admin_manage ON workspace_invitations
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- Sync tables
CREATE POLICY sync_records_member_read ON sync_records
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY sync_records_writer_mutate ON sync_records
  FOR INSERT TO authenticated
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'collaborator']));

CREATE POLICY sync_records_writer_update ON sync_records
  FOR UPDATE TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'collaborator']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'collaborator']));

CREATE POLICY sync_records_writer_delete ON sync_records
  FOR DELETE TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'collaborator']));

CREATE POLICY sync_tombstones_member_read ON sync_tombstones
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY sync_tombstones_writer_mutate ON sync_tombstones
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'collaborator']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'collaborator']));

CREATE POLICY sync_idempotency_keys_writer ON sync_idempotency_keys
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'collaborator']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'collaborator']));

CREATE POLICY sync_checkpoints_member_read ON sync_checkpoints
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY sync_checkpoints_writer_mutate ON sync_checkpoints
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'collaborator']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'collaborator']));

-- RAG knowledge sources & chunks (enforces client_portal / workspace / internal_only RBAC)
CREATE POLICY knowledge_sources_scope_read ON knowledge_sources
  FOR SELECT TO authenticated
  USING (
    (access_scope = 'client_portal' AND public.is_workspace_member(workspace_id))
    OR (access_scope = 'workspace' AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'collaborator']))
    OR (access_scope = 'internal_only' AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']))
  );

CREATE POLICY knowledge_sources_writer_mutate ON knowledge_sources
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'collaborator']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'collaborator']));

CREATE POLICY knowledge_chunks_scope_isolation ON knowledge_chunks
  FOR SELECT TO authenticated
  USING (
    (access_scope = 'client_portal' AND public.is_workspace_member(workspace_id))
    OR (access_scope = 'workspace' AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'collaborator']))
    OR (access_scope = 'internal_only' AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']))
  );

CREATE POLICY knowledge_chunks_writer_mutate ON knowledge_chunks
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'collaborator']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'collaborator']));

-- Vault objects
CREATE POLICY vault_objects_scope_read ON vault_objects
  FOR SELECT TO authenticated
  USING (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'collaborator'])
    OR (classification IN ('public', 'client_shared') AND public.is_workspace_member(workspace_id))
  );

CREATE POLICY vault_objects_writer_mutate ON vault_objects
  FOR INSERT TO authenticated
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'collaborator']));

-- Jobs & Webhooks
CREATE POLICY jobs_member_read ON jobs
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY jobs_writer_insert ON jobs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'collaborator']));

CREATE POLICY jobs_admin_mutate ON jobs
  FOR UPDATE TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

CREATE POLICY webhooks_admin_manage ON webhooks
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

CREATE POLICY webhook_deliveries_admin_read ON webhook_deliveries
  FOR SELECT TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- Workflows, billing, audit, support
CREATE POLICY workflow_executions_member_read ON workflow_executions
  FOR SELECT TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'collaborator']));

CREATE POLICY workflow_executions_writer_mutate ON workflow_executions
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY payment_webhook_events_admin_read ON payment_webhook_events
  FOR SELECT TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

CREATE POLICY entitlements_member_read ON entitlements
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY audit_logs_admin_read ON audit_logs
  FOR SELECT TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

CREATE POLICY support_requests_member_access ON support_requests
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.is_workspace_member(workspace_id))
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.is_workspace_member(workspace_id));
