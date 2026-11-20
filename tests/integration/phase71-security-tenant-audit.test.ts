// @vitest-environment node
import http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearRateLimitForTest } from '../../server/auth/authService';
import { createBackendApp } from '../../server/createApp';
import {
  dispatchServerWebhookTest,
  signHmacSha256,
  verifyWebhookSignatureAndTimestamp,
} from '../../server/jobs/jobRunner';
import { scrubSensitiveData } from '../../server/monitoring/telemetry';
import {
  assertAgentToolAllowed,
  enforceDelegatedToolAllowed,
} from '../../src/ai/agents/agentRegistry';
import { validatePublicHttpUrl } from '../../src/security/urlPolicy';

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

describe('Phase 71: Security Hardening, Tenant Parameter Isolation, SSRF, RBAC & Secret Scrubbing', () => {
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

  it('denies cross-tenant reads/writes, workspaceId parameter pollution, unauthenticated scoped AI billing, and client_viewer internal access', async () => {
    const ownerA = await apiJson<{ sessionToken: string; defaultWorkspaceId: string }>(
      '/api/v1/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          email: 'sec-owner-a@solodesk.test',
          password: 'SecurityOwnerA#2026',
          displayName: 'Owner A',
        }),
      }
    );
    expect(ownerA.status).toBe(201);
    const tokA = ownerA.body.sessionToken;
    const wsA = ownerA.body.defaultWorkspaceId;

    const ownerB = await apiJson<{ sessionToken: string; defaultWorkspaceId: string }>(
      '/api/v1/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          email: 'sec-owner-b@solodesk.test',
          password: 'SecurityOwnerB#2026',
          displayName: 'Owner B',
        }),
      }
    );
    expect(ownerB.status).toBe(201);
    const tokB = ownerB.body.sessionToken;
    const wsB = ownerB.body.defaultWorkspaceId;

    // 1. Parameter pollution mismatch (?workspaceId=wsB with body workspaceId=wsA) -> 400 TENANT_PARAM_MISMATCH
    const mismatchPollute = await apiJson<{ error: { code: string } }>(
      `/api/v1/sync/push?workspaceId=${encodeURIComponent(wsB)}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokB}` },
        body: JSON.stringify({
          workspaceId: wsA,
          changes: [
            {
              id: 'chg_pollute',
              entityType: 'client',
              entityId: 'cli_p',
              operation: 'upsert',
              revision: 1,
              payloadJson: '{}',
              updatedAt: new Date().toISOString(),
            },
          ],
        }),
      }
    );
    expect(mismatchPollute.status).toBe(400);
    expect(mismatchPollute.body.error.code).toBe('TENANT_PARAM_MISMATCH');

    // 2. Duplicate workspaceId query param array (?workspaceId=wsB&workspaceId=wsA) -> 400 VALIDATION_ERROR
    const arrayParam = await apiJson<{ error: { code: string } }>(
      `/api/v1/sync/pull?workspaceId=${encodeURIComponent(wsB)}&workspaceId=${encodeURIComponent(wsA)}`,
      { headers: { Authorization: `Bearer ${tokB}` } }
    );
    expect(arrayParam.status).toBe(400);
    expect(arrayParam.body.error.code).toBe('VALIDATION_ERROR');

    // 3. Cross-tenant /ai/generate metering abuse blocked (unauthenticated -> 401, non-member -> 403)
    const aiUnauthWs = await apiJson('/api/v1/ai/generate', {
      method: 'POST',
      body: JSON.stringify({ workspaceId: wsA, prompt: 'Charge victim quota' }),
    });
    expect(aiUnauthWs.status).toBe(401);

    const aiCrossTenantWs = await apiJson('/api/v1/ai/generate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokB}` },
      body: JSON.stringify({ workspaceId: wsA, prompt: 'Cross tenant quota check' }),
    });
    expect(aiCrossTenantWs.status).toBe(403);

    // 4. Cross-tenant denial across storage, RAG, jobs, webhooks, analytics, billing, audit
    for (const [route, opts] of [
      [`/api/v1/storage/objects?workspaceId=${wsA}`, { method: 'GET' }],
      [`/api/v1/jobs?workspaceId=${wsA}`, { method: 'GET' }],
      [`/api/v1/webhooks?workspaceId=${wsA}`, { method: 'GET' }],
      [`/api/v1/analytics/overview/${wsA}`, { method: 'GET' }],
      [`/api/v1/billing/subscription/${wsA}`, { method: 'GET' }],
      [`/api/v1/security/audit/${wsA}`, { method: 'GET' }],
    ] as Array<[string, RequestInit]>) {
      const denied = await apiJson(route, {
        ...opts,
        headers: { Authorization: `Bearer ${tokB}` },
      });
      expect(denied.status, `Expected 403 on ${route}`).toBe(403);
    }

    // 5. Invite Owner B strictly as client_viewer of wsA and verify internal objects/RAG/writes stay hidden
    const uploadConfidential = await apiJson('/api/v1/storage/objects', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokA}` },
      body: JSON.stringify({
        workspaceId: wsA,
        name: 'internal-tax.txt',
        mimeType: 'text/plain',
        classification: 'confidential',
        contentBase64: Buffer.from('Secret tax formula').toString('base64'),
      }),
    });
    expect(uploadConfidential.status).toBe(201);

    await apiJson('/api/v1/rag/documents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokA}` },
      body: JSON.stringify({
        workspaceId: wsA,
        title: 'Internal Cost Margin',
        content: 'Confidential internal payroll margin 42 percent.',
        accessScope: 'internal_only',
      }),
    });

    await apiJson(`/api/v1/workspaces/${wsA}/members`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokA}` },
      body: JSON.stringify({ userEmail: 'sec-owner-b@solodesk.test', role: 'client_viewer' }),
    });

    const viewerObjects = await apiJson<{ objects: Array<{ name: string }> }>(
      `/api/v1/storage/objects?workspaceId=${wsA}`,
      { headers: { Authorization: `Bearer ${tokB}` } }
    );
    expect(viewerObjects.status).toBe(200);
    expect(viewerObjects.body.objects).toHaveLength(0);

    const viewerRag = await apiJson<{ appliedAccessScope: string; matches: unknown[] }>(
      '/api/v1/rag/search',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokB}` },
        body: JSON.stringify({
          workspaceId: wsA,
          query: 'payroll margin 42 percent',
          requestedScope: 'internal_only',
        }),
      }
    );
    expect(viewerRag.status).toBe(200);
    expect(viewerRag.body.appliedAccessScope).toBe('client_portal');
    expect(viewerRag.body.matches).toHaveLength(0);

    const viewerAi = await apiJson('/api/v1/ai/generate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokB}` },
      body: JSON.stringify({ workspaceId: wsA, prompt: 'Try generating AI text' }),
    });
    expect(viewerAi.status).toBe(403);
  });

  it('rejects invite acceptance by mismatched email and blocks expired/forged reset tokens', async () => {
    const inviter = await apiJson<{ sessionToken: string; defaultWorkspaceId: string }>(
      '/api/v1/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          email: 'inviter@solodesk.test',
          password: 'InviterPass#2026',
          displayName: 'Inviter',
        }),
      }
    );
    const inviteRes = await apiJson<{ invitation: { testInviteToken?: string } }>(
      `/api/v1/workspaces/${inviter.body.defaultWorkspaceId}/invitations`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${inviter.body.sessionToken}` },
        body: JSON.stringify({ email: 'intended-user@solodesk.test', role: 'manager' }),
      }
    );
    expect(inviteRes.status).toBe(201);

    const attacker = await apiJson<{ sessionToken: string }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'wrong-user@solodesk.test',
        password: 'WrongUserPass#2026',
        displayName: 'Wrong User',
      }),
    });

    const hijackAttempt = await apiJson<{ error: { code: string } }>(
      '/api/v1/workspaces/invitations/accept',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${attacker.body.sessionToken}` },
        body: JSON.stringify({ inviteToken: inviteRes.body.invitation.testInviteToken }),
      }
    );
    expect(hijackAttempt.status).toBe(400);
    expect(hijackAttempt.body.error.code).toBe('INVITE_INVALID_OR_EXPIRED');

    const badReset = await apiJson<{ error: { code: string } }>(
      '/api/v1/auth/password-reset/confirm',
      {
        method: 'POST',
        body: JSON.stringify({
          token: 'sdr_000000000000000000000000000000000000000000000000',
          newPassword: 'ResetPassword#2026',
        }),
      }
    );
    expect(badReset.status).toBe(400);
    expect(badReset.body.error.code).toBe('INVALID_OR_EXPIRED_TOKEN');
  });

  it('blocks SSRF internal/metadata URLs, enforces webhook redirect=error & HMAC replay window, enforces agent non-escalation, and scrubs telemetry secrets', async () => {
    // 1. SSRF URL checks
    for (const unsafeUrl of [
      'http://127.0.0.1/admin',
      'http://169.254.169.254/latest/meta-data',
      'http://10.0.0.5:8080/hook',
      'http://100.64.1.2/cgnat',
      'http://[::ffff:127.0.0.1]/loopback',
      'http://metadata.internal/secret',
      'file:///etc/passwd',
      'https://user:pass@example.com/hook',
    ]) {
      expect(validatePublicHttpUrl(unsafeUrl).valid, `Expected ${unsafeUrl} blocked`).toBe(false);
    }
    expect(validatePublicHttpUrl('https://webhooks.example.com/events').valid).toBe(true);

    // 2. Webhook test dispatch enforces redirect: 'error'
    const reg = await apiJson<{ sessionToken: string; defaultWorkspaceId: string }>(
      '/api/v1/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          email: 'hook-sec@solodesk.test',
          password: 'HookSecurity#2026',
          displayName: 'Hook Sec',
        }),
      }
    );
    const wsId = reg.body.defaultWorkspaceId;
    const hookCreated = await apiJson<{ webhook: { id: string } }>('/api/v1/webhooks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${reg.body.sessionToken}` },
      body: JSON.stringify({
        workspaceId: wsId,
        name: 'Redirect Guard Hook',
        url: 'https://webhooks.example.com/solodesk',
        eventType: 'invoice_paid',
      }),
    });
    expect(hookCreated.status).toBe(201);

    let capturedRedirect: RequestRedirect | undefined;
    await dispatchServerWebhookTest(dbInstance, {
      workspaceId: wsId,
      webhookId: hookCreated.body.webhook.id,
      signingSecret: 'sdwh_testsecret',
      fetchImpl: async (_url, init) => {
        capturedRedirect = init?.redirect;
        return new Response('ok', { status: 200 });
      },
    });
    expect(capturedRedirect).toBe('error');

    const nowIso = new Date().toISOString();
    const tamperedSig = `sha256=${signHmacSha256('wrong_secret', `${nowIso}.{}`)}`;
    expect(
      verifyWebhookSignatureAndTimestamp({
        secret: 'right_secret',
        timestampIso: nowIso,
        signatureHeader: tamperedSig,
        bodyJson: '{}',
      }).valid
    ).toBe(false);

    // 3. Agent registry privilege non-escalation & delegation intersection
    expect(() => assertAgentToolAllowed('workspace_analyst', 'create_task_draft')).toThrow();
    expect(() => assertAgentToolAllowed('proposal_drafter', 'create_proposal_draft')).toThrow();
    expect(() =>
      enforceDelegatedToolAllowed('solodesk_orchestrator', 'workspace_analyst', 'create_task_draft')
    ).toThrow();
    expect(() =>
      enforceDelegatedToolAllowed('solodesk_orchestrator', 'proposal_drafter', 'search_clients')
    ).toThrow();

    // 4. Secret & session token scrubbing in telemetry logs
    const scrubbed = scrubSensitiveData({
      sessionToken: 'sd_0123456789abcdef0123456789abcdef',
      signingSecret: 'sdwh_supersecret',
      nested: {
        error: 'Auth failed with Bearer sd_deadbeefdeadbeefdeadbeefdeadbeef and AIzaSyAbCdEfGhIjKlMnOpQrStUvWx',
      },
    }) as {
      sessionToken: string;
      signingSecret: string;
      nested: { error: string };
    };

    expect(scrubbed.sessionToken).toBe('[REDACTED]');
    expect(scrubbed.signingSecret).toBe('[REDACTED]');
    expect(scrubbed.nested.error).not.toContain('sd_deadbeef');
    expect(scrubbed.nested.error).not.toContain('AIzaSyAbCd');
    expect(scrubbed.nested.error).toContain('[REDACTED_TOKEN]');
    expect(scrubbed.nested.error).toContain('[REDACTED_KEY]');
  });
});
