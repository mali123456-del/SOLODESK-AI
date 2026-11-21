// @vitest-environment node
import crypto from 'node:crypto';
import http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearRateLimitForTest } from '../../server/auth/authService';
import { createBackendApp } from '../../server/createApp';
import { calculateDocumentTotals, getCurrencyDecimals } from '../../src/domain/calculations/money';

let server: http.Server;
let baseUrl = '';
let dbInstance: DatabaseSync;

async function apiJson<T = Record<string, unknown>>(
  path: string,
  options: RequestInit = {}
): Promise<{ status: number; body: T; headers: Headers }> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const body = (await res.json()) as T;
  return { status: res.status, body, headers: res.headers };
}

describe('Phases 78–95 Backend Integration: SQLite v7, Voice Notes, Invoice Calculation, Append-Only Audit Logs, Integrations & Billing Webhooks', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.BILLING_WEBHOOK_SECRET = 'phase78-95-test-webhook-secret';
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
    await new Promise<void>((resolve) => server.close(() => resolve()));
    dbInstance?.close();
  });

  it('applies SQLite schema v7 and enforces voice notes validation + tenant isolation', async () => {
    const schemaRow = dbInstance
      .prepare('SELECT MAX(version) AS maxVersion FROM schema_migrations')
      .get() as { maxVersion: number };
    expect(schemaRow.maxVersion).toBeGreaterThanOrEqual(7);

    const ownerA = await apiJson<{ sessionToken: string; defaultWorkspaceId: string }>(
      '/api/v1/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          email: 'p78-owner-a@solodesk.test',
          password: 'StrongPassword#2026',
          displayName: 'Owner A',
        }),
      }
    );
    expect(ownerA.status).toBe(201);
    const tokenA = ownerA.body.sessionToken;
    const wsA = ownerA.body.defaultWorkspaceId;

    const ownerB = await apiJson<{ sessionToken: string; defaultWorkspaceId: string }>(
      '/api/v1/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          email: 'p78-owner-b@solodesk.test',
          password: 'StrongPassword#2026',
          displayName: 'Owner B',
        }),
      }
    );
    expect(ownerB.status).toBe(201);
    const tokenB = ownerB.body.sessionToken;

    // Reject unsupported MIME type
    const badMime = await apiJson('/api/v1/voice-notes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        workspaceId: wsA,
        parentType: 'project',
        parentId: 'proj_1',
        title: 'Invalid mime',
        mimeType: 'application/x-msdownload',
        durationSeconds: 3,
        contentBase64: Buffer.from('hello').toString('base64'),
      }),
    });
    expect(badMime.status).toBe(400);

    // Create valid voice note
    const created = await apiJson<{ ok: boolean; voiceNote: { id: string; title: string } }>(
      '/api/v1/voice-notes',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          workspaceId: wsA,
          parentType: 'project',
          parentId: 'proj_1',
          title: 'Kickoff Voice Memo',
          mimeType: 'audio/webm;codecs=opus',
          durationSeconds: 14,
          contentBase64: Buffer.from('webm-sample-audio').toString('base64'),
        }),
      }
    );
    expect(created.status).toBe(201);
    const vnId = created.body.voiceNote.id;

    // Cross-tenant access blocked (Owner B cannot list or delete Owner A voice notes)
    const crossList = await apiJson(`/api/v1/voice-notes/${wsA}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(crossList.status).toBe(403);

    const crossDel = await apiJson(`/api/v1/voice-notes/${wsA}/${vnId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(crossDel.status).toBe(403);

    // Owner A list + delete succeeds
    const listA = await apiJson<{ ok: boolean; voiceNotes: Array<{ id: string }> }>(
      `/api/v1/voice-notes/${wsA}`,
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );
    expect(listA.status).toBe(200);
    expect(listA.body.voiceNotes.some((v) => v.id === vnId)).toBe(true);

    const delA = await apiJson(`/api/v1/voice-notes/${wsA}/${vnId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(delA.status).toBe(200);
  });

  it('matches local Big.js invoice calculation parity on POST /api/v1/invoices/calculate', async () => {
    const auth = await apiJson<{ sessionToken: string }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'p78-calc@solodesk.test',
        password: 'StrongPassword#2026',
        displayName: 'Calc Owner',
      }),
    });
    const token = auth.body.sessionToken;

    const payload = {
      currency: 'USD',
      lineItems: [
        { id: 'li_1', description: 'Sprint 1', quantity: 3, unitPrice: 333.33 },
        { id: 'li_2', description: 'Audit', quantity: 1, unitPrice: 150 },
      ],
      discountType: 'percentage' as const,
      discountValue: 10,
      taxRate: 15,
      taxInclusive: false,
    };

    const serverRes = await apiJson<{
      ok: boolean;
      subtotal: number;
      discountAmount: number;
      taxAmount: number;
      total: number;
    }>('/api/v1/invoices/calculate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });

    const localTotals = calculateDocumentTotals(payload, getCurrencyDecimals(payload.currency));
    expect(serverRes.status).toBe(200);
    expect(serverRes.body.subtotal).toBe(localTotals.subtotal);
    expect(serverRes.body.discountAmount).toBe(localTotals.discountAmount);
    expect(serverRes.body.taxAmount).toBe(localTotals.taxAmount);
    expect(serverRes.body.total).toBe(localTotals.total);
  });

  it('serves append-only audit logs with filtering, CSV formula neutralization, and blocks DELETE', async () => {
    const auth = await apiJson<{ sessionToken: string; defaultWorkspaceId: string }>(
      '/api/v1/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          email: 'p78-audit@solodesk.test',
          password: 'StrongPassword#2026',
          displayName: 'Audit Owner',
        }),
      }
    );
    const token = auth.body.sessionToken;
    const wsId = auth.body.defaultWorkspaceId;

    // Seed an audit entry starting with a spreadsheet formula character
    dbInstance
      .prepare(
        `INSERT INTO audit_logs (
           id, workspace_id, actor_user_id, event_type, severity, detail,
           resource_type, resource_id, outcome, metadata_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'aud_formula_test',
        wsId,
        'tester',
        'SECURITY_SETTING_CHANGED',
        'warning',
        '=CMD("calc") potential injection',
        'settings',
        'sec_1',
        'success',
        '{}',
        new Date().toISOString()
      );

    const filtered = await apiJson<{ ok: boolean; logs: Array<{ id: string }> }>(
      `/api/v1/audit-logs/${wsId}?eventType=SECURITY_SETTING_CHANGED&search=potential`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(filtered.status).toBe(200);
    expect(filtered.body.logs.some((l) => l.id === 'aud_formula_test')).toBe(true);

    const csvRes = await fetch(`${baseUrl}/api/v1/audit-logs/${wsId}/export?format=csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(csvRes.status).toBe(200);
    const csvText = await csvRes.text();
    expect(csvText).toContain("'=CMD");

    // Append-only: DELETE route does not exist (404)
    const delAttempt = await apiJson(`/api/v1/audit-logs/${wsId}/aud_formula_test`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(delAttempt.status).toBe(404);
  });

  it('enforces SSRF URL policy on /integrations, blocks live checkout without merchant keys (501), and verifies HMAC billing webhooks idempotently', async () => {
    const auth = await apiJson<{ sessionToken: string; defaultWorkspaceId: string }>(
      '/api/v1/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          email: 'p78-billing@solodesk.test',
          password: 'StrongPassword#2026',
          displayName: 'Billing Owner',
        }),
      }
    );
    const token = auth.body.sessionToken;
    const wsId = auth.body.defaultWorkspaceId;

    // SSRF-blocked integration endpoint
    const ssrfRes = await apiJson(`/api/v1/integrations/${wsId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        provider: 'outbound_webhooks',
        category: 'webhook',
        displayName: 'Local SSRF',
        status: 'connected',
        endpointUrl: 'http://127.0.0.1:9000/hook',
      }),
    });
    expect(ssrfRes.status).toBe(400);

    // Valid integration lifecycle
    const intCreate = await apiJson<{ ok: boolean; integration: { id: string } }>(
      `/api/v1/integrations/${wsId}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          provider: 'outbound_webhooks',
          category: 'webhook',
          displayName: 'Zapier Webhook',
          status: 'connected',
          endpointUrl: 'https://hooks.example.com/zapier',
        }),
      }
    );
    expect(intCreate.status).toBe(201);
    const intId = intCreate.body.integration.id;

    const retryRes = await apiJson<{ ok: boolean; status: string }>(
      `/api/v1/integrations/${wsId}/${intId}/retry`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
    );
    expect(retryRes.status).toBe(200);
    expect(retryRes.body.status).toBe('connected');

    const discRes = await apiJson<{ ok: boolean; status: string }>(
      `/api/v1/integrations/${wsId}/${intId}/disconnect`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
    );
    expect(discRes.status).toBe(200);
    expect(discRes.body.status).toBe('disconnected');

    // Checkout readiness: free succeeds, pro returns 501 BLOCKED_EXTERNAL_PROVIDER_REQUIRED
    const freeRes = await apiJson<{ ok: boolean; checkoutStatus: string }>(
      '/api/v1/billing/checkout-session',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId: wsId, targetTier: 'free' }),
      }
    );
    expect(freeRes.status).toBe(200);
    expect(freeRes.body.checkoutStatus).toBe('local_free');

    const proRes = await apiJson<{ error: { code: string } }>('/api/v1/billing/checkout-session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ workspaceId: wsId, targetTier: 'pro' }),
    });
    expect(proRes.status).toBe(501);
    expect(proRes.body.error.code).toBe('BLOCKED_EXTERNAL_PROVIDER_REQUIRED');

    // Billing webhook rejects invalid signature
    const webhookBody = {
      eventId: 'evt_safepay_001',
      workspaceId: wsId,
      planTier: 'pro',
      billingStatus: 'active',
      amountCents: 1500,
      currency: 'USD',
    };
    const badSig = await apiJson('/api/v1/billing/webhook/safepay', {
      method: 'POST',
      headers: { 'x-billing-signature': 'deadbeef' },
      body: JSON.stringify(webhookBody),
    });
    expect(badSig.status).toBe(401);

    // Valid HMAC-SHA256 updates plan_tier and deduplicates replay
    const validSig = crypto
      .createHmac('sha256', process.env.BILLING_WEBHOOK_SECRET!)
      .update(JSON.stringify(webhookBody))
      .digest('hex');

    const firstWebhook = await apiJson<{ ok: boolean; processed: boolean; planTier: string }>(
      '/api/v1/billing/webhook/safepay',
      {
        method: 'POST',
        headers: { 'x-billing-signature': `sha256=${validSig}` },
        body: JSON.stringify(webhookBody),
      }
    );
    expect(firstWebhook.status).toBe(200);
    expect(firstWebhook.body.processed).toBe(true);
    expect(firstWebhook.body.planTier).toBe('pro');

    const wsRow = dbInstance
      .prepare('SELECT plan_tier AS planTier FROM workspaces WHERE id = ?')
      .get(wsId) as { planTier: string };
    expect(wsRow.planTier).toBe('pro');

    const replayWebhook = await apiJson<{ ok: boolean; idempotentReplay: boolean }>(
      '/api/v1/billing/webhook/safepay',
      {
        method: 'POST',
        headers: { 'x-billing-signature': validSig },
        body: JSON.stringify(webhookBody),
      }
    );
    expect(replayWebhook.status).toBe(200);
    expect(replayWebhook.body.idempotentReplay).toBe(true);
  });
});
