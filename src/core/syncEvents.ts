export type LocalSyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export interface SyncStateSnapshot {
  status: LocalSyncStatus;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  lastOperationLabel: string | null;
}

type SyncListener = (snapshot: SyncStateSnapshot) => void;

const listeners = new Set<SyncListener>();

let state: SyncStateSnapshot = {
  status: 'idle',
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: null,
  lastOperationLabel: null,
};

function emit(): void {
  const snapshot: SyncStateSnapshot = { ...state };
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function getSyncSnapshot(): SyncStateSnapshot {
  return { ...state };
}

export function subscribeSyncEvents(listener: SyncListener): () => void {
  listeners.add(listener);
  listener(getSyncSnapshot());
  return () => {
    listeners.delete(listener);
  };
}

export function notifySyncStarted(operationLabel?: string): void {
  const nextPending = state.pendingCount + 1;
  state = {
    ...state,
    status: 'syncing',
    pendingCount: nextPending,
    lastOperationLabel: operationLabel ?? state.lastOperationLabel,
  };
  emit();
}

export function notifySyncSucceeded(operationLabel?: string): void {
  const nextPending = Math.max(0, state.pendingCount - 1);
  state = {
    status: nextPending > 0 ? 'syncing' : 'synced',
    pendingCount: nextPending,
    lastSyncedAt: new Date().toISOString(),
    lastError: null,
    lastOperationLabel: operationLabel ?? state.lastOperationLabel,
  };
  emit();
}

export function notifySyncFailed(error: unknown, operationLabel?: string): void {
  const nextPending = Math.max(0, state.pendingCount - 1);
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Local database synchronization failed.';
  state = {
    ...state,
    status: 'error',
    pendingCount: nextPending,
    lastError: message,
    lastOperationLabel: operationLabel ?? state.lastOperationLabel,
  };
  emit();
}

export function resetSyncStateForTest(): void {
  state = {
    status: 'idle',
    pendingCount: 0,
    lastSyncedAt: null,
    lastError: null,
    lastOperationLabel: null,
  };
  emit();
}

export async function trackSyncOperation<T>(
  operationLabel: string,
  operation: () => Promise<T>
): Promise<T> {
  notifySyncStarted(operationLabel);
  try {
    const result = await operation();
    notifySyncSucceeded(operationLabel);
    return result;
  } catch (err) {
    notifySyncFailed(err, operationLabel);
    throw err;
  }
}
