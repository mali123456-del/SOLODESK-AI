// @vitest-environment node
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearRateLimitForTest } from '../../server/auth/authService';
import { createBackendApp } from '../../server/createApp';
import { getAppliedMigrations } from '../../server/database/sqliteDb';
import {
  dispatchServerWebhookTest,
  resolveAndValidatePinnedAddress,
} from '../../server/jobs/jobRunner';
import { validateResolvedIpAddress } from '../../src/security/urlPolicy';

let server: http.Server;
let baseUrl = '';
let dbInstance: DatabaseSync;

async function apiJson<T = Record<string, unknown>>(
  route: string,
  options: RequestInit = {}
): Promise<{ status: number; headers: Headers; body: T }> {
  const res = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const body = (await res.json()) as T;
  return { status: res.status, headers: res.headers, body };
}

describe('Phases 73–76: Security Audit Fixes, Keyset Sync Pagination & Local API RBAC Matrix', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    clearRateLimitForTest();
    const { app, db } = createBackendApp({ sqlitePath: ':memory:', serveStatic: false });
    dbInstance = db;
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    dbInstance?.close();
  });

  it('Phase 73 Fix #1: isolates background job idempotency keys strictly per workspace (SQLite v6)', async () => {
    const migrations = getAppliedMigrations(dbInstance);
    expect(migrations.map((m) => m.version)).toContain(6);

    const tenantA = await apiJson<{ sessionToken: string; defaultWorkspaceId: string }>(
      '/api/v1/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          email: 'job-iso-a@solodesk.test',
          password: 'JobIsoPassA#2026',
          displayName: 'Job Tenant A',
        }),
      }
    );
    const tenantB = await apiJson<{ sessionToken: string; defaultWorkspaceId: string }>(
      '/api/v1/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          email: 'job-iso-b@solodesk.test',
          password: 'JobIsoPassB#2026',
          displayName: 'Job Tenant B',
        }),
      }
    );

    const pushJobA = await apiJson<{ job: { id: string; deduplicated: boolean } }>(
      '/api/v1/jobs/enqueue',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${tenantA.body.sessionToken}` },
        body: JSON.stringify({
          workspaceId: tenantA.body.defaultWorkspaceId,
          jobType: 'daily_digest',
          payload: { tenant: 'A' },
          idempotencyKey: 'shared-digest-key-001',
        }),
      }
    );
    expect(pushJobA.status).toBe(201);
    expect(pushJobA.body.job.deduplicated).toBe(false);

    // Same idempotencyKey in Tenant B MUST create a new job rather than leaking Tenant A's job
    const pushJobB = await apiJson<{ job: { id: string; deduplicated: boolean } }>(
      '/api/v1/jobs/enqueue',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${tenantB.body.sessionToken}` },
        body: JSON.stringify({
          workspaceId: tenantB.body.defaultWorkspaceId,
          jobType: 'daily_digest',
          payload: { tenant: 'B' },
          idempotencyKey: 'shared-digest-key-001',
        }),
      }
    );
    expect(pushJobB.status).toBe(201);
    expect(pushJobB.body.job.deduplicated).toBe(false);
    expect(pushJobB.body.job.id).not.toBe(pushJobA.body.job.id);

    // Re-enqueuing in Tenant A deduplicates within Tenant A
    const replayJobA = await apiJson<{ job: { id: string; deduplicated: boolean } }>(
      '/api/v1/jobs/enqueue',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${tenantA.body.sessionToken}` },
        body: JSON.stringify({
          workspaceId: tenantA.body.defaultWorkspaceId,
          jobType: 'daily_digest',
          payload: { tenant: 'A' },
          idempotencyKey: 'shared-digest-key-001',
        }),
      }
    );
    expect(replayJobA.status).toBe(201);
    expect(replayJobA.body.job.deduplicated).toBe(true);
    expect(replayJobA.body.job.id).toBe(pushJobA.body.job.id);
  });

  it('Phase 73 Fix #2: connection-time DNS/IP pinning fails closed on rebinding, private IPs, zone IDs, and DNS errors', async () => {
    // Reject private / metadata / zone-ID IP addresses
    for (const ip of [
      '127.0.0.1',
      '169.254.169.254',
      '10.20.30.40',
      '172.16.0.1',
      '192.168.1.50',
      'fe80::1%eth0',
      '::ffff:127.0.0.1',
      '',
    ]) {
      expect(validateResolvedIpAddress(ip).valid, `Expected IP "${ip}" blocked`).toBe(false);
    }
    expect(validateResolvedIpAddress('93.184.216.34').valid).toBe(true);

    // Rebinding mock: first entry public, second entry cloud metadata -> MUST fail closed
    await expect(
      resolveAndValidatePinnedAddress('rebind.example.com', async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '169.254.169.254', family: 4 },
      ])
    ).rejects.toThrow(/metadata|reserved|loopback/i);

    // Empty DNS answer -> MUST fail closed
    await expect(resolveAndValidatePinnedAddress('empty.example.com', async () => [])).rejects.toThrow(
      /fail-closed/i
    );

    // DNS failure -> MUST fail closed
    await expect(
      resolveAndValidatePinnedAddress('broken.example.com', async () => {
        throw new Error('ENOTFOUND');
      })
    ).rejects.toThrow(/fail-closed/i);

    // Public IP resolution succeeds cleanly and pins IP
    const pinned = await resolveAndValidatePinnedAddress('webhooks.example.com', async () => [
      { address: '93.184.216.34', family: 4 },
    ]);
    expect(pinned).toEqual({ address: '93.184.216.34', family: 4 });

    // Dispatch fails closed before making HTTP call if lookup resolves to loopback
    const reg = await apiJson<{ sessionToken: string; defaultWorkspaceId: string }>(
      '/api/v1/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          email: 'dns-pin@solodesk.test',
          password: 'DnsPinPass#2026',
          displayName: 'DNS Pin',
        }),
      }
    );
    const hookRes = await apiJson<{ webhook: { id: string } }>('/api/v1/webhooks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${reg.body.sessionToken}` },
      body: JSON.stringify({
        workspaceId: reg.body.defaultWorkspaceId,
        name: 'DNS Pin Hook',
        url: 'https://webhooks.example.com/hook',
        eventType: 'invoice_paid',
      }),
    });
    let fetchCalled = false;
    await expect(
      dispatchServerWebhookTest(dbInstance, {
        workspaceId: reg.body.defaultWorkspaceId,
        webhookId: hookRes.body.webhook.id,
        lookupImpl: async () => [{ address: '127.0.0.1', family: 4 }],
        fetchImpl: async () => {
          fetchCalled = true;
          return new Response('ok', { status: 200 });
        },
      })
    ).rejects.toThrow(/loopback|reserved/i);
    expect(fetchCalled).toBe(false);
  });

  it('Phase 73 Fix #3 & #6: Express scrubbed JSON error handler & PostgreSQL 004 RLS recursion fix audit', async () => {
    // Malformed JSON hits sanitized handler cleanly without HTML stack trace
    const malformed = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"email": ',
    });
    expect(malformed.status).toBe(400);
    const errJson = (await malformed.json()) as { ok: boolean; error: { code: string } };
    expect(errJson.ok).toBe(false);
    expect(errJson.error.code).toBe('INVALID_JSON');

    // Static PostgreSQL migration ordering & 004 RLS recursion verification
    const pgDir = path.resolve(process.cwd(), 'server/database/pgMigrations');
    const files = fs.readdirSync(pgDir).filter((f) => f.endsWith('.sql')).sort();
    expect(files).toEqual([
      '001_postgresql_rls_pgvector.sql',
      '002_phase37_40_domains_rls_buckets.sql',
      '003_rls_hardening_and_sync_idempotency.sql',
      '004_rls_security_definer_functions_and_remaining_tables.sql',
      '005_audit_logs_and_integrations.sql',
      '006_privacy_consents_and_immutability.sql',
    ]);

    const sql004 = fs.readFileSync(path.join(pgDir, files[3]!), 'utf8');
    expect(sql004).toContain('CREATE OR REPLACE FUNCTION public.is_workspace_member');
    expect(sql004).toContain('CREATE OR REPLACE FUNCTION public.has_workspace_role');
    expect(sql004).toContain('SECURITY DEFINER');
    expect(sql004).toContain("SET search_path = ''");
    expect(sql004).toContain('TO authenticated');
    expect(sql004).toContain('ALTER TABLE jobs FORCE ROW LEVEL SECURITY');
    expect(sql004).toContain('ALTER TABLE webhooks FORCE ROW LEVEL SECURITY');
    expect(sql004).toContain('ALTER TABLE webhook_deliveries FORCE ROW LEVEL SECURITY');
    expect(sql004).toContain('ALTER TABLE knowledge_sources FORCE ROW LEVEL SECURITY');
    expect(sql004).toContain('UNIQUE (workspace_id, idempotency_key)');
    // Verify workspace_members policy no longer queries workspace_members directly
    const wmMemberReadMatch = sql004.match(/CREATE POLICY workspace_members_member_read[\s\S]*?;/);
    expect(wmMemberReadMatch?.[0]).toContain('public.is_workspace_member(workspace_id)');
    expect(wmMemberReadMatch?.[0]).not.toMatch(/FROM\s+workspace_members/i);

    const sql006 = fs.readFileSync(path.join(pgDir, files[5]!), 'utf8');
    expect(sql006).toContain('CREATE TABLE IF NOT EXISTS privacy_consents');
    expect(sql006).toContain('ALTER TABLE privacy_consents FORCE ROW LEVEL SECURITY');
    expect(sql006).toContain('public.prevent_audit_log_mutation()');
    expect(sql006).toContain('BEFORE UPDATE OR DELETE ON audit_logs');
  });

  it('Phase 76 Fix: composite keyset cursor pagination returns 100% of same-timestamp sync records & tombstones with zero skips or duplicates', async () => {
    const reg = await apiJson<{ sessionToken: string; defaultWorkspaceId: string }>(
      '/api/v1/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          email: 'sync-cursor@solodesk.test',
          password: 'SyncCursor#2026',
          displayName: 'Sync Cursor',
        }),
      }
    );
    const token = reg.body.sessionToken;
    const wsId = reg.body.defaultWorkspaceId;

    // Push 5 records in one batch -> all receive identical server monotonic updated_at timestamp
    const changes = ['c1', 'c2', 'c3', 'c4', 'c5'].map((id) => ({
      id: `chg_${id}`,
      entityType: 'client',
      entityId: id,
      operation: 'upsert',
      revision: 1,
      payloadJson: JSON.stringify({ id, name: `Client ${id}` }),
      updatedAt: '2026-11-20T12:00:00.000Z',
    }));

    const pushRes = await apiJson<{ ackedIds: string[]; serverTimestamp: string }>(
      '/api/v1/sync/push',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': 'cursor-batch-1',
        },
        body: JSON.stringify({ workspaceId: wsId, changes }),
      }
    );
    expect(pushRes.status).toBe(200);
    expect(pushRes.body.ackedIds).toHaveLength(5);

    // Also push 3 tombstones with identical deleted_at timestamp
    const delRes = await apiJson<{ ackedIds: string[] }>('/api/v1/sync/push', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': 'cursor-del-batch-1',
      },
      body: JSON.stringify({
        workspaceId: wsId,
        changes: ['t1', 't2', 't3'].map((id) => ({
          id: `del_${id}`,
          entityType: 'task',
          entityId: id,
          operation: 'delete',
          revision: 2,
          payloadJson: '{}',
          updatedAt: '2026-11-20T12:00:01.000Z',
        })),
      }),
    });
    expect(delRes.status).toBe(200);
    expect(delRes.body.ackedIds).toHaveLength(3);

    // Paginate with limit=2 using nextPageCursor
    const collectedIds: string[] = [];
    const collectedTombstones: string[] = [];
    let cursor = '';
    let pages = 0;

    while (pages < 10) {
      pages += 1;
      const qs = new URLSearchParams({ workspaceId: wsId, limit: '2' });
      if (cursor) qs.set('cursor', cursor);

      const page = await apiJson<{
        records: Array<{ entityId: string }>;
        tombstones: Array<{ entityId: string }>;
        hasMore: boolean;
        nextPageCursor: string;
      }>(`/api/v1/sync/pull?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(page.status).toBe(200);
      collectedIds.push(...page.body.records.map((r) => r.entityId));
      collectedTombstones.push(...page.body.tombstones.map((t) => t.entityId));
      if (!page.body.hasMore) break;
      cursor = page.body.nextPageCursor;
    }

    expect(collectedIds).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
    expect(collectedTombstones).toEqual(['t1', 't2', 't3']);

    // Malformed cursor returns clean 400 VALIDATION_ERROR
    const badCursor = await apiJson<{ error: { code: string } }>(
      `/api/v1/sync/pull?workspaceId=${wsId}&cursor=%%%not-valid-base64-json`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(badCursor.status).toBe(400);
    expect(badCursor.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('Phase 75 Local API RBAC Matrix: enforces Owner, Admin, Manager, Collaborator, Client Viewer & Unauthenticated/Revoked boundaries', async () => {
    async function registerUserWithToken(email: string, name: string) {
      const res = await apiJson<{ sessionToken: string; defaultWorkspaceId: string }>(
        '/api/v1/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({
            email,
            password: 'RbacMatrixPass#2026',
            displayName: name,
          }),
        }
      );
      expect(res.status).toBe(201);
      return res.body;
    }

    const owner = await registerUserWithToken('rbac-owner@solodesk.test', 'RBAC Owner');
    const admin = await registerUserWithToken('rbac-admin@solodesk.test', 'RBAC Admin');
    const manager = await registerUserWithToken('rbac-manager@solodesk.test', 'RBAC Manager');
    const collaborator = await registerUserWithToken('rbac-collab@solodesk.test', 'RBAC Collab');
    const clientViewer = await registerUserWithToken('rbac-viewer@solodesk.test', 'RBAC Viewer');
    const outsider = await registerUserWithToken('rbac-outsider@solodesk.test', 'RBAC Outsider');
    const wsId = owner.defaultWorkspaceId;

    // Assign roles on owner's workspace
    for (const [email, role] of [
      ['rbac-admin@solodesk.test', 'admin'],
      ['rbac-manager@solodesk.test', 'manager'],
      ['rbac-collab@solodesk.test', 'collaborator'],
      ['rbac-viewer@solodesk.test', 'client_viewer'],
    ] as const) {
      const assign = await apiJson(`/api/v1/workspaces/${wsId}/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.sessionToken}` },
        body: JSON.stringify({ userEmail: email, role }),
      });
      expect(assign.status).toBe(201);
    }

    // Seed workspace + internal_only + client_portal RAG & storage docs
    for (const scope of ['client_portal', 'workspace', 'internal_only'] as const) {
      await apiJson('/api/v1/rag/documents', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.sessionToken}` },
        body: JSON.stringify({
          workspaceId: wsId,
          title: `Doc ${scope}`,
          content: `UniqueMatrixToken ${scope} confidentiality level`,
          accessScope: scope,
        }),
      });
    }

    // Unauthenticated -> 401
    const unauth = await apiJson(`/api/v1/sync/pull?workspaceId=${wsId}`);
    expect(unauth.status).toBe(401);

    // Outsider -> 403 TENANT_ACCESS_DENIED
    const outsiderPull = await apiJson(`/api/v1/sync/pull?workspaceId=${wsId}`, {
      headers: { Authorization: `Bearer ${outsider.sessionToken}` },
    });
    expect(outsiderPull.status).toBe(403);

    // Admin can manage webhooks/audit; Manager CANNOT; Collaborator CANNOT read analytics/billing; Client Viewer CANNOT push sync or read workspace/internal RAG
    const adminAudit = await apiJson(`/api/v1/security/audit/${wsId}`, {
      headers: { Authorization: `Bearer ${admin.sessionToken}` },
    });
    expect(adminAudit.status).toBe(200);

    const managerWebhookCreate = await apiJson('/api/v1/webhooks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${manager.sessionToken}` },
      body: JSON.stringify({
        workspaceId: wsId,
        name: 'Manager Should Fail',
        url: 'https://webhooks.example.com/m',
        eventType: 'invoice_paid',
      }),
    });
    expect(managerWebhookCreate.status).toBe(403);

    const managerAnalytics = await apiJson(`/api/v1/analytics/overview/${wsId}`, {
      headers: { Authorization: `Bearer ${manager.sessionToken}` },
    });
    expect(managerAnalytics.status).toBe(200);

    const collabAnalytics = await apiJson(`/api/v1/analytics/overview/${wsId}`, {
      headers: { Authorization: `Bearer ${collaborator.sessionToken}` },
    });
    expect(collabAnalytics.status).toBe(403);

    const collabBilling = await apiJson(`/api/v1/billing/subscription/${wsId}`, {
      headers: { Authorization: `Bearer ${collaborator.sessionToken}` },
    });
    expect(collabBilling.status).toBe(403);

    const collabPush = await apiJson('/api/v1/sync/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${collaborator.sessionToken}` },
      body: JSON.stringify({
        workspaceId: wsId,
        changes: [
          {
            id: 'chg_collab',
            entityType: 'task',
            entityId: 't_c1',
            operation: 'upsert',
            revision: 1,
            payloadJson: '{"title":"Collab Task"}',
            updatedAt: '2026-11-20T12:00:00.000Z',
          },
        ],
      }),
    });
    expect(collabPush.status).toBe(200);

    const viewerPush = await apiJson('/api/v1/sync/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clientViewer.sessionToken}` },
      body: JSON.stringify({
        workspaceId: wsId,
        changes: [
          {
            id: 'chg_viewer',
            entityType: 'task',
            entityId: 't_v1',
            operation: 'upsert',
            revision: 1,
            payloadJson: '{"title":"Viewer Hack"}',
            updatedAt: '2026-11-20T12:00:00.000Z',
          },
        ],
      }),
    });
    expect(viewerPush.status).toBe(403);

    // RAG scope enforcement: viewer gets client_portal only even if requesting internal_only
    const viewerRag = await apiJson<{ appliedAccessScope: string; matches: Array<{ documentTitle: string }> }>(
      '/api/v1/rag/search',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${clientViewer.sessionToken}` },
        body: JSON.stringify({
          workspaceId: wsId,
          query: 'UniqueMatrixToken',
          requestedScope: 'internal_only',
        }),
      }
    );
    expect(viewerRag.status).toBe(200);
    expect(viewerRag.body.appliedAccessScope).toBe('client_portal');
    expect(viewerRag.body.matches.every((m) => m.documentTitle === 'Doc client_portal')).toBe(true);

    // Revoked session token rejected immediately
    const tempLogout = await apiJson('/api/v1/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${outsider.sessionToken}` },
    });
    expect(tempLogout.status).toBe(200);

    const afterLogout = await apiJson('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${outsider.sessionToken}` },
    });
    expect(afterLogout.status).toBe(401);
  });
});
