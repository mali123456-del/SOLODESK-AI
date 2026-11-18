// @vitest-environment node
import http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearRateLimitForTest } from '../../server/auth/authService';
import { createBackendApp } from '../../server/createApp';
import { signHmacSha256, verifyWebhookSignatureAndTimestamp } from '../../server/jobs/jobRunner';

let server: http.Server;
let baseUrl = '';
let dbInstance: DatabaseSync;

async function apiJson<T = Record<string, unknown>>(
  path: string,
  options: RequestInit = {}
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const body = (await res.json()) as T;
  return { status: res.status, body };
}

describe('Phases 37–53 Backend: Checkpoints, Invitations, Password Reset & Webhook Replay Protection', () => {
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

  it('tracks incremental sync checkpoints, workspace invitations, and password reset session invalidation', async () => {
    const regOwner = await apiJson<{
      sessionToken: string;
      defaultWorkspaceId: string;
    }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'p37-owner@solodesk.test',
        password: 'InitialPassword#2026',
        displayName: 'Phase37 Owner',
      }),
    });
    expect(regOwner.status).toBe(201);
    const ownerToken = regOwner.body.sessionToken;
    const wsId = regOwner.body.defaultWorkspaceId;

    // Push a sync change and confirm sync_checkpoint updates
    const pushRes = await apiJson<{ ok: boolean; ackedIds: string[]; serverTimestamp: string }>(
      '/api/v1/sync/push',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({
          workspaceId: wsId,
          changes: [
            {
              id: 'chg_1',
              entityType: 'client',
              entityId: 'cli_99',
              operation: 'upsert',
              revision: 1,
              payloadJson: JSON.stringify({ name: 'Atlas Corp' }),
              updatedAt: new Date().toISOString(),
            },
          ],
        }),
      }
    );
    expect(pushRes.status).toBe(200);
    expect(pushRes.body.ackedIds).toEqual(['chg_1']);

    const cpRes = await apiJson<{
      ok: boolean;
      checkpoint: { workspaceId: string; lastCursor: string } | null;
    }>(`/api/v1/sync/checkpoint?workspaceId=${wsId}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(cpRes.status).toBe(200);
    expect(cpRes.body.checkpoint?.workspaceId).toBe(wsId);
    expect(cpRes.body.checkpoint?.lastCursor).toBe(pushRes.body.serverTimestamp);

    // Workspace Invitation -> Register invitee -> Accept invite
    const inviteRes = await apiJson<{
      invitation: { testInviteToken?: string };
    }>(`/api/v1/workspaces/${wsId}/invitations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        email: 'p37-collab@solodesk.test',
        role: 'collaborator',
      }),
    });
    expect(inviteRes.status).toBe(201);
    const inviteToken = inviteRes.body.invitation.testInviteToken!;

    const regCollab = await apiJson<{ sessionToken: string }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'p37-collab@solodesk.test',
        password: 'CollabPassword#2026',
        displayName: 'Collab User',
      }),
    });
    expect(regCollab.status).toBe(201);

    const acceptRes = await apiJson<{ ok: boolean; workspaceId: string; role: string }>(
      '/api/v1/workspaces/invitations/accept',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${regCollab.body.sessionToken}` },
        body: JSON.stringify({ inviteToken }),
      }
    );
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.workspaceId).toBe(wsId);
    expect(acceptRes.body.role).toBe('collaborator');

    // Password reset revokes active owner session
    const resetReq = await apiJson<{ ok: boolean; testResetToken?: string }>(
      '/api/v1/auth/password-reset/request',
      {
        method: 'POST',
        body: JSON.stringify({ email: 'p37-owner@solodesk.test' }),
      }
    );
    expect(resetReq.status).toBe(200);
    expect(resetReq.body.testResetToken).toBeDefined();

    const resetConfirm = await apiJson<{ ok: boolean; sessionsRevoked: boolean }>(
      '/api/v1/auth/password-reset/confirm',
      {
        method: 'POST',
        body: JSON.stringify({
          token: resetReq.body.testResetToken,
          newPassword: 'RotatedPassword#2026',
        }),
      }
    );
    expect(resetConfirm.status).toBe(200);
    expect(resetConfirm.body.sessionsRevoked).toBe(true);

    // Old owner token must now fail with 401
    const staleMe = await apiJson('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(staleMe.status).toBe(401);
  });

  it('rotates webhook secrets and rejects replayed/stale HMAC webhook timestamps', async () => {
    const reg = await apiJson<{ sessionToken: string; defaultWorkspaceId: string }>(
      '/api/v1/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          email: 'webhook-admin@solodesk.test',
          password: 'WebhookPassword#2026',
          displayName: 'Webhook Admin',
        }),
      }
    );
    const token = reg.body.sessionToken;
    const wsId = reg.body.defaultWorkspaceId;

    const hookCreate = await apiJson<{ webhook: { id: string } }>('/api/v1/webhooks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        workspaceId: wsId,
        name: 'Invoice Events',
        url: 'https://example.com/webhooks/solodesk',
        eventType: 'invoice_created',
        secret: 'initial_secret_123',
      }),
    });
    expect(hookCreate.status).toBe(201);

    const rotateRes = await apiJson<{ ok: boolean; rotated: boolean }>(
      `/api/v1/webhooks/${hookCreate.body.webhook.id}/rotate-secret`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId: wsId }),
      }
    );
    expect(rotateRes.status).toBe(200);
    expect(rotateRes.body.rotated).toBe(true);

    const nowIso = new Date().toISOString();
    const staleIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const bodyJson = JSON.stringify({ event: 'invoice_created' });
    const sigFresh = `sha256=${signHmacSha256('my_secret', `${nowIso}.${bodyJson}`)}`;
    const sigStale = `sha256=${signHmacSha256('my_secret', `${staleIso}.${bodyJson}`)}`;

    expect(
      verifyWebhookSignatureAndTimestamp({
        secret: 'my_secret',
        timestampIso: nowIso,
        signatureHeader: sigFresh,
        bodyJson,
      }).valid
    ).toBe(true);

    expect(
      verifyWebhookSignatureAndTimestamp({
        secret: 'my_secret',
        timestampIso: staleIso,
        signatureHeader: sigStale,
        bodyJson,
      }).valid
    ).toBe(false);
  });
});
