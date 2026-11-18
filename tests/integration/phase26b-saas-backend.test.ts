// @vitest-environment node
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBackendApp } from '../../server/createApp';
import { clearRateLimitForTest } from '../../server/auth/authService';
import type { DatabaseSync } from 'node:sqlite';

let server: http.Server;
let baseUrl = '';
let dbInstance: DatabaseSync;

async function apiJson<T = Record<string, unknown>>(
  path: string,
  options: RequestInit = {}
): Promise<{ status: number; headers: Headers; body: T }> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const body = (await res.json()) as T;
  return { status: res.status, headers: res.headers, body };
}

describe('Phase 26-B: Modular SaaS Backend, Auth, Tenant RBAC, Sync, Storage, RAG v3 & Telemetry', () => {
  beforeAll(async () => {
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

  it('serves health, readiness, and OpenAPI docs with X-Request-Id and security headers', async () => {
    const health = await apiJson<{ ok: boolean; service: string }>('/api/v1/health');
    expect(health.status).toBe(200);
    expect(health.body.ok).toBe(true);
    expect(health.headers.get('x-request-id')).toMatch(/^req_/);
    expect(health.headers.get('x-content-type-options')).toBe('nosniff');

    const ready = await apiJson<{ ok: boolean; migrationsApplied: number }>('/api/v1/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.migrationsApplied).toBe(3);

    const docs = await apiJson<{ openapi: string; paths: Record<string, unknown> }>('/api/v1/docs');
    expect(docs.status).toBe(200);
    expect(docs.body.openapi).toBe('3.1.0');
    expect(docs.body.paths['/api/v1/sync/push']).toBeDefined();
  });

  it('enforces scrypt registration/login, session revocation, cross-tenant isolation, and least-privilege RBAC', async () => {
    // Register User A (Workspace Owner)
    const regA = await apiJson<{
      ok: boolean;
      sessionToken: string;
      sessionId: string;
      defaultWorkspaceId: string;
      user: { id: string; email: string };
    }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'owner-a@solodesk.test',
        password: 'StrongPassword#2026',
        displayName: 'Owner Alpha',
      }),
    });
    expect(regA.status).toBe(201);
    const tokenA = regA.body.sessionToken;
    const wsA = regA.body.defaultWorkspaceId;

    // Register User B (Different tenant)
    const regB = await apiJson<{
      sessionToken: string;
      defaultWorkspaceId: string;
    }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'attacker-b@solodesk.test',
        password: 'AnotherPassword#2026',
        displayName: 'Tenant Beta',
      }),
    });
    expect(regB.status).toBe(201);
    const tokenB = regB.body.sessionToken;

    // Cross-tenant isolation check: User B must receive 403 accessing User A's workspace
    const crossTenantPull = await apiJson(`/api/v1/sync/pull?workspaceId=${wsA}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(crossTenantPull.status).toBe(403);

    // Owner A invites User B strictly as client_viewer
    const addMember = await apiJson(`/api/v1/workspaces/${wsA}/members`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        userEmail: 'attacker-b@solodesk.test',
        role: 'client_viewer',
      }),
    });
    expect(addMember.status).toBe(201);

    // User B with client_viewer role must be denied write endpoints (403 INSUFFICIENT_ROLE)
    const viewerWriteSync = await apiJson('/api/v1/sync/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({
        workspaceId: wsA,
        changes: [
          {
            id: 'syq_forbidden',
            entityType: 'client',
            entityId: 'cli_1',
            operation: 'upsert',
            revision: 1,
            payloadJson: '{}',
            updatedAt: new Date().toISOString(),
          },
        ],
      }),
    });
    expect(viewerWriteSync.status).toBe(403);

    // Unauthenticated access denied
    const unauth = await apiJson(`/api/v1/auth/me`);
    expect(unauth.status).toBe(401);

    // Logout revokes session immediately
    const logout = await apiJson('/api/v1/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(logout.status).toBe(200);
    const afterLogout = await apiJson('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(afterLogout.status).toBe(401);
  });

  it('persists sync revisions with conflict checks, enforces server RAG access scopes, blocks SSRF webhooks, and exposes commercial catalog', async () => {
    const reg = await apiJson<{
      sessionToken: string;
      defaultWorkspaceId: string;
    }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'sync-owner@solodesk.test',
        password: 'SyncPassword#2026',
        displayName: 'Sync Owner',
      }),
    });
    const token = reg.body.sessionToken;
    const wsId = reg.body.defaultWorkspaceId;

    // Push sync rev 1 then rev 2 then stale rev 1 conflict
    const push1 = await apiJson<{ ackedIds: string[]; conflicts: unknown[] }>('/api/v1/sync/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        workspaceId: wsId,
        changes: [
          {
            id: 'syq_1',
            entityType: 'invoice',
            entityId: 'inv_1001',
            operation: 'upsert',
            revision: 1,
            payloadJson: JSON.stringify({ number: 'INV-1001', total: 500 }),
            updatedAt: '2026-11-18T10:00:00.000Z',
          },
        ],
      }),
    });
    expect(push1.status).toBe(200);
    expect(push1.body.ackedIds).toEqual(['syq_1']);

    const pushStale = await apiJson<{ ackedIds: string[]; conflicts: Array<{ id: string }> }>('/api/v1/sync/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        workspaceId: wsId,
        changes: [
          {
            id: 'syq_stale',
            entityType: 'invoice',
            entityId: 'inv_1001',
            operation: 'upsert',
            revision: 1,
            payloadJson: JSON.stringify({ number: 'INV-1001', total: 400 }),
            updatedAt: '2026-11-18T09:50:00.000Z',
          },
        ],
      }),
    });
    expect(pushStale.body.ackedIds).toEqual([]);
    expect(pushStale.body.conflicts).toHaveLength(1);

    const pull = await apiJson<{ records: Array<{ entityId: string; revision: number }> }>(
      `/api/v1/sync/pull?workspaceId=${wsId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(pull.body.records).toHaveLength(1);
    expect(pull.body.records[0].entityId).toBe('inv_1001');

    // Storage upload
    const upload = await apiJson<{ object: { id: string; sha256: string } }>('/api/v1/storage/objects', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        workspaceId: wsId,
        name: 'deliverable-spec.txt',
        mimeType: 'text/plain',
        classification: 'client_shared',
        contentBase64: Buffer.from('Verified client specification document').toString('base64'),
      }),
    });
    expect(upload.status).toBe(201);
    expect(upload.body.object.sha256).toMatch(/^[0-9a-f]{64}$/);

    // Server RAG access-scope check
    await apiJson('/api/v1/rag/documents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        workspaceId: wsId,
        title: 'Internal Tax Margin Note',
        content: 'Internal tax shelter threshold is confidential.',
        accessScope: 'internal_only',
      }),
    });

    const portalRag = await apiJson<{ matches: unknown[]; appliedAccessScope: string }>(
      '/api/v1/rag/search',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          workspaceId: wsId,
          query: 'confidential tax shelter',
          requestedScope: 'client_portal',
        }),
      }
    );
    expect(portalRag.status).toBe(200);
    expect(portalRag.body.appliedAccessScope).toBe('client_portal');
    expect(portalRag.body.matches).toHaveLength(0);

    // SSRF webhook rejection
    const ssrfHook = await apiJson('/api/v1/webhooks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        workspaceId: wsId,
        name: 'Internal Metadata Hook',
        url: 'http://169.254.169.254/latest/meta-data',
        eventType: 'invoice_overdue',
      }),
    });
    expect(ssrfHook.status).toBe(400);

    // Idempotent job enqueue + run
    const job1 = await apiJson<{ job: { id: string; deduplicated: boolean } }>('/api/v1/jobs/enqueue', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        workspaceId: wsId,
        jobType: 'weekly_digest',
        idempotencyKey: 'digest_2026_w47',
      }),
    });
    const job2 = await apiJson<{ job: { id: string; deduplicated: boolean } }>('/api/v1/jobs/enqueue', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        workspaceId: wsId,
        jobType: 'weekly_digest',
        idempotencyKey: 'digest_2026_w47',
      }),
    });
    expect(job2.body.job.deduplicated).toBe(true);
    expect(job2.body.job.id).toBe(job1.body.job.id);

    const ran = await apiJson<{ executedCount: number }>('/api/v1/jobs/run-due', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ workspaceId: wsId }),
    });
    expect(ran.body.executedCount).toBe(1);

    // Server AI Gateway without GEMINI_API_KEY fails cleanly with 400 missing_key
    const aiNoKey = await apiJson<{ error: { code: string } }>('/api/v1/ai/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'Hello' }),
    });
    expect(aiNoKey.status).toBe(400);
    expect(aiNoKey.body.error.code).toBe('missing_key');

    // Commercial catalog + Pakistan payment reality disclosure
    const catalog = await apiJson<{
      checkoutStatus: string;
      pakistanPaymentGuidance: { stripeDirectInPakistan: string };
      plans: Array<{ id: string }>;
    }>('/api/v1/billing/catalog');
    expect(catalog.status).toBe(200);
    expect(catalog.body.checkoutStatus).toBe('BLOCKED_EXTERNAL_PROVIDER_REQUIRED');
    expect(catalog.body.pakistanPaymentGuidance.stripeDirectInPakistan).toBe(
      'UNSUPPORTED_WITHOUT_FOREIGN_ENTITY'
    );
    expect(catalog.body.plans.length).toBe(5);
  });
});
