-- SOLODESK AI — Hosted PostgreSQL + Supabase RLS + pgvector Schema Migration
-- Reference migration for upgrading from single-node SQLite to hosted PostgreSQL/Supabase.
-- Note: Verify pgvector extension privilege in your PostgreSQL cluster before running.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  owner_user_id UUID NOT NULL,
  plan_tier TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'collaborator', 'client_viewer')),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS sync_records (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  operation TEXT NOT NULL DEFAULT 'upsert',
  payload_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_user_id UUID,
  PRIMARY KEY (workspace_id, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_id UUID NOT NULL,
  document_title TEXT NOT NULL,
  access_scope TEXT NOT NULL CHECK (access_scope IN ('workspace', 'client_portal', 'internal_only')),
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  vector_model TEXT NOT NULL,
  embedding VECTOR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_workspace_scope
  ON knowledge_chunks (workspace_id, access_scope);

-- Row-Level Security (Supabase RLS compatible)
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_member_read ON workspaces
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = workspaces.id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

CREATE POLICY sync_records_tenant_isolation ON sync_records
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = sync_records.workspace_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin', 'manager', 'collaborator')
    )
  );

CREATE POLICY knowledge_chunks_scope_isolation ON knowledge_chunks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = knowledge_chunks.workspace_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
        AND (
          knowledge_chunks.access_scope = 'client_portal'
          OR (m.role IN ('owner', 'admin', 'manager', 'collaborator') AND knowledge_chunks.access_scope = 'workspace')
          OR (m.role IN ('owner', 'admin') AND knowledge_chunks.access_scope = 'internal_only')
        )
    )
  );
