import {
  SOLODESK_DB_NAME,
  SOLODESK_SCHEMA_VERSION,
  SolodeskDatabase,
} from './solodeskDatabase';
import { getActiveWorkspaceDatabase } from './workspaceManager';

export { SOLODESK_DB_NAME, SOLODESK_SCHEMA_VERSION, SolodeskDatabase };

export const db: SolodeskDatabase = new Proxy({} as SolodeskDatabase, {
  get(_target, prop) {
    const active = getActiveWorkspaceDatabase();
    const value = Reflect.get(active, prop, active);
    return typeof value === 'function' ? value.bind(active) : value;
  },
  set(_target, prop, value) {
    const active = getActiveWorkspaceDatabase();
    return Reflect.set(active, prop, value, active);
  },
  has(_target, prop) {
    return prop in getActiveWorkspaceDatabase();
  },
  ownKeys() {
    return Reflect.ownKeys(getActiveWorkspaceDatabase());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Reflect.getOwnPropertyDescriptor(getActiveWorkspaceDatabase(), prop);
  },
});

export interface StorageHealth {
  supported: boolean;
  persisted: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
}

export async function getStorageHealth(): Promise<StorageHealth> {
  if (typeof navigator === 'undefined' || !navigator.storage) {
    return { supported: false, persisted: false, usageBytes: null, quotaBytes: null };
  }
  let persisted = false;
  let usageBytes: number | null = null;
  let quotaBytes: number | null = null;
  try {
    if (typeof navigator.storage.persisted === 'function') {
      persisted = await navigator.storage.persisted();
    }
    if (typeof navigator.storage.estimate === 'function') {
      const est = await navigator.storage.estimate();
      usageBytes = typeof est.usage === 'number' ? est.usage : null;
      quotaBytes = typeof est.quota === 'number' ? est.quota : null;
    }
  } catch {
    // Graceful fallback in restricted browser contexts
  }
  return { supported: true, persisted, usageBytes, quotaBytes };
}

export async function requestPersistentBrowserStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return false;
  }
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
