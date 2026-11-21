import Dexie, { type Table } from 'dexie';
import { createId } from '../domain/schemas/entities';
import { SOLODESK_DB_NAME, SolodeskDatabase } from './solodeskDatabase';

export const DEFAULT_WORKSPACE_ID = 'local-workspace';
export const DEFAULT_WORKSPACE_NAME = 'Local Workspace';
export const WORKSPACE_META_DB_NAME = 'solodesk_ai_workspaces_meta';

const WORKSPACE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const RESERVED_WORKSPACE_IDS = new Set([
  SOLODESK_DB_NAME.toLowerCase(),
  WORKSPACE_META_DB_NAME.toLowerCase(),
  '__proto__',
  'constructor',
  'prototype',
]);

export interface WorkspaceMetadata {
  id: string;
  name: string;
  isDefault: boolean;
  dbName: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkspaceMetaStateRow {
  id: 'active';
  activeWorkspaceId: string;
  updatedAt: string;
}

class WorkspaceMetadataDatabase extends Dexie {
  workspaces!: Table<WorkspaceMetadata, string>;
  metaState!: Table<WorkspaceMetaStateRow, string>;

  constructor() {
    super(WORKSPACE_META_DB_NAME);
    this.version(1).stores({
      workspaces: 'id, name, isDefault, updatedAt',
      metaState: 'id',
    });
  }
}

const metaDb = new WorkspaceMetadataDatabase();
const dbInstances = new Map<string, SolodeskDatabase>();
const cachedWorkspaces = new Map<string, WorkspaceMetadata>();
const activeOperationCounts = new Map<string, number>();
const deletingWorkspaceIds = new Set<string>();

let lifecycleQueue: Promise<void> = Promise.resolve();
let activeWorkspaceId = DEFAULT_WORKSPACE_ID;

function nowIso(): string {
  return new Date().toISOString();
}

function enqueueWorkspaceLifecycle<T>(task: () => Promise<T>): Promise<T> {
  const run = lifecycleQueue.then(task, task);
  lifecycleQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function buildDefaultWorkspaceRecord(): WorkspaceMetadata {
  const ts = nowIso();
  return {
    id: DEFAULT_WORKSPACE_ID,
    name: DEFAULT_WORKSPACE_NAME,
    isDefault: true,
    dbName: SOLODESK_DB_NAME,
    createdAt: ts,
    updatedAt: ts,
  };
}

export function validateWorkspaceId(id: string): string {
  const trimmed = typeof id === 'string' ? id.trim() : '';
  if (!trimmed) {
    throw new Error('Workspace ID cannot be empty.');
  }
  if (!WORKSPACE_ID_PATTERN.test(trimmed)) {
    throw new Error(
      'Workspace ID contains invalid characters. Only letters, numbers, hyphens, and underscores are allowed.'
    );
  }
  if (RESERVED_WORKSPACE_IDS.has(trimmed.toLowerCase())) {
    throw new Error(`Workspace ID "${trimmed}" is reserved.`);
  }
  return trimmed;
}

function deriveDbNameForId(validId: string): string {
  return validId === DEFAULT_WORKSPACE_ID ? SOLODESK_DB_NAME : `solodesk_ai_ws_${validId}`;
}

function assertNoDbNameCollision(workspaceId: string, dbName: string): void {
  if (dbName === WORKSPACE_META_DB_NAME) {
    throw new Error(`Database name collision detected for workspace "${workspaceId}".`);
  }
  if (workspaceId !== DEFAULT_WORKSPACE_ID && dbName === SOLODESK_DB_NAME) {
    throw new Error(`Workspace "${workspaceId}" cannot share the default workspace database.`);
  }
  for (const [otherId, meta] of cachedWorkspaces.entries()) {
    if (otherId !== workspaceId && meta.dbName === dbName) {
      throw new Error(
        `Database name "${dbName}" for workspace "${workspaceId}" collides with workspace "${otherId}".`
      );
    }
  }
}

export function resolveWorkspaceDbName(workspaceId: string): string {
  const validId = validateWorkspaceId(workspaceId);
  if (validId === DEFAULT_WORKSPACE_ID) return SOLODESK_DB_NAME;
  const cached = cachedWorkspaces.get(validId);
  const candidateDbName = cached?.dbName?.trim() || deriveDbNameForId(validId);
  assertNoDbNameCollision(validId, candidateDbName);
  return candidateDbName;
}

export function getDatabaseForWorkspace(workspaceId: string): SolodeskDatabase {
  const validId = validateWorkspaceId(workspaceId);
  if (deletingWorkspaceIds.has(validId)) {
    throw new Error(`Workspace "${validId}" is currently being deleted.`);
  }
  const dbName = resolveWorkspaceDbName(validId);
  let instance = dbInstances.get(dbName);
  if (!instance) {
    instance = new SolodeskDatabase(dbName);
    dbInstances.set(dbName, instance);
  }
  return instance;
}

export function getActiveWorkspaceIdSync(): string {
  return activeWorkspaceId;
}

export function getActiveWorkspaceDatabase(): SolodeskDatabase {
  return getDatabaseForWorkspace(activeWorkspaceId);
}

export async function trackWorkspaceOperation<T>(
  workspaceId: string,
  fn: (db: SolodeskDatabase) => Promise<T>
): Promise<T> {
  const validId = validateWorkspaceId(workspaceId);
  if (deletingWorkspaceIds.has(validId)) {
    throw new Error(`Workspace "${validId}" is currently being deleted.`);
  }
  const db = getDatabaseForWorkspace(validId);
  activeOperationCounts.set(validId, (activeOperationCounts.get(validId) ?? 0) + 1);
  try {
    return await fn(db);
  } finally {
    const remaining = (activeOperationCounts.get(validId) ?? 1) - 1;
    if (remaining <= 0) {
      activeOperationCounts.delete(validId);
    } else {
      activeOperationCounts.set(validId, remaining);
    }
  }
}

async function waitForWorkspaceOperationsToDrain(workspaceId: string, timeoutMs = 2000): Promise<void> {
  const startedAt = Date.now();
  while ((activeOperationCounts.get(workspaceId) ?? 0) > 0) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(
        `Workspace "${workspaceId}" has pending database operations. Retry deletion once active operations finish.`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

export function validateWorkspaceName(name: string): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) {
    throw new Error('Workspace name is required.');
  }
  if (trimmed.length > 64) {
    throw new Error('Workspace name cannot exceed 64 characters.');
  }
  return trimmed;
}

function normalizeMetadataRecord(raw: unknown): WorkspaceMetadata | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<WorkspaceMetadata>;
  if (typeof candidate.id !== 'string') return null;

  let validId: string;
  try {
    validId = validateWorkspaceId(candidate.id);
  } catch {
    return null;
  }

  const isDefault = validId === DEFAULT_WORKSPACE_ID || candidate.isDefault === true;
  const expectedDbName = deriveDbNameForId(validId);
  const candidateDbName =
    typeof candidate.dbName === 'string' && candidate.dbName.trim()
      ? candidate.dbName.trim()
      : expectedDbName;

  if (
    candidateDbName === WORKSPACE_META_DB_NAME ||
    (validId !== DEFAULT_WORKSPACE_ID && candidateDbName === SOLODESK_DB_NAME)
  ) {
    return null;
  }

  const safeName =
    typeof candidate.name === 'string' && candidate.name.trim()
      ? candidate.name.trim().slice(0, 64)
      : isDefault
        ? DEFAULT_WORKSPACE_NAME
        : validId;
  const ts = nowIso();
  const createdAt =
    typeof candidate.createdAt === 'string' && candidate.createdAt.trim() ? candidate.createdAt : ts;
  const updatedAt =
    typeof candidate.updatedAt === 'string' && candidate.updatedAt.trim() ? candidate.updatedAt : createdAt;

  return {
    id: validId,
    name: safeName,
    isDefault: validId === DEFAULT_WORKSPACE_ID,
    dbName: candidateDbName,
    createdAt,
    updatedAt,
  };
}

async function ensureDefaultWorkspaceInMeta(): Promise<WorkspaceMetadata> {
  const rawExisting = await metaDb.workspaces.get(DEFAULT_WORKSPACE_ID);
  const normalized = rawExisting ? normalizeMetadataRecord(rawExisting) : null;
  if (normalized) {
    if (
      !rawExisting ||
      rawExisting.name !== normalized.name ||
      rawExisting.dbName !== normalized.dbName ||
      rawExisting.createdAt !== normalized.createdAt ||
      rawExisting.isDefault !== normalized.isDefault
    ) {
      await metaDb.workspaces.put(normalized);
    }
    cachedWorkspaces.set(normalized.id, normalized);
    return normalized;
  }
  const created = buildDefaultWorkspaceRecord();
  await metaDb.workspaces.put(created);
  cachedWorkspaces.set(created.id, created);
  return created;
}

function sortWorkspaces(list: WorkspaceMetadata[]): WorkspaceMetadata[] {
  return [...list].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''));
  });
}

async function loadAndRepairWorkspaceRegistry(): Promise<WorkspaceMetadata[]> {
  await ensureDefaultWorkspaceInMeta();
  const rawAll = await metaDb.workspaces.toArray();
  const validList: WorkspaceMetadata[] = [];
  const seenDbNames = new Set<string>();

  for (const rawRow of rawAll) {
    const normalized = normalizeMetadataRecord(rawRow);
    if (!normalized) {
      continue;
    }
    if (seenDbNames.has(normalized.dbName)) {
      continue;
    }
    seenDbNames.add(normalized.dbName);

    const rawTyped = rawRow as Partial<WorkspaceMetadata>;
    if (
      rawTyped.name !== normalized.name ||
      rawTyped.dbName !== normalized.dbName ||
      rawTyped.createdAt !== normalized.createdAt ||
      rawTyped.updatedAt !== normalized.updatedAt ||
      rawTyped.isDefault !== normalized.isDefault
    ) {
      await metaDb.workspaces.put(normalized);
    }
    validList.push(normalized);
  }

  cachedWorkspaces.clear();
  for (const ws of validList) {
    cachedWorkspaces.set(ws.id, ws);
  }
  return sortWorkspaces(validList);
}

export async function initializeWorkspaceManager(): Promise<{
  activeWorkspaceId: string;
  workspaces: WorkspaceMetadata[];
}> {
  return enqueueWorkspaceLifecycle(async () => {
    let sorted: WorkspaceMetadata[];
    try {
      sorted = await loadAndRepairWorkspaceRegistry();
    } catch (err) {
      throw new Error(
        `Workspace metadata registry recovery failed without altering user databases: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`
      );
    }

    const stateRow = await metaDb.metaState.get('active');
    let candidateActive = typeof stateRow?.activeWorkspaceId === 'string'
      ? stateRow.activeWorkspaceId.trim()
      : DEFAULT_WORKSPACE_ID;

    try {
      candidateActive = validateWorkspaceId(candidateActive);
    } catch {
      candidateActive = '';
    }

    if (!candidateActive || !cachedWorkspaces.has(candidateActive)) {
      // Preserve backward compatibility with settings-based activeWorkspaceId on legacy default DB
      const defaultDb = getDatabaseForWorkspace(DEFAULT_WORKSPACE_ID);
      const defaultSettings = await defaultDb.appSettings.get('default').catch(() => undefined);
      const settingsWs = defaultSettings?.activeWorkspaceId?.trim();
      if (settingsWs && cachedWorkspaces.has(settingsWs)) {
        candidateActive = settingsWs;
      } else {
        candidateActive = DEFAULT_WORKSPACE_ID;
      }
      await metaDb.metaState.put({
        id: 'active',
        activeWorkspaceId: candidateActive,
        updatedAt: nowIso(),
      });
    }

    activeWorkspaceId = candidateActive;
    return { activeWorkspaceId, workspaces: sorted };
  });
}

export async function listWorkspaces(): Promise<WorkspaceMetadata[]> {
  return loadAndRepairWorkspaceRegistry();
}

export async function createWorkspaceRecord(input: { name: string }): Promise<WorkspaceMetadata> {
  return enqueueWorkspaceLifecycle(async () => {
    const validName = validateWorkspaceName(input.name);
    const existing = await loadAndRepairWorkspaceRegistry();
    if (existing.some((ws) => ws.name.trim().toLowerCase() === validName.toLowerCase())) {
      throw new Error(`A workspace named "${validName}" already exists.`);
    }

    const ts = nowIso();
    const id = validateWorkspaceId(createId('ws'));
    const dbName = deriveDbNameForId(id);
    assertNoDbNameCollision(id, dbName);

    const record: WorkspaceMetadata = {
      id,
      name: validName,
      isDefault: false,
      dbName,
      createdAt: ts,
      updatedAt: ts,
    };
    await metaDb.workspaces.add(record);
    cachedWorkspaces.set(record.id, record);
    return record;
  });
}

export async function renameWorkspaceRecord(
  workspaceId: string,
  newName: string
): Promise<WorkspaceMetadata> {
  return enqueueWorkspaceLifecycle(async () => {
    const validId = validateWorkspaceId(workspaceId);
    const validName = validateWorkspaceName(newName);
    const all = await loadAndRepairWorkspaceRegistry();
    const target = all.find((w) => w.id === validId);
    if (!target) {
      throw new Error(`Workspace "${validId}" not found.`);
    }
    if (
      all.some(
        (w) => w.id !== validId && w.name.trim().toLowerCase() === validName.toLowerCase()
      )
    ) {
      throw new Error(`A workspace named "${validName}" already exists.`);
    }

    const updated: WorkspaceMetadata = {
      ...target,
      name: validName,
      updatedAt: nowIso(),
    };
    await metaDb.workspaces.put(updated);
    cachedWorkspaces.set(updated.id, updated);
    return updated;
  });
}

export async function switchActiveWorkspace(workspaceId: string): Promise<WorkspaceMetadata> {
  return enqueueWorkspaceLifecycle(async () => {
    const safeId = validateWorkspaceId(workspaceId);
    if (deletingWorkspaceIds.has(safeId)) {
      throw new Error(`Cannot switch to workspace "${safeId}" while deletion is in progress.`);
    }
    await loadAndRepairWorkspaceRegistry();

    let target = cachedWorkspaces.get(safeId);
    if (!target) {
      const dbName = deriveDbNameForId(safeId);
      assertNoDbNameCollision(safeId, dbName);
      const ts = nowIso();
      target = {
        id: safeId,
        name: safeId === DEFAULT_WORKSPACE_ID ? DEFAULT_WORKSPACE_NAME : safeId,
        isDefault: safeId === DEFAULT_WORKSPACE_ID,
        dbName,
        createdAt: ts,
        updatedAt: ts,
      };
      await metaDb.workspaces.put(target);
      cachedWorkspaces.set(target.id, target);
    }

    activeWorkspaceId = target.id;
    await metaDb.metaState.put({
      id: 'active',
      activeWorkspaceId: target.id,
      updatedAt: nowIso(),
    });
    return target;
  });
}

export async function deleteWorkspaceRecord(workspaceId: string): Promise<{
  deletedId: string;
  nextActiveWorkspaceId: string;
}> {
  return enqueueWorkspaceLifecycle(async () => {
    const validId = validateWorkspaceId(workspaceId);
    const all = await loadAndRepairWorkspaceRegistry();
    const target = all.find((w) => w.id === validId);
    if (!target) {
      throw new Error(`Workspace "${validId}" does not exist.`);
    }
    if (target.isDefault || target.id === DEFAULT_WORKSPACE_ID || target.dbName === SOLODESK_DB_NAME) {
      throw new Error('The default Local Workspace cannot be deleted.');
    }
    if (all.length <= 1) {
      throw new Error('Cannot delete the only remaining workspace.');
    }

    deletingWorkspaceIds.add(target.id);
    try {
      await waitForWorkspaceOperationsToDrain(target.id);

      const existingDb = dbInstances.get(target.dbName);
      if (existingDb) {
        existingDb.close();
        dbInstances.delete(target.dbName);
      }
      await Dexie.delete(target.dbName);
      await metaDb.workspaces.delete(target.id);
      cachedWorkspaces.delete(target.id);

      let nextActive = activeWorkspaceId;
      if (activeWorkspaceId === target.id) {
        nextActive = DEFAULT_WORKSPACE_ID;
        activeWorkspaceId = DEFAULT_WORKSPACE_ID;
        await metaDb.metaState.put({
          id: 'active',
          activeWorkspaceId: DEFAULT_WORKSPACE_ID,
          updatedAt: nowIso(),
        });
      }

      return {
        deletedId: target.id,
        nextActiveWorkspaceId: nextActive,
      };
    } finally {
      deletingWorkspaceIds.delete(target.id);
    }
  });
}

export async function resetWorkspaceManagerForTest(): Promise<void> {
  await lifecycleQueue.catch(() => undefined);
  const drainStart = Date.now();
  while (activeOperationCounts.size > 0 && Date.now() - drainStart < 2000) {
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  await lifecycleQueue.catch(() => undefined);

  const all = await metaDb.workspaces.toArray().catch(() => []);
  for (const ws of all) {
    const inst = dbInstances.get(ws.dbName);
    if (inst) {
      inst.close();
      dbInstances.delete(ws.dbName);
    }
    if (!ws.isDefault && ws.dbName !== SOLODESK_DB_NAME) {
      await Dexie.delete(ws.dbName).catch(() => undefined);
    }
  }
  await metaDb.workspaces.clear().catch(() => undefined);
  await metaDb.metaState.clear().catch(() => undefined);
  cachedWorkspaces.clear();
  activeOperationCounts.clear();
  deletingWorkspaceIds.clear();
  activeWorkspaceId = DEFAULT_WORKSPACE_ID;
}
