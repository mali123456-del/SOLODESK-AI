-- SOLODESK AI — Phase 96–97 PostgreSQL / Supabase Migration 006
-- Adds server-side privacy_consents parity with strict RLS and database-level immutability trigger for audit_logs.

CREATE TABLE IF NOT EXISTS privacy_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('local_storage', 'ai_processing', 'cloud_sync', 'crash_telemetry')),
  granted BOOLEAN NOT NULL DEFAULT false,
  version TEXT NOT NULL DEFAULT '1.0',
  updated_by_user_id UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, consent_type)
);

CREATE INDEX IF NOT EXISTS idx_privacy_consents_ws
  ON privacy_consents(workspace_id, consent_type);

ALTER TABLE privacy_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_consents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS privacy_consents_member_read ON privacy_consents;
DROP POLICY IF EXISTS privacy_consents_admin_mutate ON privacy_consents;

CREATE POLICY privacy_consents_member_read ON privacy_consents
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY privacy_consents_admin_mutate ON privacy_consents
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- Enforce append-only immutability on audit_logs at the database trigger layer
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only; UPDATE and DELETE are prohibited';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_mutation();
