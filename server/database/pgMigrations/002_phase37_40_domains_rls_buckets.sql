-- SOLODESK AI — Phase 37–40 Hosted PostgreSQL / Supabase Incremental Migration
-- Covers missing multi-tenant domains, sync checkpoints, invitations, reset tokens,
-- payment webhooks, AI agents, datasets, private storage bucket policies, and RLS.
-- Execution against remote Supabase/PostgreSQL requires provisioned DB credentials (BLOCKED — EXTERNAL REQUIREMENT locally).

ALTER TABLE knowledge_chunks
  ADD COLUMN IF NOT EXISTS embedding_provider TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS embedding_model TEXT NOT NULL DEFAULT 'lexical_hash_non_neural',
  ADD COLUMN IF NOT EXISTS embedding_dimensions INTEGER NOT NULL DEFAULT 0;

-- Remove misleading fixed 128-dim vector requirement until an external embedding model dimension is configured:
ALTER TABLE knowledge_chunks
  ALTER COLUMN embedding DROP NOT NULL;

CREATE TABLE IF NOT EXISTS workspace_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'collaborator', 'client_viewer')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by_user_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_checkpoints (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  last_cursor TEXT NOT NULL DEFAULT '',
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  workflow_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_approval', 'executed', 'rejected', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 1,
  summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('payfast_pk', 'safepay', 'jazzcash', 'stripe')),
  provider_event_id TEXT NOT NULL UNIQUE,
  amount_cents BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  verified INTEGER NOT NULL DEFAULT 0,
  payload_json JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  autonomy_class TEXT NOT NULL CHECK (autonomy_class IN ('read_only', 'draft_only', 'approval_required')),
  timeout_ms INTEGER NOT NULL DEFAULT 15000,
  token_budget INTEGER NOT NULL DEFAULT 4096,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dataset_registry (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  license TEXT NOT NULL,
  commercial_use_status TEXT NOT NULL,
  redistribution_status TEXT NOT NULL DEFAULT 'internal_only',
  sha256_checksum TEXT NOT NULL DEFAULT '',
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entitlements (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_tier TEXT NOT NULL DEFAULT 'free',
  max_seats INTEGER NOT NULL DEFAULT 1,
  ai_monthly_token_limit INTEGER NOT NULL DEFAULT 50000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row-Level Security on all new tenant tables
ALTER TABLE workspace_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY sync_checkpoints_tenant_isolation ON sync_checkpoints
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = sync_checkpoints.workspace_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

CREATE POLICY workflow_executions_tenant_isolation ON workflow_executions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = workflow_executions.workspace_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

CREATE POLICY payment_webhook_events_admin_read ON payment_webhook_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = payment_webhook_events.workspace_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin')
    )
  );

CREATE POLICY entitlements_member_read ON entitlements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = entitlements.workspace_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );
