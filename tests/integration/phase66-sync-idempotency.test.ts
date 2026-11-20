// @vitest-environment node
import http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearRateLimitForTest } from '../../server/auth/authService';
import { createBackendApp } from '../../server/createApp';

let server: http.Server;
let baseUrl = '';
let dbInstance: DatabaseSync;
let authCookie = '';
let workspaceId = '';

async function apiJson<T = Record<string, unknown>>(
  path: string,
  options: RequestInit = {}
): Promise<{ status: number; headers: Headers; body: T }> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(authCookie ? { Cookie: authCookie } : {}),
      ...(options.headers ?? {}),
    },
  });
  const body = (await res.json()) as T;
  return { status: res.status, headers: res.headers, body };
}

describe('Phase 66 Backend Integration: Idempotent Sync Push, Replay Safety & Tombstone Conflicts', () => {
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

    const reg = await apiJson<{
      ok: boolean;
      defaultWorkspaceId: string;
    }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'sync.audit@solodesk.test',
        password: 'StrongPassword#2026',
        displayName: 'Sync Auditor',
      }),
    });
    expect(reg.status).toBe(201);
    const setCookie = reg.headers.get('set-cookie') ?? '';
    authCookie = setCookie.split(';')[0];
    workspaceId = reg.body.defaultWorkspaceId;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    dbInstance?.close();
  });

  it('deduplicates repeated /sync/push batches by Idempotency-Key and rejects mismatched payload reuse', async () => {
    const idemKey = 'idem_batch_001';
    const payload = {
      workspaceId,
      changes: [
        {
          id: 'chg_1',
          entityType: 'client',
          entityId: 'cli_idem_1',
          operation: 'upsert' as const,
          revision: 1,
          payloadJson: JSON.stringify({ name: 'Idem Client' }),
          updatedAt: '2026-11-20T09:00:00.000Z',
        },
      ],
    };

    const first = await apiJson<{
      ok: boolean;
      ackedIds: string[];
      conflicts: unknown[];
      idempotentReplay?: boolean;
    }>('/api/v1/sync/push', {
      method: 'POST',
      headers: { 'Idempotency-Key': idemKey },
      body: JSON.stringify(payload),
    });
    expect(first.status).toBe(200);
    expect(first.body.ackedIds).toEqual(['chg_1']);
    expect(first.body.conflicts).toEqual([]);
    expect(first.body.idempotentReplay).toBeUndefined();

    // Replay identical request with same Idempotency-Key -> exact replay, NO false revision conflict, NO double metering
    const replay = await apiJson<{
      ok: boolean;
      ackedIds: string[];
      conflicts: unknown[];
      idempotentReplay?: boolean;
    }>('/api/v1/sync/push', {
      method: 'POST',
      headers: { 'Idempotency-Key': idemKey },
      body: JSON.stringify(payload),
    });
    expect(replay.status).toBe(200);
    expect(replay.body.ackedIds).toEqual(['chg_1']);
    expect(replay.body.conflicts).toEqual([]);
    expect(replay.body.idempotentReplay).toBe(true);

    const sub = dbInstance
      .prepare('SELECT sync_ops_month FROM subscriptions WHERE workspace_id = ?')
      .get(workspaceId) as { sync_ops_month: number };
    expect(sub.sync_ops_month).toBe(1);

    // Reuse same Idempotency-Key with DIFFERENT payload -> explicit 409 conflict
    const mismatch = await apiJson<{ error: { code: string } }>('/api/v1/sync/push', {
      method: 'POST',
      headers: { 'Idempotency-Key': idemKey },
      body: JSON.stringify({
        ...payload,
        changes: [{ ...payload.changes[0], payloadJson: JSON.stringify({ name: 'Tampered' }) }],
      }),
    });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
  });

  it('detects stale upsert conflicts against tombstones and returns deterministic pull snapshots', async () => {
    const deleteRes = await apiJson<{ ok: boolean; ackedIds: string[] }>('/api/v1/sync/push', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'idem_del_002' },
      body: JSON.stringify({
        workspaceId,
        changes: [
          {
            id: 'chg_del_1',
            entityType: 'client',
            entityId: 'cli_idem_1',
            operation: 'delete',
            revision: 3,
            payloadJson: '{}',
            updatedAt: '2026-11-20T10:00:00.000Z',
          },
        ],
      }),
    });
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.ackedIds).toEqual(['chg_del_1']);

    // Stale upsert at revision 2 against revision-3 tombstone -> must flag conflict instead of resurrecting
    const staleUpsert = await apiJson<{
      ok: boolean;
      ackedIds: string[];
      conflicts: Array<{ id: string; reason: string; serverRevision: number }>;
    }>('/api/v1/sync/push', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'idem_stale_003' },
      body: JSON.stringify({
        workspaceId,
        changes: [
          {
            id: 'chg_stale_1',
            entityType: 'client',
            entityId: 'cli_idem_1',
            operation: 'upsert',
            revision: 2,
            payloadJson: JSON.stringify({ name: 'Resurrected' }),
            updatedAt: '2026-11-20T09:30:00.000Z',
          },
        ],
      }),
    });
    expect(staleUpsert.status).toBe(200);
    expect(staleUpsert.body.ackedIds).toEqual([]);
    expect(staleUpsert.body.conflicts).toHaveLength(1);
    expect(staleUpsert.body.conflicts[0].serverRevision).toBe(3);

    const pull = await apiJson<{
      ok: boolean;
      records: Array<{ entityId: string }>;
      tombstones: Array<{ entityId: string; revision: number }>;
    }>(`/api/v1/sync/pull?workspaceId=${encodeURIComponent(workspaceId)}`);
    expect(pull.status).toBe(200);
    expect(pull.body.records).toHaveLength(0);
    expect(pull.body.tombstones).toHaveLength(1);
    expect(pull.body.tombstones[0].entityId).toBe('cli_idem_1');
  });
});
