import Dexie from 'dexie';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceProvider, useWorkspace } from '../../src/app/providers/WorkspaceProvider';
import { runTaskCompletionTimestampMigration } from '../../src/database/migrations/taskCompletionMigration';
import { repositories } from '../../src/database/repositories/dexieRepositories';
import {
  SOLODESK_DB_NAME,
  SOLODESK_SCHEMA_VERSION,
  SolodeskDatabase,
} from '../../src/database/solodeskDatabase';
import {
  WORKSPACE_META_DB_NAME,
  createWorkspaceRecord,
  DEFAULT_WORKSPACE_ID,
  deleteWorkspaceRecord,
  getActiveWorkspaceDatabase,
  getDatabaseForWorkspace,
  initializeWorkspaceManager,
  resetWorkspaceManagerForTest,
  resolveWorkspaceDbName,
  switchActiveWorkspace,
  trackWorkspaceOperation,
  validateWorkspaceId,
} from '../../src/database/workspaceManager';
import { runWorkspaceBackgroundJobs } from '../../src/services/backgroundJobRunner';
import {
  createBackupPayload,
  inspectBackupText,
  restoreBackupPayload,
} from '../../src/services/backupService';
import { addDaysToDateStr, todayDateStr } from '../../src/domain/calculations/dates';

const Probe: React.FC = () => {
  const {
    loading,
    activeWorkspaceId,
    workspaces,
    clients,
    settings,
    switchWorkspace,
    createWorkspace,
    deleteWorkspace,
    refresh,
  } = useWorkspace();

  if (loading) return <div>Loading...</div>;
  return (
    <div>
      <span data-testid="ws-id">{activeWorkspaceId}</span>
      <span data-testid="ws-count">{workspaces.length}</span>
      <span data-testid="client-count">{clients.length}</span>
      <span data-testid="onboarded">{String(Boolean(settings?.onboardingCompleted))}</span>
      <button
        type="button"
        onClick={() => void createWorkspace('Alpha Studio', true)}
      >
        Create Alpha
      </button>
      <button
        type="button"
        onClick={() => void createWorkspace('Background Studio', false)}
      >
        Create Background
      </button>
      <button
        type="button"
        onClick={() => void switchWorkspace(DEFAULT_WORKSPACE_ID)}
      >
        Switch Default
      </button>
      <button type="button" onClick={() => void refresh()}>
        Refresh
      </button>
      {workspaces
        .filter((w) => !w.isDefault)
        .map((w) => (
          <div key={w.id}>
            <button type="button" onClick={() => void switchWorkspace(w.id)}>
              Switch:{w.name}
            </button>
            <button type="button" onClick={() => void deleteWorkspace(w.id)}>
              Delete:{w.name}
            </button>
          </div>
        ))}
    </div>
  );
};

async function wipeAllDbs() {
  await resetWorkspaceManagerForTest();
  const mainDb = getDatabaseForWorkspace(DEFAULT_WORKSPACE_ID);
  await mainDb.open();
  await mainDb.transaction('rw', mainDb.tables, async () => {
    await Promise.all(mainDb.tables.map((t) => t.clear()));
  });
}

describe('Phases 68–69: Multi-Workspace Isolation, Migration & Recovery Audit', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    await wipeAllDbs();
  });

  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    await wipeAllDbs();
  });

  it('Phase 68: validates workspace IDs strictly and prevents database-name collisions across all 33 tables', async () => {
    expect(() => validateWorkspaceId('')).toThrow(/empty/i);
    expect(() => validateWorkspaceId('ws/a')).toThrow(/invalid characters/i);
    expect(() => validateWorkspaceId('ws?a')).toThrow(/invalid characters/i);
    expect(() => validateWorkspaceId('../escape')).toThrow(/invalid characters/i);
    expect(() => validateWorkspaceId('ws space')).toThrow(/invalid characters/i);
    expect(() => validateWorkspaceId(SOLODESK_DB_NAME)).toThrow(/reserved/i);
    expect(() => validateWorkspaceId(WORKSPACE_META_DB_NAME)).toThrow(/reserved/i);

    expect(resolveWorkspaceDbName(DEFAULT_WORKSPACE_ID)).toBe(SOLODESK_DB_NAME);
    expect(resolveWorkspaceDbName('workspace-alpha')).toBe('solodesk_ai_ws_workspace-alpha');

    const defaultDb = getDatabaseForWorkspace(DEFAULT_WORKSPACE_ID);
    await defaultDb.open();
    expect(defaultDb.tables.map((t) => t.name).sort()).toHaveLength(33);
  });

  it('Phase 68: keeps 33 domain tables isolated across workspaces, prevents stale background job/backup leaks, and drains open operations on delete', async () => {
    await initializeWorkspaceManager();
    const wsB = await createWorkspaceRecord({ name: 'Isolated Studio B' });

    // Seed data in default workspace (A) including an overdue recurring invoice
    const cliA = await repositories.createClient({
      name: 'Client Only In A',
      company: 'Alpha Corp',
      email: 'a@alpha.invalid',
      phone: '',
      website: '',
      location: '',
      status: 'active',
      category: 'SaaS',
      tags: [],
      notes: '',
      isDemo: false,
    });
    const pastDate = addDaysToDateStr(todayDateStr(), -10);
    await repositories.createInvoice({
      number: 'INV-A-0001',
      clientId: cliA.id,
      projectId: '',
      quotationId: '',
      issueDate: pastDate,
      dueDate: addDaysToDateStr(todayDateStr(), -2),
      currency: 'USD',
      lineItems: [{ id: 'li_a', description: 'Retainer', quantity: 1, unitPrice: 500 }],
      discountType: 'none',
      discountValue: 0,
      taxRate: 0,
      taxInclusive: false,
      subtotal: 500,
      discountAmount: 0,
      taxAmount: 0,
      total: 500,
      notes: '',
      paymentInstructions: '',
      status: 'sent',
      recurrenceRule: 'monthly',
      nextRecurrenceDate: pastDate,
      isDemo: false,
    });

    // Bind background job to A while switching to B concurrently
    const dbA = getDatabaseForWorkspace(DEFAULT_WORKSPACE_ID);
    const bgPromise = runWorkspaceBackgroundJobs({ database: dbA, today: todayDateStr() });
    await switchActiveWorkspace(wsB.id);
    const summary = await bgPromise;

    expect(summary.generatedRecurringInvoices).toHaveLength(1);
    expect(window.sessionStorage.length).toBe(0);

    // Workspace B must remain completely clean of A's clients, invoices, and notifications
    const dbB = getActiveWorkspaceDatabase();
    expect(await dbB.clients.count()).toBe(0);
    expect(await dbB.invoices.count()).toBe(0);
    expect(await dbB.notifications.count()).toBe(0);
    expect(await dbA.invoices.count()).toBe(2);
    expect(await dbA.notifications.count()).toBeGreaterThanOrEqual(2);

    // Backup from A reports crossWorkspaceMismatch when inspected inside B and restores cleanly into A only
    const backupA = await createBackupPayload({
      database: dbA,
      workspaceId: DEFAULT_WORKSPACE_ID,
      workspaceName: 'Local Workspace',
    });
    expect(backupA.workspaceId).toBe(DEFAULT_WORKSPACE_ID);
    expect(backupA.data.clients).toHaveLength(1);

    const inspectInB = await inspectBackupText(JSON.stringify(backupA), undefined, {
      database: dbB,
      workspaceId: wsB.id,
    });
    expect(inspectInB.crossWorkspaceMismatch).toBe(true);
    expect(inspectInB.sourceWorkspaceId).toBe(DEFAULT_WORKSPACE_ID);
    expect(inspectInB.currentWorkspaceId).toBe(wsB.id);

    await repositories.withDatabase(dbB).createClient({
      name: 'Client Only In B',
      company: 'Beta Corp',
      email: 'b@beta.invalid',
      phone: '',
      website: '',
      location: '',
      status: 'active',
      category: 'Design',
      tags: [],
      notes: '',
      isDemo: false,
    });
    const backupB = await createBackupPayload({ database: dbB, workspaceId: wsB.id });
    await dbB.clients.clear();
    await restoreBackupPayload(backupB, 'replace', { database: dbB, workspaceId: wsB.id });
    expect((await dbB.clients.toArray()).map((c) => c.name)).toEqual(['Client Only In B']);
    expect((await dbA.clients.toArray()).map((c) => c.name)).toEqual(['Client Only In A']);

    // Simulate reload re-initialization & safe deletion draining pending workspace op
    const reinit = await initializeWorkspaceManager();
    expect(reinit.activeWorkspaceId).toBe(wsB.id);

    let finishedPendingOp = false;
    const pendingOp = trackWorkspaceOperation(wsB.id, async () => {
      await new Promise((r) => setTimeout(r, 40));
      finishedPendingOp = true;
    });
    const delRes = await deleteWorkspaceRecord(wsB.id);
    await pendingOp;
    expect(finishedPendingOp).toBe(true);
    expect(delRes.nextActiveWorkspaceId).toBe(DEFAULT_WORKSPACE_ID);
    await expect(deleteWorkspaceRecord(DEFAULT_WORKSPACE_ID)).rejects.toThrow(/cannot be deleted/i);
  });

  it('Phase 68: survives rapid concurrent switching in UI and creates non-switched workspaces with onboardingCompleted=true', async () => {
    render(
      <WorkspaceProvider>
        <Probe />
      </WorkspaceProvider>
    );

    await waitFor(() => expect(screen.getByTestId('ws-id').textContent).toBe(DEFAULT_WORKSPACE_ID));

    await act(async () => {
      screen.getByRole('button', { name: 'Create Background' }).click();
    });
    await waitFor(() => expect(screen.getByTestId('ws-count').textContent).toBe('2'));
    // Still on default workspace
    expect(screen.getByTestId('ws-id').textContent).toBe(DEFAULT_WORKSPACE_ID);

    // Switch to Background Studio -> must be marked onboarded=true
    await act(async () => {
      screen.getByRole('button', { name: 'Switch:Background Studio' }).click();
    });
    await waitFor(() => expect(screen.getByText('Switch:Background Studio')).toBeDefined());
    await waitFor(() => expect(screen.getByTestId('onboarded').textContent).toBe('true'));

    // Rapid switch back to default & create Alpha concurrently
    await act(async () => {
      screen.getByRole('button', { name: 'Switch Default' }).click();
      screen.getByRole('button', { name: 'Create Alpha' }).click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('ws-count').textContent).toBe('3');
      expect(screen.getByTestId('ws-id').textContent).not.toBe(DEFAULT_WORKSPACE_ID);
    });
    // Final active state cleanly points to a valid workspace with consistent client count (0)
    const activeId = screen.getByTestId('ws-id').textContent;
    expect(activeId).toBeTruthy();
    expect(screen.getByTestId('client-count').textContent).toBe('0');
  });

  it('Phase 69: executes idempotent backfill, rolls back cleanly on interrupted migration, recovers malformed metadata, and preserves user data on backup restore', async () => {
    await initializeWorkspaceManager();
    const defaultDb = getDatabaseForWorkspace(DEFAULT_WORKSPACE_ID);
    await defaultDb.open();
    expect(defaultDb.verno).toBe(SOLODESK_SCHEMA_VERSION);

    // Seed legacy done task without completedAt AND a task whose put will fail mid-migration
    const ts = '2026-11-18T12:00:00.000Z';
    await defaultDb.tasks.bulkAdd([
      {
        id: 'tsk_legacy_1',
        projectId: '',
        clientId: '',
        title: 'Legacy Done Task 1',
        description: '',
        status: 'done',
        priority: 'medium',
        dueDate: '',
        assignee: '',
        tags: [],
        subtasks: [],
        comments: [],
        attachmentVaultIds: [],
        dependsOnIds: [],
        estimatedHours: 0,
        recurrenceRule: 'none',
        autoPriorityScore: 0,
        completedAt: '',
        isDemo: false,
        createdAt: ts,
        updatedAt: '2026-11-19T12:00:00.000Z',
      },
      {
        id: 'tsk_explicit_2',
        projectId: '',
        clientId: '',
        title: 'Already Timestamped',
        description: '',
        status: 'done',
        priority: 'low',
        dueDate: '',
        assignee: '',
        tags: [],
        subtasks: [],
        comments: [],
        attachmentVaultIds: [],
        dependsOnIds: [],
        estimatedHours: 0,
        recurrenceRule: 'none',
        autoPriorityScore: 0,
        completedAt: '2026-11-17T08:00:00.000Z',
        isDemo: false,
        createdAt: ts,
        updatedAt: ts,
      },
    ]);

    // Interrupted migration test: throw on tasks.put -> transaction must abort cleanly
    const origPut = defaultDb.tasks.put.bind(defaultDb.tasks);
    vi.spyOn(defaultDb.tasks, 'put').mockRejectedValueOnce(new Error('Simulated IndexedDB IO interrupt'));

    await expect(runTaskCompletionTimestampMigration(defaultDb)).rejects.toThrow(
      /Simulated IndexedDB IO interrupt/
    );

    // Neither completedAt nor taskCompletionBackfilledAt should have committed
    expect((await defaultDb.tasks.get('tsk_legacy_1'))?.completedAt).toBe('');
    expect((await defaultDb.appSettings.get('default'))?.taskCompletionBackfilledAt ?? '').toBe('');

    // Retry after recovery -> succeeds atomically
    vi.spyOn(defaultDb.tasks, 'put').mockImplementation(origPut);
    const firstRun = await runTaskCompletionTimestampMigration(defaultDb);
    expect(firstRun).toEqual({ ran: true, backfilledCount: 1, skippedCount: 0 });
    expect((await defaultDb.tasks.get('tsk_legacy_1'))?.completedAt).toBe('2026-11-19T12:00:00.000Z');
    expect((await defaultDb.tasks.get('tsk_explicit_2'))?.completedAt).toBe('2026-11-17T08:00:00.000Z');

    // Repeated execution is strictly idempotent
    const secondRun = await runTaskCompletionTimestampMigration(defaultDb);
    expect(secondRun).toEqual({ ran: false, backfilledCount: 0, skippedCount: 0 });

    // Backup & restore after migration preserves backfilled timestamps & migration marker
    const postMigrationBackup = await createBackupPayload({
      database: defaultDb,
      workspaceId: DEFAULT_WORKSPACE_ID,
    });
    await defaultDb.tasks.clear();
    await restoreBackupPayload(postMigrationBackup, 'replace', {
      database: defaultDb,
      workspaceId: DEFAULT_WORKSPACE_ID,
    });
    expect((await defaultDb.tasks.get('tsk_legacy_1'))?.completedAt).toBe('2026-11-19T12:00:00.000Z');
    expect((await defaultDb.appSettings.get('default'))?.taskCompletionBackfilledAt).toBeTruthy();

    // Inject malformed metadata + dangling activeWorkspaceId directly into metadata DB -> must recover safely without resetting user data
    const rawMeta = new Dexie(WORKSPACE_META_DB_NAME);
    rawMeta.version(1).stores({
      workspaces: 'id, name, isDefault, updatedAt',
      metaState: 'id',
    });
    await rawMeta.open();
    await rawMeta.table('workspaces').put({
      id: 'ws_partial_recover',
      name: '',
      dbName: '',
      createdAt: '',
      updatedAt: '',
    });
    await rawMeta.table('metaState').put({
      id: 'active',
      activeWorkspaceId: 'bad/slash/id',
      updatedAt: ts,
    });
    rawMeta.close();

    const recovered = await initializeWorkspaceManager();
    expect(recovered.activeWorkspaceId).toBe(DEFAULT_WORKSPACE_ID);
    const repairedPartial = recovered.workspaces.find((w) => w.id === 'ws_partial_recover');
    expect(repairedPartial?.dbName).toBe('solodesk_ai_ws_ws_partial_recover');
    // Existing user records in default workspace remain 100% preserved
    expect((await defaultDb.tasks.get('tsk_legacy_1'))?.completedAt).toBe('2026-11-19T12:00:00.000Z');
  });

  it('Phase 73 Fix #4: pins multi-await repository writes and activity logs to the starting workspace DB during concurrent switchActiveWorkspace', async () => {
    await initializeWorkspaceManager();
    const wsB = await createWorkspaceRecord({ name: 'Concurrent Switch Target B' });
    const dbA = getDatabaseForWorkspace(DEFAULT_WORKSPACE_ID);
    const dbB = getDatabaseForWorkspace(wsB.id);

    // Trigger multi-await createClient (clients.add -> logActivity -> activities.add) while switching active workspace concurrently
    const writePromise = repositories.createClient({
      name: 'Pinned Client A',
      company: 'Pinned Co',
      email: 'pinned@a.invalid',
      phone: '',
      website: '',
      location: '',
      status: 'active',
      category: 'Advisory',
      tags: [],
      notes: '',
      isDemo: false,
    });
    await switchActiveWorkspace(wsB.id);
    const created = await writePromise;

    expect(created.name).toBe('Pinned Client A');
    expect((await dbA.clients.toArray()).map((c) => c.id)).toContain(created.id);
    expect((await dbA.activities.toArray()).some((a) => a.entityId === created.id)).toBe(true);
    expect(await dbB.clients.count()).toBe(0);
    expect(await dbB.activities.count()).toBe(0);
  });
});
