// @vitest-environment node
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearRateLimitForTest } from '../../server/auth/authService';
import { createBackendApp } from '../../server/createApp';
import { createAndVerifySqliteBackup } from '../../server/database/sqliteDb';
import { verifyRawBodyHmacSignature } from '../../server/billing/paymentProviders';

let server: http.Server;
let baseUrl = '';
let dbInstance: DatabaseSync;

async function apiJson<T = Record<string, unknown>>(
  reqPath: string,
  options: RequestInit = {}
): Promise<{ status: number; body: T; headers: Headers }> {
  const res = await fetch(`${baseUrl}${reqPath}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const body = (await res.json()) as T;
  return { status: res.status, body, headers: res.headers };
}

describe('Phases 96–98 Backend Security, Entitlements, Privacy Consents, Backup & Load Verification', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.BILLING_WEBHOOK_SECRET = 'phase96-test-webhook-secret';
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
    delete process.env.BILLING_WEBHOOK_SECRET;
    delete process.env.GEMINI_API_KEY;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    dbInstance?.close();
  });

  it('Phase 96: blocks cross-origin cookie CSRF mutations, protects server GEMINI_API_KEY, and validates portal workspaceId', async () => {
    const reg = await apiJson<{ sessionToken: string; defaultWorkspaceId: string }>(
      '/api/v1/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          email: 'p96-sec@solodesk.test',
          password: 'StrongPassword#2026',
          displayName: 'Sec Owner',
        }),
      }
    );
    expect(reg.status).toBe(201);
    const token = reg.body.sessionToken;
    const wsId = reg.body.defaultWorkspaceId;

    // Cross-origin cookie-authenticated mutation without Bearer token must be blocked (403)
    const csrfBlocked = await apiJson<{ error: { code: string } }>('/api/v1/auth/logout', {
      method: 'POST',
      headers: {
        Cookie: `solodesk_session=${token}`,
        Origin: 'https://evil-attacker.invalid',
      },
      body: JSON.stringify({}),
    });
    expect(csrfBlocked.status).toBe(403);
    expect(csrfBlocked.body.error.code).toBe('CSRF_ORIGIN_MISMATCH');

    // Server GEMINI_API_KEY cannot be called by anonymous unauthenticated requests without x-gemini-key
    process.env.GEMINI_API_KEY = 'AIzaSyDummyServerKeyForGateTestOnly';
    try {
      const anonAi = await apiJson<{ error: { code: string } }>('/api/v1/ai/generate', {
        method: 'POST',
        body: JSON.stringify({
          provider: 'gemini',
          prompt: 'Summarize Q4 income',
        }),
      });
      expect(anonAi.status).toBe(401);
      expect(anonAi.body.error.code).toBe('UNAUTHORIZED');
    } finally {
      delete process.env.GEMINI_API_KEY;
    }

    // Portal audit rejects unknown workspace IDs cleanly with 404
    const missingWsPortal = await apiJson<{ error: { code: string } }>('/api/v1/portal/audit', {
      method: 'POST',
      body: JSON.stringify({
        workspaceId: 'ws_nonexistent_123',
        tokenPrefix: 'tok_abc',
        valid: false,
        reason: 'not_found',
      }),
    });
    expect(missingWsPortal.status).toBe(404);
    expect(missingWsPortal.body.error.code).toBe('WORKSPACE_NOT_FOUND');

    // Valid local-workspace portal audit continues to work
    const localPortal = await apiJson('/api/v1/portal/audit', {
      method: 'POST',
      body: JSON.stringify({
        workspaceId: wsId,
        tokenPrefix: 'tok_ok',
        valid: true,
        reason: 'ok',
      }),
    });
    expect(localPortal.status).toBe(201);
  });

  it('Phase 96–97: verifies raw-body & Stripe-style HMAC signatures, downgrades cancelled billing webhooks, and reports honest provider status', async () => {
    const reg = await apiJson<{ sessionToken: string; defaultWorkspaceId: string }>(
      '/api/v1/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          email: 'p96-billing@solodesk.test',
          password: 'StrongPassword#2026',
          displayName: 'Billing Sec',
        }),
      }
    );
    const token = reg.body.sessionToken;
    const wsId = reg.body.defaultWorkspaceId;

    // Raw-body Stripe-style t=...,v1=... signature verification unit check
    const rawPayload = '{"hello":"world",  "spaced": true}';
    const ts = '1700000000';
    const v1 = crypto
      .createHmac('sha256', 'unit-secret')
      .update(`${ts}.${rawPayload}`)
      .digest('hex');
    expect(
      verifyRawBodyHmacSignature({
        rawPayload: Buffer.from(rawPayload, 'utf8'),
        signatureHeader: `t=${ts},v1=${v1}`,
        secret: 'unit-secret',
      })
    ).toBe(true);
    expect(
      verifyRawBodyHmacSignature({
        rawPayload: '{"hello":"world","spaced":true}',
        signatureHeader: `t=${ts},v1=${v1}`,
        secret: 'unit-secret',
      })
    ).toBe(false);

    // Webhook referencing unknown workspace fails 404
    const ghostPayload = JSON.stringify({
      eventId: 'evt_ghost_1',
      workspaceId: 'ws_missing_999',
      planTier: 'pro',
      billingStatus: 'active',
    });
    const ghostSig = crypto
      .createHmac('sha256', process.env.BILLING_WEBHOOK_SECRET!)
      .update(ghostPayload)
      .digest('hex');
    const ghostRes = await apiJson<{ error: { code: string } }>('/api/v1/billing/webhook/stripe', {
      method: 'POST',
      headers: { 'x-billing-signature': `sha256=${ghostSig}` },
      body: ghostPayload,
    });
    expect(ghostRes.status).toBe(404);
    expect(ghostRes.body.error.code).toBe('WORKSPACE_NOT_FOUND');

    // Upgrade via active webhook -> Pro
    const activePayload = JSON.stringify({
      eventId: 'evt_upgrade_1',
      workspaceId: wsId,
      planTier: 'pro',
      billingStatus: 'active',
      amountCents: 1500,
    });
    const activeSig = crypto
      .createHmac('sha256', process.env.BILLING_WEBHOOK_SECRET!)
      .update(activePayload)
      .digest('hex');
    const upRes = await apiJson<{ planTier: string }>('/api/v1/billing/webhook/stripe', {
      method: 'POST',
      headers: { 'x-billing-signature': activeSig },
      body: activePayload,
    });
    expect(upRes.status).toBe(200);
    expect(upRes.body.planTier).toBe('pro');

    // Cancelled webhook with planTier='pro' still present must downgrade workspace to 'free'
    const cancelPayload = JSON.stringify({
      eventId: 'evt_cancel_1',
      workspaceId: wsId,
      planTier: 'pro',
      billingStatus: 'cancelled',
      amountCents: 0,
    });
    const cancelSig = crypto
      .createHmac('sha256', process.env.BILLING_WEBHOOK_SECRET!)
      .update(cancelPayload)
      .digest('hex');
    const cancelRes = await apiJson<{ planTier: string; billingStatus: string }>(
      '/api/v1/billing/webhook/stripe',
      {
        method: 'POST',
        headers: { 'x-billing-signature': `sha256=${cancelSig}` },
        body: cancelPayload,
      }
    );
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.planTier).toBe('free');

    // Provider readiness endpoint classifies unconfigured external providers honestly
    const statusRes = await apiJson<{
      ok: boolean;
      providers: Array<{ provider: string; status: string; configured: boolean }>;
    }>('/api/v1/integrations/provider-status', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(statusRes.status).toBe(200);
    const stripeItem = statusRes.body.providers.find((p) => p.provider === 'stripe_checkout');
    expect(stripeItem?.status).toBe('BLOCKED_EXTERNAL_CREDENTIALS');
    expect(stripeItem?.configured).toBe(false);
  });

  it('Phase 96: enforces server-side plan entitlements, privacy consents parity, and audit log purge retention', async () => {
    const reg = await apiJson<{ sessionToken: string; defaultWorkspaceId: string }>(
      '/api/v1/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          email: 'p96-ent@solodesk.test',
          password: 'StrongPassword#2026',
          displayName: 'Ent Owner',
        }),
      }
    );
    const token = reg.body.sessionToken;
    const wsId = reg.body.defaultWorkspaceId;

    // Free tier allows up to 5 webhooks, 6th returns 403 ENTITLEMENT_LIMIT_EXCEEDED
    for (let i = 1; i <= 5; i++) {
      const okHook = await apiJson('/api/v1/webhooks', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          workspaceId: wsId,
          name: `Hook ${i}`,
          url: `https://example.com/hook-${i}`,
          eventType: 'invoice.paid',
        }),
      });
      expect(okHook.status).toBe(201);
    }
    const sixthHook = await apiJson<{ error: { code: string } }>('/api/v1/webhooks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        workspaceId: wsId,
        name: 'Hook 6',
        url: 'https://example.com/hook-6',
        eventType: 'invoice.paid',
      }),
    });
    expect(sixthHook.status).toBe(403);
    expect(sixthHook.body.error.code).toBe('ENTITLEMENT_LIMIT_EXCEEDED');

    // Entitlement snapshot endpoint reflects live usage
    const snapRes = await apiJson<{
      ok: boolean;
      entitlements: { planTier: string; usage: { webhooks: number } };
    }>(`/api/v1/billing/entitlements/${wsId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(snapRes.status).toBe(200);
    expect(snapRes.body.entitlements.usage.webhooks).toBe(5);

    // Privacy consents PUT + GET + audit trail
    const consentPut = await apiJson<{ ok: boolean; consent: { granted: boolean; version: string } }>(
      `/api/v1/privacy/consents/${wsId}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          consentType: 'ai_processing',
          granted: true,
          version: '2.0',
        }),
      }
    );
    expect(consentPut.status).toBe(200);
    expect(consentPut.body.consent.granted).toBe(true);

    const consentGet = await apiJson<{ ok: boolean; consents: Array<{ consentType: string }> }>(
      `/api/v1/privacy/consents/${wsId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(consentGet.status).toBe(200);
    expect(consentGet.body.consents.some((c) => c.consentType === 'ai_processing')).toBe(true);

    // Audit retention purge rejects retentionDays < 30 and purges old entries cleanly
    const badPurge = await apiJson('/api/v1/audit-logs/' + wsId + '/purge', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ retentionDays: 7 }),
    });
    expect(badPurge.status).toBe(400);

    const oldDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
    dbInstance
      .prepare(
        `INSERT INTO audit_logs (id, workspace_id, actor_user_id, event_type, severity, detail, created_at)
         VALUES (?, ?, ?, 'TEST_OLD', 'info', 'old event', ?)`
      )
      .run('aud_old_purge_test', wsId, 'tester', oldDate);

    const goodPurge = await apiJson<{ ok: boolean; deletedCount: number }>(
      `/api/v1/audit-logs/${wsId}/purge`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ retentionDays: 90 }),
      }
    );
    expect(goodPurge.status).toBe(200);
    expect(goodPurge.body.deletedCount).toBe(1);
  });

  it('Phase 98: verifies /ready integrity, VACUUM INTO backup & restore drill, and 500-record sync batch latency', async () => {
    const readyRes = await apiJson<{
      ok: boolean;
      integrity: string;
      migrationsApplied: number;
    }>('/api/v1/ready');
    expect(readyRes.status).toBe(200);
    expect(readyRes.body.integrity).toBe('ok');
    expect(readyRes.body.migrationsApplied).toBeGreaterThanOrEqual(8);

    // SQLite backup + restoration verification via VACUUM INTO
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'solodesk-backup-drill-'));
    const backupFile = path.join(tmpDir, 'backup.sqlite');
    try {
      const drill = createAndVerifySqliteBackup(dbInstance, backupFile);
      expect(drill.ok).toBe(true);
      expect(drill.integrity).toBe('ok');
      expect(drill.migrationsCount).toBeGreaterThanOrEqual(8);
      expect(drill.sizeBytes).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    // 500-record sync push & keyset paginated pull benchmark
    const reg = await apiJson<{ sessionToken: string; defaultWorkspaceId: string }>(
      '/api/v1/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          email: 'p98-load@solodesk.test',
          password: 'StrongPassword#2026',
          displayName: 'Load Owner',
        }),
      }
    );
    const token = reg.body.sessionToken;
    const wsId = reg.body.defaultWorkspaceId;

    const changes = Array.from({ length: 500 }, (_, idx) => ({
      id: `chg_load_${idx}`,
      entityType: 'tasks',
      entityId: `task_load_${String(idx).padStart(4, '0')}`,
      operation: 'upsert' as const,
      revision: 1,
      payloadJson: JSON.stringify({ title: `Load Task ${idx}`, status: 'todo' }),
      updatedAt: '2026-11-23T10:00:00.000Z',
    }));

    const t0 = performance.now();
    let totalAcked = 0;
    for (let offset = 0; offset < changes.length; offset += 200) {
      const batch = changes.slice(offset, offset + 200);
      const pushRes = await apiJson<{ ok: boolean; ackedIds: string[] }>('/api/v1/sync/push', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId: wsId, changes: batch }),
      });
      expect(pushRes.status).toBe(200);
      totalAcked += pushRes.body.ackedIds.length;
    }
    expect(totalAcked).toBe(500);

    const collected = new Set<string>();
    let pageCursor = '';
    for (let page = 0; page < 10; page++) {
      const pullRes = await apiJson<{
        records: Array<{ entityId: string }>;
        hasMore: boolean;
        nextPageCursor: string;
      }>(
        `/api/v1/sync/pull?workspaceId=${encodeURIComponent(wsId)}&since=2026-01-01T00:00:00.000Z&limit=100${
          pageCursor ? `&cursor=${encodeURIComponent(pageCursor)}` : ''
        }`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      expect(pullRes.status).toBe(200);
      for (const r of pullRes.body.records) collected.add(r.entityId);
      if (!pullRes.body.hasMore) break;
      pageCursor = pullRes.body.nextPageCursor;
    }
    const elapsedMs = performance.now() - t0;
    expect(collected.size).toBe(500);
    expect(elapsedMs).toBeLessThan(10_000);
  });
});
