import { createId, type SyncQueueItem } from '../domain/schemas/entities';

export type WorkspaceMemberRole =
  | 'owner'
  | 'admin'
  | 'manager'
  | 'collaborator'
  | 'client_viewer';

export interface SyncResolutionDecision {
  winner: 'local' | 'remote';
  reason: string;
  resolvedUpdatedAt: string;
}

export interface RemoteSyncAdapterConfig {
  endpointUrl: string;
  workspaceSlug: string;
  tenantId: string;
  mode: 'local_only' | 'custom_sync_endpoint';
}

export type SyncLifecycleStatus =
  | 'local_only'
  | 'pending'
  | 'syncing'
  | 'synced'
  | 'conflict'
  | 'failed';

export const SYNC_LIFECYCLE_LABELS: Record<SyncLifecycleStatus, string> = {
  local_only: 'Local Only',
  pending: 'Pending',
  syncing: 'Syncing',
  synced: 'Synced',
  conflict: 'Conflict',
  failed: 'Failed',
};

export interface ServerSyncPushResult {
  ok: boolean;
  ackedIds: string[];
  conflicts: Array<{
    id: string;
    reason: string;
    serverRevision?: number;
    serverUpdatedAt?: string;
  }>;
  failedIds: string[];
  serverTimestamp: string;
  errorMessage?: string;
  httpStatus?: number;
  retryable?: boolean;
  idempotentReplay?: boolean;
}

export const ROLE_PERMISSION_MATRIX: Record<
  WorkspaceMemberRole,
  {
    label: string;
    canEditClients: boolean;
    canEditInvoices: boolean;
    canManageSecurity: boolean;
    canManageMembers: boolean;
    canApproveWorkflows: boolean;
    canViewClientPortalOnly: boolean;
  }
> = {
  owner: {
    label: 'Workspace Owner',
    canEditClients: true,
    canEditInvoices: true,
    canManageSecurity: true,
    canManageMembers: true,
    canApproveWorkflows: true,
    canViewClientPortalOnly: false,
  },
  admin: {
    label: 'Workspace Administrator',
    canEditClients: true,
    canEditInvoices: true,
    canManageSecurity: true,
    canManageMembers: true,
    canApproveWorkflows: true,
    canViewClientPortalOnly: false,
  },
  manager: {
    label: 'Project & Finance Manager',
    canEditClients: true,
    canEditInvoices: true,
    canManageSecurity: false,
    canManageMembers: false,
    canApproveWorkflows: true,
    canViewClientPortalOnly: false,
  },
  collaborator: {
    label: 'Delivery Member',
    canEditClients: false,
    canEditInvoices: false,
    canManageSecurity: false,
    canManageMembers: false,
    canApproveWorkflows: false,
    canViewClientPortalOnly: false,
  },
  client_viewer: {
    label: 'Scoped Client Portal Viewer',
    canEditClients: false,
    canEditInvoices: false,
    canManageSecurity: false,
    canManageMembers: false,
    canApproveWorkflows: false,
    canViewClientPortalOnly: true,
  },
};

/**
 * Deterministic conflict resolution for offline-first sync queue records.
 */
export function resolveSyncConflict(input: {
  localUpdatedAt: string;
  remoteUpdatedAt: string;
  strategy: 'latest_timestamp' | 'local_wins' | 'remote_wins';
}): SyncResolutionDecision {
  if (input.strategy === 'local_wins') {
    return {
      winner: 'local',
      reason: 'Resolved by explicit Local-Wins policy.',
      resolvedUpdatedAt: input.localUpdatedAt,
    };
  }
  if (input.strategy === 'remote_wins') {
    return {
      winner: 'remote',
      reason: 'Resolved by explicit Remote-Wins policy.',
      resolvedUpdatedAt: input.remoteUpdatedAt,
    };
  }
  if (input.localUpdatedAt >= input.remoteUpdatedAt) {
    return {
      winner: 'local',
      reason: 'Local revision has newer or equal timestamp.',
      resolvedUpdatedAt: input.localUpdatedAt,
    };
  }
  return {
    winner: 'remote',
    reason: 'Remote revision has newer timestamp.',
    resolvedUpdatedAt: input.remoteUpdatedAt,
  };
}

/**
 * Local conflict resolution ONLY prepares an item for re-transmission ('pending').
 * Items MUST NOT transition to 'acked' without an explicit server confirmation response.
 */
export function buildResolvedPendingPatch(
  decision: SyncResolutionDecision,
  nextRevision?: number
): {
  status: 'pending';
  conflictReason: string;
  revision?: number;
} {
  return {
    status: 'pending',
    conflictReason: `Resolved locally (${decision.winner}: ${decision.reason}) — awaiting server ACK.`,
    ...(typeof nextRevision === 'number' && Number.isInteger(nextRevision) && nextRevision >= 1
      ? { revision: nextRevision }
      : {}),
  };
}

export async function pushSyncQueueToServer(options: {
  endpointUrl?: string;
  workspaceId: string;
  authToken?: string;
  items: SyncQueueItem[];
  fetchImpl?: typeof fetch;
  idempotencyKey?: string;
  signal?: AbortSignal;
}): Promise<ServerSyncPushResult> {
  const pendingItems = options.items.filter((i) => i.status === 'pending' || i.status === 'failed');
  if (pendingItems.length === 0) {
    return {
      ok: true,
      ackedIds: [],
      conflicts: [],
      failedIds: [],
      serverTimestamp: new Date().toISOString(),
    };
  }

  const base = (options.endpointUrl || '/api/v1').replace(/\/+$/, '');
  const pushUrl = base.endsWith('/sync/push') ? base : `${base}/sync/push`;
  const fetchFn = options.fetchImpl ?? fetch;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Idempotency-Key': options.idempotencyKey?.trim() || createId('idem'),
  };
  if (options.authToken) {
    headers.Authorization = `Bearer ${options.authToken}`;
  }

  try {
    const res = await fetchFn(pushUrl, {
      method: 'POST',
      headers,
      credentials: 'include',
      signal: options.signal,
      body: JSON.stringify({
        workspaceId: options.workspaceId,
        changes: pendingItems.map((item) => ({
          id: item.id,
          entityType: item.entityType,
          entityId: item.entityId,
          operation: item.operation,
          revision: item.revision,
          payloadJson: item.payloadJson,
          updatedAt: item.updatedAt,
        })),
      }),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      const retryable = res.status >= 500 || res.status === 429 || res.status === 408;
      return {
        ok: false,
        ackedIds: [],
        conflicts: [],
        failedIds: pendingItems.map((i) => i.id),
        serverTimestamp: new Date().toISOString(),
        errorMessage: errBody.error?.message || `Sync server rejected batch (HTTP ${res.status}).`,
        httpStatus: res.status,
        retryable,
      };
    }

    const body = (await res.json()) as {
      ackedIds?: string[];
      conflicts?: ServerSyncPushResult['conflicts'];
      serverTimestamp?: string;
      idempotentReplay?: boolean;
    };

    return {
      ok: true,
      ackedIds: Array.isArray(body.ackedIds) ? body.ackedIds : [],
      conflicts: Array.isArray(body.conflicts) ? body.conflicts : [],
      failedIds: [],
      serverTimestamp: body.serverTimestamp ?? new Date().toISOString(),
      httpStatus: res.status,
      retryable: false,
      idempotentReplay: Boolean(body.idempotentReplay),
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      ackedIds: [],
      conflicts: [],
      failedIds: pendingItems.map((i) => i.id),
      serverTimestamp: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : 'Network error during sync push.',
      retryable: !aborted,
    };
  }
}

export async function pushSyncQueueWithRetry(options: {
  endpointUrl?: string;
  workspaceId: string;
  authToken?: string;
  items: SyncQueueItem[];
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleepImpl?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
}): Promise<ServerSyncPushResult & { attempts: number; delaysMs: number[] }> {
  const maxAttempts = Math.max(1, Math.min(6, Math.floor(options.maxAttempts ?? 3)));
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 15_000;
  const sleep =
    options.sleepImpl ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const batchIdempotencyKey = createId('idem');
  const delaysMs: number[] = [];

  let attempts = 0;
  let lastResult: ServerSyncPushResult = {
    ok: false,
    ackedIds: [],
    conflicts: [],
    failedIds: [],
    serverTimestamp: new Date().toISOString(),
    errorMessage: 'No attempts executed.',
  };

  while (attempts < maxAttempts) {
    if (options.signal?.aborted) {
      return {
        ...lastResult,
        ok: false,
        retryable: false,
        errorMessage: 'Sync push aborted.',
        attempts,
        delaysMs,
      };
    }

    attempts += 1;
    lastResult = await pushSyncQueueToServer({
      endpointUrl: options.endpointUrl,
      workspaceId: options.workspaceId,
      authToken: options.authToken,
      items: options.items,
      fetchImpl: options.fetchImpl,
      idempotencyKey: batchIdempotencyKey,
      signal: options.signal,
    });

    if (lastResult.ok || lastResult.retryable === false || attempts >= maxAttempts) {
      return { ...lastResult, attempts, delaysMs };
    }

    const delay = computeSyncBackoffDelayMs(attempts - 1, baseDelayMs, maxDelayMs);
    delaysMs.push(delay);
    await sleep(delay);
  }

  return { ...lastResult, attempts, delaysMs };
}

export interface SyncCheckpoint {
  workspaceId: string;
  lastCursor: string;
  lastSyncedAt: string | null;
  pendingCount: number;
  paused: boolean;
}

/**
 * Computes bounded exponential backoff delay (ms) for background sync retries.
 */
export function computeSyncBackoffDelayMs(
  attempt: number,
  baseMs = 1500,
  maxMs = 60_000
): number {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  const exp = Math.min(maxMs, baseMs * Math.pow(2, safeAttempt));
  return Math.max(baseMs, Math.round(exp));
}

export function summarizeSyncQueue(items: SyncQueueItem[]) {
  return {
    total: items.length,
    pending: items.filter((i) => i.status === 'pending').length,
    acked: items.filter((i) => i.status === 'acked').length,
    conflicts: items.filter((i) => i.status === 'conflict').length,
    failed: items.filter((i) => i.status === 'failed').length,
  };
}

export function deriveRemoteSyncLifecycleStatus(input: {
  syncQueue: SyncQueueItem[];
  remoteConfigured: boolean;
  isSyncingRemote?: boolean;
  localSyncError?: string | null;
  lastRemoteSyncedAt?: string | null;
}): SyncLifecycleStatus {
  if (input.isSyncingRemote) return 'syncing';
  if (input.syncQueue.some((i) => i.status === 'conflict')) return 'conflict';
  if (input.syncQueue.some((i) => i.status === 'failed') || Boolean(input.localSyncError)) {
    return 'failed';
  }
  if (input.syncQueue.some((i) => i.status === 'pending')) return 'pending';
  if (!input.remoteConfigured) return 'local_only';
  if (input.syncQueue.some((i) => i.status === 'acked') || Boolean(input.lastRemoteSyncedAt)) {
    return 'synced';
  }
  return 'local_only';
}
