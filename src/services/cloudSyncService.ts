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

export interface ServerSyncPushResult {
  ok: boolean;
  ackedIds: string[];
  conflicts: Array<{ id: string; reason: string }>;
  failedIds: string[];
  serverTimestamp: string;
  errorMessage?: string;
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
export function buildResolvedPendingPatch(decision: SyncResolutionDecision): {
  status: 'pending';
  conflictReason: string;
} {
  return {
    status: 'pending',
    conflictReason: `Resolved locally (${decision.winner}: ${decision.reason}) — awaiting server ACK.`,
  };
}

export async function pushSyncQueueToServer(options: {
  endpointUrl?: string;
  workspaceId: string;
  authToken?: string;
  items: SyncQueueItem[];
  fetchImpl?: typeof fetch;
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
    'Idempotency-Key': createId('idem'),
  };
  if (options.authToken) {
    headers.Authorization = `Bearer ${options.authToken}`;
  }

  try {
    const res = await fetchFn(pushUrl, {
      method: 'POST',
      headers,
      credentials: 'include',
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
      return {
        ok: false,
        ackedIds: [],
        conflicts: [],
        failedIds: pendingItems.map((i) => i.id),
        serverTimestamp: new Date().toISOString(),
        errorMessage: errBody.error?.message || `Sync server rejected batch (HTTP ${res.status}).`,
      };
    }

    const body = (await res.json()) as {
      ackedIds?: string[];
      conflicts?: Array<{ id: string; reason: string }>;
      serverTimestamp?: string;
    };

    return {
      ok: true,
      ackedIds: Array.isArray(body.ackedIds) ? body.ackedIds : [],
      conflicts: Array.isArray(body.conflicts) ? body.conflicts : [],
      failedIds: [],
      serverTimestamp: body.serverTimestamp ?? new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      ackedIds: [],
      conflicts: [],
      failedIds: pendingItems.map((i) => i.id),
      serverTimestamp: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : 'Network error during sync push.',
    };
  }
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
