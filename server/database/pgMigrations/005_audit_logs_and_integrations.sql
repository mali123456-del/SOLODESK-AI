-- SOLODESK AI — Phase 82–95 PostgreSQL / Supabase Migration 005
-- Adds server-side parity for voice_notes, integration_connections, structured audit_logs columns,
-- composite performance indexes, and strict tenant RLS with immutable audit enforcement.

CREATE TABLE IF NOT EXISTS voice_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_type TEXT NOT NULL CHECK (parent_type IN ('project', 'task')),
  parent_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Voice Note',
  mime_type TEXT NOT NULL CHECK (mime_type IN ('audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/mpeg')),
  duration_seconds NUMERIC(10, 2) NOT NULL DEFAULT 0,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5000000),
  content_base64 TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integration_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'automation',
  display_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'disconnected',
  account_label TEXT NOT NULL DEFAULT '',
  endpoint_url TEXT NOT NULL DEFAULT '',
  scopes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_checked_at TIMESTAMPTZ,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider)
);

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource_type TEXT NOT NULL DEFAULT '';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource_id TEXT NOT NULL DEFAULT '';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS outcome TEXT NOT NULL DEFAULT 'success';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_sync_records_ws_updated
  ON sync_records(workspace_id, updated_at, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_jobs_ws_status_run
  ON jobs(workspace_id, status, run_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_ws_created
  ON ai_usage_records(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_ws_created
  ON webhook_deliveries(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ws_created
  ON audit_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_notes_ws_parent
  ON voice_notes(workspace_id, parent_type, parent_id);

ALTER TABLE voice_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_notes FORCE ROW LEVEL SECURITY;
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_connections FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS voice_notes_member_read ON voice_notes;
DROP POLICY IF EXISTS voice_notes_writer_insert ON voice_notes;
DROP POLICY IF EXISTS voice_notes_writer_delete ON voice_notes;
DROP POLICY IF EXISTS integration_connections_member_read ON integration_connections;
DROP POLICY IF EXISTS integration_connections_admin_mutate ON integration_connections;
DROP POLICY IF EXISTS audit_logs_member_insert ON audit_logs;

CREATE POLICY voice_notes_member_read ON voice_notes
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY voice_notes_writer_insert ON voice_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'collaborator']));

CREATE POLICY voice_notes_writer_delete ON voice_notes
  FOR DELETE TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'collaborator']));

CREATE POLICY integration_connections_member_read ON integration_connections
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY integration_connections_admin_mutate ON integration_connections
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- Append-only audit logs: members/service insert only, admins read, zero UPDATE/DELETE policies for client roles.
CREATE POLICY audit_logs_member_insert ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));
