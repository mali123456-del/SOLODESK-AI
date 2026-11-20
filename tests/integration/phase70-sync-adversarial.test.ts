// @vitest-environment node
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearRateLimitForTest } from '../../server/auth/authService';
import { createBackendApp } from '../../server/createApp';
import type { SyncQueueItem } from '../../src/domain/schemas/entities';
import {
  buildResolvedPendingPatch,
  deriveRemoteSyncLifecycleStatus,
  pushSyncQueueWithRetry,
  resolveSyncConflict,
} from '../../src/services/cloudSyncService';

let server: http.Server;
let baseUrl = '';
let dbInstance: DatabaseSync;
let tokenOwner = '';
let workspaceId = '';

async function startServerForDb(sqlitePath: string): Promise<{
  server: http.Server;
  baseUrl: string;
  db: DatabaseSync;
}> {
  const { app, db } = createBackendApp({ sqlitePath, serveStatic: false });
  let url = '';
  const srv = await new Promise<http.Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => {
      const addr = listening.address();
      if (addr && typeof addr === 'object') {
        url = `http://127.0.0.1:${addr.port}`;
      }
      resolve(listening);
    });
  });
  return { server: srv, baseUrl: url, db };
}

async function apiJson<T = Record<string, unknown>>(
  targetBase: string,
  route: string,
  options: RequestInit = {}
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${targetBase}${route}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const body = (await res.json()) as T;
  return { status: res.status, body };
}

function makeQueueItem(overrides: Partial<SyncQueueItem> = {}): SyncQueueItem {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? `syq_${Math.random().toString(36).slice(2, 10)}`,
    entityType: overrides.entityType ?? 'client',
    entityId: overrides.entityId ?? 'cli_adv_1',
    operation: overrides.operation ?? 'upsert',
    revision: overrides.revision ?? 1,
    status: overrides.status ?? 'pending',
    conflictReason: overrides.conflictReason ?? '',
    payloadJson: overrides.payloadJson ?? JSON.stringify({ name: 'Adversarial Test' }),
    updatedAt: overrides.updatedAt ?? now,
    createdAt: overrides.createdAt ?? now,
  };
}

describe('Phase 70: Sync Engine Adversarial Testing & Idempotency Reliability', () => {
  beforeAll(async () => {
    clearRateLimitForTest();
    const started = await startServerForDb(':memory:');
    server = started.server;
    baseUrl = started.baseUrl;
    dbInstance = started.db;

    const reg = await apiJson<{
      sessionToken: string;
      defaultWorkspaceId: string;
    }>(baseUrl, '/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'phase70-sync@solodesk.test',
        password: 'SyncAdversarial#2026',
        displayName: 'Phase70 Owner',
      }),
    });
    expect(reg.status).toBe(201);
    tokenOwner = reg.body.sessionToken;
    workspaceId = reg.body.defaultWorkspaceId;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    dbInstance?.close();
  });

  it('1 & 2. handles identical idempotency replay and rejects payload mutation on reused key (409)', async () => {
    const key = 'idem_p70_exact_001';
    const body = {
      workspaceId,
      changes: [
        {
          id: 'chg_exact_1',
          entityType: 'project',
          entityId: 'prj_idem_70',
          operation: 'upsert' as const,
          revision: 1,
          payloadJson: JSON.stringify({ name: 'Alpha Delivery', budget: 1500 }),
          updatedAt: '2026-11-20T11:00:00.000Z',
        },
      ],
    };

    const first = await apiJson<{ ackedIds: string[]; idempotentReplay?: boolean }>(
      baseUrl,
      '/api/v1/sync/push',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenOwner}`, 'Idempotency-Key': key },
        body: JSON.stringify(body),
      }
    );
    expect(first.status).toBe(200);
    expect(first.body.ackedIds).toEqual(['chg_exact_1']);
    expect(first.body.idempotentReplay).toBeUndefined();

    // Equivalent payload with reordered object keys should match canonical hash and replay cleanly
    const replayReordered = await apiJson<{ ackedIds: string[]; idempotentReplay?: boolean }>(
      baseUrl,
      '/api/v1/sync/push',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenOwner}`, 'Idempotency-Key': key },
        body: JSON.stringify({
          changes: [
            {
              updatedAt: '2026-11-20T11:00:00.000Z',
              payloadJson: JSON.stringify({ name: 'Alpha Delivery', budget: 1500 }),
              revision: 1,
              operation: 'upsert',
              entityId: 'prj_idem_70',
              entityType: 'project',
              id: 'chg_exact_1',
            },
          ],
          workspaceId,
        }),
      }
    );
    expect(replayReordered.status).toBe(200);
    expect(replayReordered.body.idempotentReplay).toBe(true);
    expect(replayReordered.body.ackedIds).toEqual(['chg_exact_1']);

    // Mutated payload with same key -> explicit 409 IDEMPOTENCY_KEY_CONFLICT
    const conflict = await apiJson<{ error: { code: string } }>(baseUrl, '/api/v1/sync/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenOwner}`, 'Idempotency-Key': key },
      body: JSON.stringify({
        workspaceId,
        changes: [{ ...body.changes[0], payloadJson: JSON.stringify({ name: 'Mutated' }) }],
      }),
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
  });

  it('3. serializes concurrent duplicate push requests with identical Idempotency-Key without constraint crash', async () => {
    const key = 'idem_concurrent_race_70';
    const payload = {
      workspaceId,
      changes: [
        {
          id: 'chg_race_1',
          entityType: 'task',
          entityId: 'tsk_race_70',
          operation: 'upsert' as const,
          revision: 1,
          payloadJson: JSON.stringify({ title: 'Concurrent Push' }),
          updatedAt: '2026-11-20T11:05:00.000Z',
        },
      ],
    };

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        apiJson<{ ok: boolean; ackedIds: string[]; idempotentReplay?: boolean }>(
          baseUrl,
          '/api/v1/sync/push',
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenOwner}`, 'Idempotency-Key': key },
            body: JSON.stringify(payload),
          }
        )
      )
    );

    expect(responses.every((r) => r.status === 200 && r.body.ok)).toBe(true);
    const freshCount = responses.filter((r) => !r.body.idempotentReplay).length;
    const replayCount = responses.filter((r) => r.body.idempotentReplay).length;
    expect(freshCount).toBe(1);
    expect(replayCount).toBe(4);
  });

  it('4 & 6. recovers from dropped network and request timeout using identical Idempotency-Key on retry', async () => {
    const item = makeQueueItem({ id: 'syq_drop_1', entityId: 'cli_drop_70', revision: 1 });
    let callCount = 0;
    const seenKeys: string[] = [];

    const result = await pushSyncQueueWithRetry({
      endpointUrl: `${baseUrl}/api/v1`,
      workspaceId,
      authToken: tokenOwner,
      items: [item],
      maxAttempts: 4,
      baseDelayMs: 5,
      maxDelayMs: 20,
      sleepImpl: async () => Promise.resolve(),
      fetchImpl: async (url, init) => {
        callCount += 1;
        const headers = new Headers(init?.headers);
        seenKeys.push(headers.get('Idempotency-Key') ?? '');
        if (callCount === 1) {
          throw new Error('ECONNRESET: simulated network drop');
        }
        if (callCount === 2) {
          return new Response(JSON.stringify({ error: { message: 'Gateway timeout' } }), {
            status: 504,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return fetch(url, init);
      },
    });

    expect(callCount).toBe(3);
    expect(new Set(seenKeys).size).toBe(1);
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(3);
    expect(result.ackedIds).toEqual(['syq_drop_1']);
  });

  it('5. preserves idempotency replay and synced state across server restart on disk-backed SQLite', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'solodesk-p70-restart-'));
    const sqlitePath = path.join(tempDir, 'sync-restart.sqlite');
    let boot1 = await startServerForDb(sqlitePath);
    let boot2: Awaited<ReturnType<typeof startServerForDb>> | null = null;

    try {
      const reg = await apiJson<{ sessionToken: string; defaultWorkspaceId: string }>(
        boot1.baseUrl,
        '/api/v1/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({
            email: 'restart@solodesk.test',
            password: 'RestartPass#2026',
            displayName: 'Restart Tester',
          }),
        }
      );
      expect(reg.status).toBe(201);
      const tok = reg.body.sessionToken;
      const ws = reg.body.defaultWorkspaceId;

      const idemKey = 'idem_across_restart_001';
      const batch = {
        workspaceId: ws,
        changes: [
          {
            id: 'chg_restart_1',
            entityType: 'invoice',
            entityId: 'inv_restart_1',
            operation: 'upsert' as const,
            revision: 1,
            payloadJson: JSON.stringify({ number: 'INV-R1', total: 900 }),
            updatedAt: '2026-11-20T11:10:00.000Z',
          },
        ],
      };

      const pushed = await apiJson<{ ackedIds: string[] }>(boot1.baseUrl, '/api/v1/sync/push', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Idempotency-Key': idemKey },
        body: JSON.stringify(batch),
      });
      expect(pushed.status).toBe(200);
      expect(pushed.body.ackedIds).toEqual(['chg_restart_1']);

      // Simulate process crash / restart cleanly
      await new Promise<void>((resolve) => boot1.server.close(() => resolve()));
      boot1.db.close();

      boot2 = await startServerForDb(sqlitePath);
      const replayAfterRestart = await apiJson<{
        ackedIds: string[];
        conflicts: unknown[];
        idempotentReplay?: boolean;
      }>(boot2.baseUrl, '/api/v1/sync/push', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Idempotency-Key': idemKey },
        body: JSON.stringify(batch),
      });
      expect(replayAfterRestart.status).toBe(200);
      expect(replayAfterRestart.body.idempotentReplay).toBe(true);
      expect(replayAfterRestart.body.ackedIds).toEqual(['chg_restart_1']);
      expect(replayAfterRestart.body.conflicts).toEqual([]);
    } finally {
      if (boot2) {
        await new Promise<void>((resolve) => boot2!.server.close(() => resolve()));
        boot2.db.close();
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('7. handles duplicate pull deliveries and paginated monotonic cursors without dropping records', async () => {
    // Push two batches rapidly back-to-back
    const p1 = await apiJson<{ serverTimestamp: string }>(baseUrl, '/api/v1/sync/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenOwner}`, 'Idempotency-Key': 'idem_pull_1' },
      body: JSON.stringify({
        workspaceId,
        changes: [
          {
            id: 'chg_p1',
            entityType: 'note',
            entityId: 'not_pull_1',
            operation: 'upsert',
            revision: 1,
            payloadJson: '{"text":"first"}',
            updatedAt: '2026-11-20T11:20:00.000Z',
          },
        ],
      }),
    });
    const p2 = await apiJson<{ serverTimestamp: string }>(baseUrl, '/api/v1/sync/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenOwner}`, 'Idempotency-Key': 'idem_pull_2' },
      body: JSON.stringify({
        workspaceId,
        changes: [
          {
            id: 'chg_p2',
            entityType: 'note',
            entityId: 'not_pull_2',
            operation: 'upsert',
            revision: 1,
            payloadJson: '{"text":"second"}',
            updatedAt: '2026-11-20T11:20:00.000Z',
          },
        ],
      }),
    });
    expect(p1.status).toBe(200);
    expect(p2.status).toBe(200);
    expect(p2.body.serverTimestamp > p1.body.serverTimestamp).toBe(true);

    // Duplicate pulls for the same since cursor return identical deterministic results
    const pullA = await apiJson<{ records: Array<{ entityId: string }>; nextCursor: string }>(
      baseUrl,
      `/api/v1/sync/pull?workspaceId=${encodeURIComponent(workspaceId)}&since=${encodeURIComponent(p1.body.serverTimestamp)}`,
      { headers: { Authorization: `Bearer ${tokenOwner}` } }
    );
    const pullB = await apiJson<{ records: Array<{ entityId: string }>; nextCursor: string }>(
      baseUrl,
      `/api/v1/sync/pull?workspaceId=${encodeURIComponent(workspaceId)}&since=${encodeURIComponent(p1.body.serverTimestamp)}`,
      { headers: { Authorization: `Bearer ${tokenOwner}` } }
    );
    expect(pullA.body.records.map((r) => r.entityId)).toEqual(['not_pull_2']);
    expect(pullB.body.records).toEqual(pullA.body.records);
  });

  it('8, 9, 10 & 11. enforces revision ordering, simultaneous edit conflict detection, tombstone conflicts, and post-resolution ACK lifecycle', async () => {
    // Device A writes revision 3
    const devA = await apiJson<{ ackedIds: string[] }>(baseUrl, '/api/v1/sync/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenOwner}`, 'Idempotency-Key': 'idem_dev_a_r3' },
      body: JSON.stringify({
        workspaceId,
        changes: [
          {
            id: 'chg_dev_a',
            entityType: 'client',
            entityId: 'cli_conflict_70',
            operation: 'upsert',
            revision: 3,
            payloadJson: JSON.stringify({ name: 'Device A Winner' }),
            updatedAt: '2026-11-20T11:30:00.000Z',
          },
        ],
      }),
    });
    expect(devA.body.ackedIds).toEqual(['chg_dev_a']);

    // Device B sends stale out-of-order / simultaneous revision 2 -> MUST conflict, NOT overwrite
    const devB = await apiJson<{
      ackedIds: string[];
      conflicts: Array<{ id: string; serverRevision: number }>;
    }>(baseUrl, '/api/v1/sync/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenOwner}`, 'Idempotency-Key': 'idem_dev_b_r2' },
      body: JSON.stringify({
        workspaceId,
        changes: [
          {
            id: 'chg_dev_b',
            entityType: 'client',
            entityId: 'cli_conflict_70',
            operation: 'upsert',
            revision: 2,
            payloadJson: JSON.stringify({ name: 'Device B Stale' }),
            updatedAt: '2026-11-20T11:29:59.000Z',
          },
        ],
      }),
    });
    expect(devB.body.ackedIds).toEqual([]);
    expect(devB.body.conflicts).toHaveLength(1);
    expect(devB.body.conflicts[0].serverRevision).toBe(3);

    // Delete with tombstone at revision 4 -> stale upsert at rev 4 conflicts -> resurrection at rev 5 succeeds
    const delRes = await apiJson<{ ackedIds: string[] }>(baseUrl, '/api/v1/sync/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenOwner}`, 'Idempotency-Key': 'idem_del_r4' },
      body: JSON.stringify({
        workspaceId,
        changes: [
          {
            id: 'chg_del_r4',
            entityType: 'client',
            entityId: 'cli_conflict_70',
            operation: 'delete',
            revision: 4,
            payloadJson: '{}',
            updatedAt: '2026-11-20T11:31:00.000Z',
          },
        ],
      }),
    });
    expect(delRes.body.ackedIds).toEqual(['chg_del_r4']);

    const staleAgainstTomb = await apiJson<{
      ackedIds: string[];
      conflicts: Array<{ id: string; serverRevision: number }>;
    }>(baseUrl, '/api/v1/sync/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenOwner}`, 'Idempotency-Key': 'idem_tomb_conflict_r4' },
      body: JSON.stringify({
        workspaceId,
        changes: [
          {
            id: 'chg_res_local',
            entityType: 'client',
            entityId: 'cli_conflict_70',
            operation: 'upsert',
            revision: 4,
            payloadJson: JSON.stringify({ name: 'Local Edit Before Seeing Delete' }),
            updatedAt: '2026-11-20T11:31:01.000Z',
          },
        ],
      }),
    });
    expect(staleAgainstTomb.body.ackedIds).toEqual([]);
    expect(staleAgainstTomb.body.conflicts[0].serverRevision).toBe(4);

    // Local resolution only transitions Conflict -> Pending and bumps revision > serverRevision
    const decision = resolveSyncConflict({
      localUpdatedAt: '2026-11-20T11:31:01.000Z',
      remoteUpdatedAt: '2026-11-20T11:31:00.000Z',
      strategy: 'local_wins',
    });
    const resolvedPatch = buildResolvedPendingPatch(
      decision,
      staleAgainstTomb.body.conflicts[0].serverRevision + 1
    );
    expect(resolvedPatch.status).toBe('pending');
    expect(resolvedPatch.revision).toBe(5);

    const resolvedQueueItem = makeQueueItem({
      id: 'chg_res_local',
      entityId: 'cli_conflict_70',
      revision: resolvedPatch.revision!,
      status: resolvedPatch.status,
      payloadJson: JSON.stringify({ name: 'Explicitly Restored Client' }),
    });
    expect(
      deriveRemoteSyncLifecycleStatus({ syncQueue: [resolvedQueueItem], remoteConfigured: true })
    ).toBe('pending');

    const nextPush = await pushSyncQueueWithRetry({
      endpointUrl: `${baseUrl}/api/v1`,
      workspaceId,
      authToken: tokenOwner,
      items: [resolvedQueueItem],
      maxAttempts: 2,
      baseDelayMs: 5,
    });
    expect(nextPush.ok).toBe(true);
    expect(nextPush.ackedIds).toEqual(['chg_res_local']);
  });

  it('12, 13 & 14. handles retry budget exhaustion, immediate stop on non-retryable 4xx, and auth expiration (401)', async () => {
    const item = makeQueueItem({ id: 'syq_exhaust_1', entityId: 'cli_exhaust_70', revision: 1 });

    // 12. Exhausts bounded exponential backoff on persistent 503
    const exhausted = await pushSyncQueueWithRetry({
      endpointUrl: `${baseUrl}/api/v1`,
      workspaceId,
      authToken: tokenOwner,
      items: [item],
      maxAttempts: 3,
      baseDelayMs: 25,
      maxDelayMs: 100,
      sleepImpl: async () => Promise.resolve(),
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: { message: 'Service unavailable' } }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    expect(exhausted.ok).toBe(false);
    expect(exhausted.attempts).toBe(3);
    expect(exhausted.delaysMs).toEqual([25, 50]);
    expect(exhausted.failedIds).toEqual(['syq_exhaust_1']);

    // 13. Non-retryable 400 validation error stops on attempt 1 without wasting retries
    const nonRetryable = await pushSyncQueueWithRetry({
      endpointUrl: `${baseUrl}/api/v1`,
      workspaceId,
      authToken: tokenOwner,
      items: [makeQueueItem({ id: 'syq_bad_1', revision: 0 })], // invalid revision < 1 triggers 400
      maxAttempts: 3,
      baseDelayMs: 25,
      sleepImpl: async () => Promise.resolve(),
    });
    expect(nonRetryable.ok).toBe(false);
    expect(nonRetryable.httpStatus).toBe(400);
    expect(nonRetryable.retryable).toBe(false);
    expect(nonRetryable.attempts).toBe(1);
    expect(nonRetryable.delaysMs).toEqual([]);

    // 14. Expired / revoked session returns 401 and stops immediately with failedIds
    const regTmp = await apiJson<{ sessionToken: string; defaultWorkspaceId: string }>(
      baseUrl,
      '/api/v1/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          email: 'expiry-sync@solodesk.test',
          password: 'ExpiryPassword#2026',
          displayName: 'Expiry Sync User',
        }),
      }
    );
    const logout = await apiJson(baseUrl, '/api/v1/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${regTmp.body.sessionToken}` },
    });
    expect(logout.status).toBe(200);

    const expiredRes = await pushSyncQueueWithRetry({
      endpointUrl: `${baseUrl}/api/v1`,
      workspaceId: regTmp.body.defaultWorkspaceId,
      authToken: regTmp.body.sessionToken,
      items: [makeQueueItem({ id: 'syq_unauth_1', entityId: 'cli_unauth' })],
      maxAttempts: 3,
      baseDelayMs: 25,
      sleepImpl: async () => Promise.resolve(),
    });
    expect(expiredRes.ok).toBe(false);
    expect(expiredRes.httpStatus).toBe(401);
    expect(expiredRes.retryable).toBe(false);
    expect(expiredRes.attempts).toBe(1);
    expect(expiredRes.failedIds).toEqual(['syq_unauth_1']);
  });
});
