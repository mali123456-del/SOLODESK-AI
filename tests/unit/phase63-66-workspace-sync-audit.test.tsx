import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../src/app/layouts/AppShell';
import { ThemeProvider } from '../../src/app/providers/ThemeProvider';
import { useWorkspace, WorkspaceProvider } from '../../src/app/providers/WorkspaceProvider';
import { ToastProvider } from '../../src/components/ui';
import { db } from '../../src/database/db';
import { runTaskCompletionTimestampMigration } from '../../src/database/migrations/taskCompletionMigration';
import { repositories } from '../../src/database/repositories/dexieRepositories';
import { SolodeskDatabase } from '../../src/database/solodeskDatabase';
import {
  DEFAULT_WORKSPACE_ID,
  deleteWorkspaceRecord,
  getDatabaseForWorkspace,
  resetWorkspaceManagerForTest,
} from '../../src/database/workspaceManager';
import { todayDateStr, toWorkspaceDateStr } from '../../src/domain/calculations/dates';
import type { Task } from '../../src/domain/schemas/entities';
import { DailyTaskGoalCard } from '../../src/features/dashboard/DailyTaskGoalCard';
import { QuickNotesCard } from '../../src/features/dashboard/QuickNotesCard';
import {
  buildResolvedPendingPatch,
  deriveRemoteSyncLifecycleStatus,
  pushSyncQueueWithRetry,
  resolveSyncConflict,
  SYNC_LIFECYCLE_LABELS,
} from '../../src/services/cloudSyncService';
import { computeDailyTaskGoalProgress } from '../../src/services/productivityService';

const AuditHarness: React.FC = () => {
  const {
    loading,
    activeWorkspace,
    activeWorkspaceId,
    clients,
    tasks,
    dailyTaskGoalTarget,
    syncLifecycleStatus,
    refresh,
  } = useWorkspace();

  if (loading) return <div>Loading workspace...</div>;

  return (
    <AppShell
      activeRoute="dashboard"
      onNavigate={() => {}}
      syncLifecycleStatus={syncLifecycleStatus}
    >
      <div data-testid="harness-ws-id">{activeWorkspaceId}</div>
      <div data-testid="harness-ws-name">{activeWorkspace?.name ?? ''}</div>
      <div data-testid="harness-client-count">{clients.length}</div>
      <div data-testid="harness-task-count">{tasks.length}</div>
      <div data-testid="harness-goal-target">{dailyTaskGoalTarget}</div>
      <input aria-label="Unrelated App Input" defaultValue="" />
      <button type="button" onClick={() => void refresh()}>
        Force Refresh
      </button>
      <QuickNotesCard />
      <DailyTaskGoalCard />
    </AppShell>
  );
};

function renderWithApp(ui: React.ReactElement) {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <WorkspaceProvider>{ui}</WorkspaceProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

describe('Phases 63–66 Audit: Workspace Isolation, Task Goal Accuracy, Quick Notes Safety & Sync States', () => {
  beforeEach(async () => {
    await resetWorkspaceManagerForTest();
    const defaultDb = getDatabaseForWorkspace(DEFAULT_WORKSPACE_ID);
    await defaultDb.transaction('rw', defaultDb.tables, async () => {
      await Promise.all(defaultDb.tables.map((t) => t.clear()));
    });
  });

  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    await resetWorkspaceManagerForTest();
  });

  it('Phase 63: preserves local-workspace default, creates/renames/switches isolated workspaces, persists across reload, and requires explicit delete confirmation', async () => {
    const view = renderWithApp(<AuditHarness />);
    await waitFor(() => {
      expect(screen.queryByText('Loading workspace...')).not.toBeInTheDocument();
    });

    expect(screen.getByTestId('harness-ws-id')).toHaveTextContent('local-workspace');
    expect(screen.getByTestId('harness-ws-name')).toHaveTextContent('Local Workspace');

    // Create records in default Local Workspace
    await repositories.createClient({
      name: 'Default WS Client',
      company: 'Alpha One',
      email: 'alpha@one.invalid',
      phone: '',
      website: '',
      location: 'Lahore',
      status: 'active',
      category: 'Design',
      tags: [],
      notes: '',
      isDemo: false,
    });
    const quickNotesInput = screen.getByLabelText('Temporary Notes & Reminders');
    fireEvent.change(quickNotesInput, { target: { value: 'Default workspace private note' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Note/i }));
    await waitFor(() => {
      expect(screen.getByText(/Saved locally/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Daily task target'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /Update Target/i }));
    await waitFor(() => {
      expect(screen.getByTestId('harness-goal-target')).toHaveTextContent('4');
    });
    expect(screen.getByTestId('harness-client-count')).toHaveTextContent('1');

    // Open Workspace Switcher & create second isolated workspace
    fireEvent.click(screen.getAllByTestId('workspace-switcher-trigger')[0]);
    expect(screen.getByRole('heading', { name: 'Workspaces' })).toBeInTheDocument();

    // Default Local Workspace has no Delete button
    expect(screen.queryByRole('button', { name: 'Delete Local Workspace' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Create New Isolated Workspace'), {
      target: { value: 'Studio Horizon' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create Workspace/i }));

    await waitFor(() => {
      expect(screen.getByTestId('harness-ws-name')).toHaveTextContent('Studio Horizon');
    });

    // Strict zero-leak isolation check in Studio Horizon
    expect(screen.getByTestId('harness-ws-id').textContent).not.toBe('local-workspace');
    expect(screen.getByTestId('harness-client-count')).toHaveTextContent('0');
    expect(screen.getByTestId('harness-goal-target')).toHaveTextContent('0');
    expect(
      (screen.getByLabelText('Temporary Notes & Reminders') as HTMLTextAreaElement).value
    ).toBe('');

    // Create isolated client inside Studio Horizon
    await repositories.createClient({
      name: 'Horizon Private Client',
      company: 'Horizon Co',
      email: 'horizon@two.invalid',
      phone: '',
      website: '',
      location: 'Toronto',
      status: 'active',
      category: 'SaaS',
      tags: [],
      notes: '',
      isDemo: false,
    });
    fireEvent.click(screen.getByText('Force Refresh'));
    await waitFor(() => {
      expect(screen.getByTestId('harness-client-count')).toHaveTextContent('1');
    });

    // Simulate reload -> must stay on Studio Horizon with its own data only
    view.unmount();
    renderWithApp(<AuditHarness />);
    await waitFor(() => {
      expect(screen.queryByText('Loading workspace...')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('harness-ws-name')).toHaveTextContent('Studio Horizon');
    expect(screen.getByTestId('harness-client-count')).toHaveTextContent('1');

    // Rename Studio Horizon -> Studio North & verify
    fireEvent.click(screen.getAllByTestId('workspace-switcher-trigger')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Rename Studio Horizon' }));
    fireEvent.change(screen.getByLabelText('Rename workspace name'), {
      target: { value: 'Studio North' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(screen.getByTestId('harness-ws-name')).toHaveTextContent('Studio North');
    });

    // Delete requires explicit confirmation; cancel preserves workspace & data
    const deleteNorthBtn = await screen.findByRole('button', { name: 'Delete Studio North' });
    fireEvent.click(deleteNorthBtn);
    expect(await screen.findByText(/Delete workspace "Studio North"\?/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByTestId('harness-ws-name')).toHaveTextContent('Studio North');

    // Confirm deletion -> deletes Studio North DB and safely falls back to Local Workspace
    fireEvent.click(screen.getByRole('button', { name: 'Delete Studio North' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Workspace' }));

    await waitFor(() => {
      expect(screen.getByTestId('harness-ws-id')).toHaveTextContent('local-workspace');
      expect(screen.getByTestId('harness-client-count')).toHaveTextContent('1');
    });
    expect(
      (screen.getByLabelText('Temporary Notes & Reminders') as HTMLTextAreaElement).value
    ).toBe('Default workspace private note');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    // Direct deletion guard on default workspace
    await expect(deleteWorkspaceRecord('local-workspace')).rejects.toThrow(/cannot be deleted/i);
  });

  it('Phase 64: eliminates completedAt || updatedAt defect, handles missing/invalid timestamps, midnight TZ boundaries, reopening, and goal changes', async () => {
    // 1. Date validation rejects 2026-02-30 rollover
    expect(toWorkspaceDateStr('2026-02-30', 'UTC')).toBe('');
    expect(toWorkspaceDateStr('not-a-timestamp', 'UTC')).toBe('');

    const historicalEditedDoneTask: Task = {
      id: 'tsk_hist_edited',
      projectId: '',
      clientId: '',
      title: 'Old done task edited today',
      description: 'Updated notes later',
      status: 'done',
      priority: 'medium',
      dueDate: '2026-11-10',
      assignee: '',
      tags: [],
      subtasks: [],
      comments: [],
      attachmentVaultIds: [],
      dependsOnIds: [],
      estimatedHours: 2,
      recurrenceRule: 'none',
      autoPriorityScore: 0,
      completedAt: '2026-11-10T14:00:00Z',
      isDemo: false,
      createdAt: '2026-11-09T09:00:00Z',
      updatedAt: '2026-11-20T16:00:00Z',
    };

    const missingCompletedAtTask: Task = {
      ...historicalEditedDoneTask,
      id: 'tsk_missing_ts',
      completedAt: '',
      updatedAt: '2026-11-20T16:00:00Z',
    };

    const invalidCompletedAtTask: Task = {
      ...historicalEditedDoneTask,
      id: 'tsk_invalid_ts',
      completedAt: '2026-02-30',
      updatedAt: '2026-11-20T16:00:00Z',
    };

    const tzMidnightBoundaryTask: Task = {
      ...historicalEditedDoneTask,
      id: 'tsk_tz_midnight',
      completedAt: '2026-11-20T03:00:00Z', // 2026-11-20 in UTC, 2026-11-19 19:00 in America/Los_Angeles
      updatedAt: '2026-11-20T03:00:00Z',
    };

    // Must NOT count historical edited, missing, or invalid timestamps on 2026-11-20
    const utcResult = computeDailyTaskGoalProgress({
      tasks: [
        historicalEditedDoneTask,
        missingCompletedAtTask,
        invalidCompletedAtTask,
        tzMidnightBoundaryTask,
        tzMidnightBoundaryTask, // duplicate check
      ],
      target: 3,
      today: '2026-11-20',
      timeZone: 'UTC',
    });
    expect(utcResult.completedToday).toBe(1);
    expect(utcResult.completedTaskIds).toEqual(['tsk_tz_midnight']);

    const laResultNov19 = computeDailyTaskGoalProgress({
      tasks: [tzMidnightBoundaryTask],
      target: 2,
      today: '2026-11-19',
      timeZone: 'America/Los_Angeles',
    });
    expect(laResultNov19.completedToday).toBe(1);

    const laResultNov20 = computeDailyTaskGoalProgress({
      tasks: [tzMidnightBoundaryTask],
      target: 2,
      today: '2026-11-20',
      timeZone: 'America/Los_Angeles',
    });
    expect(laResultNov20.completedToday).toBe(0);

    // 2. Test idempotent backward-compatible legacy backfill migration
    const migDb = new SolodeskDatabase('solodesk_test_mig_' + Date.now());
    await migDb.tasks.put({
      ...historicalEditedDoneTask,
      id: 'tsk_legacy_done',
      completedAt: '',
      createdAt: '2026-10-01T08:00:00Z',
      updatedAt: '2026-10-02T12:00:00Z',
    });

    const mig1 = await runTaskCompletionTimestampMigration(migDb);
    expect(mig1.ran).toBe(true);
    expect(mig1.backfilledCount).toBe(1);

    const backfilledTask = await migDb.tasks.get('tsk_legacy_done');
    expect(backfilledTask?.completedAt).toBe('2026-10-02T12:00:00Z');

    // Second run is strictly idempotent
    const mig2 = await runTaskCompletionTimestampMigration(migDb);
    expect(mig2.ran).toBe(false);
    expect(mig2.backfilledCount).toBe(0);
    await migDb.delete();

    // 3. Verify reopen + re-complete lifecycle + editing done task preserves completedAt
    const task = await repositories.createTask({
      title: 'Lifecycle audit task',
      description: '',
      projectId: '',
      clientId: '',
      priority: 'high',
      status: 'todo',
      dueDate: todayDateStr(),
      tags: [],
      subtasks: [],
      completedAt: '',
      isDemo: false,
    });
    const done1 = await repositories.updateTask(task.id, { status: 'done' });
    expect(done1.completedAt).not.toBe('');

    const editedDone = await repositories.updateTask(task.id, { title: 'Edited title while done' });
    expect(editedDone.completedAt).toBe(done1.completedAt);

    const reopened = await repositories.updateTask(task.id, { status: 'todo' });
    expect(reopened.completedAt).toBe('');

    const done2 = await repositories.updateTask(task.id, { status: 'done' });
    expect(done2.completedAt).not.toBe('');
  });

  it('Phase 65: prevents unsaved draft loss on workspace switch, verifies beforeunload guard, and scopes Ctrl/Cmd+S strictly to Quick Notes textarea', async () => {
    renderWithApp(<AuditHarness />);
    await waitFor(() => {
      expect(screen.queryByText('Loading workspace...')).not.toBeInTheDocument();
    });

    // Create second workspace cleanly first, then switch back to local-workspace
    fireEvent.click(screen.getAllByTestId('workspace-switcher-trigger')[0]);
    fireEvent.change(screen.getByLabelText('Create New Isolated Workspace'), {
      target: { value: 'Client Beta' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create Workspace/i }));
    await waitFor(() => {
      expect(screen.getByTestId('harness-ws-name')).toHaveTextContent('Client Beta');
    });

    // Ctrl+S dispatched outside Quick Notes textarea must NOT trigger saveSettings
    const saveSpy = vi.spyOn(repositories, 'saveSettings');
    const unrelatedInput = screen.getByLabelText('Unrelated App Input');
    unrelatedInput.focus();
    fireEvent.keyDown(unrelatedInput, { key: 's', ctrlKey: true });
    expect(saveSpy).not.toHaveBeenCalled();

    // Unsaved edits trigger beforeunload.preventDefault() and switch warning dialog
    const notesTextarea = screen.getByLabelText('Temporary Notes & Reminders') as HTMLTextAreaElement;
    fireEvent.change(notesTextarea, { target: { value: 'Critical unsaved beta draft' } });

    const beforeUnloadEvt = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnloadEvt);
    expect(beforeUnloadEvt.defaultPrevented).toBe(true);

    // Try switching to Local Workspace -> must prompt Unsaved Quick Notes Draft confirmation
    fireEvent.click(screen.getAllByTestId('workspace-switcher-trigger')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
    expect(await screen.findByText('Unsaved Quick Notes Draft')).toBeInTheDocument();

    // Click Stay & Save First -> stays on Client Beta and preserves draft
    fireEvent.click(screen.getByRole('button', { name: 'Stay & Save First' }));
    expect(screen.getByTestId('harness-ws-name')).toHaveTextContent('Client Beta');
    expect(notesTextarea.value).toBe('Critical unsaved beta draft');

    // Close Workspace modal cleanly so Ctrl+S inside textarea saves draft
    fireEvent.keyDown(notesTextarea, { key: 's', ctrlKey: true });
    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalled();
      expect(screen.getByText(/Saved locally/i)).toBeInTheDocument();
    });

    // After save, beforeunload must NOT block tab unload
    await waitFor(() => {
      const cleanUnloadEvt = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(cleanUnloadEvt);
      expect(cleanUnloadEvt.defaultPrevented).toBe(false);
    });
    saveSpy.mockRestore();
  });

  it('Phase 66: distinguishes all 6 sync lifecycle states, retries transient errors with bounded backoff & shared Idempotency-Key, and prevents silent overwrites', async () => {
    expect(SYNC_LIFECYCLE_LABELS).toEqual({
      local_only: 'Local Only',
      pending: 'Pending',
      syncing: 'Syncing',
      synced: 'Synced',
      conflict: 'Conflict',
      failed: 'Failed',
    });

    expect(
      deriveRemoteSyncLifecycleStatus({ syncQueue: [], remoteConfigured: false })
    ).toBe('local_only');
    expect(
      deriveRemoteSyncLifecycleStatus({
        syncQueue: [],
        remoteConfigured: true,
        isSyncingRemote: true,
      })
    ).toBe('syncing');
    expect(
      deriveRemoteSyncLifecycleStatus({
        syncQueue: [],
        remoteConfigured: true,
        lastRemoteSyncedAt: '2026-11-20T10:00:00Z',
      })
    ).toBe('synced');

    const item = await repositories.enqueueSyncItem({
      entityType: 'client',
      entityId: 'cli_sync_1',
      operation: 'upsert',
      revision: 3,
      status: 'pending',
      conflictReason: '',
      payloadJson: '{"name":"Sync Test"}',
    });

    expect(
      deriveRemoteSyncLifecycleStatus({ syncQueue: [item], remoteConfigured: true })
    ).toBe('pending');
    expect(
      deriveRemoteSyncLifecycleStatus({
        syncQueue: [{ ...item, status: 'conflict' }],
        remoteConfigured: true,
      })
    ).toBe('conflict');
    expect(
      deriveRemoteSyncLifecycleStatus({
        syncQueue: [{ ...item, status: 'failed' }],
        remoteConfigured: true,
      })
    ).toBe('failed');

    // Verify bounded exponential backoff retry reuses identical Idempotency-Key across attempts
    const seenKeys: string[] = [];
    let callNum = 0;
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      callNum += 1;
      const hdrs = (init?.headers ?? {}) as Record<string, string>;
      seenKeys.push(hdrs['Idempotency-Key']);
      if (callNum < 3) {
        return new Response(
          JSON.stringify({ error: { message: 'Temporary upstream overload' } }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({
          ok: true,
          ackedIds: [item.id],
          conflicts: [],
          serverTimestamp: '2026-11-20T12:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const retryResult = await pushSyncQueueWithRetry({
      endpointUrl: '/api/v1',
      workspaceId: 'ws_test',
      items: [item],
      fetchImpl: fetchMock as unknown as typeof fetch,
      maxAttempts: 4,
      baseDelayMs: 100,
      maxDelayMs: 300,
      sleepImpl: async () => {},
    });

    expect(retryResult.ok).toBe(true);
    expect(retryResult.attempts).toBe(3);
    expect(retryResult.delaysMs).toEqual([100, 200]);
    expect(retryResult.ackedIds).toEqual([item.id]);
    expect(new Set(seenKeys).size).toBe(1);

    // Verify non-retryable 401 stops immediately after 1 attempt
    const authFailMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), { status: 401 })
    );
    const authFailRes = await pushSyncQueueWithRetry({
      endpointUrl: '/api/v1',
      workspaceId: 'ws_test',
      items: [item],
      fetchImpl: authFailMock as unknown as typeof fetch,
      maxAttempts: 4,
      sleepImpl: async () => {},
    });
    expect(authFailRes.ok).toBe(false);
    expect(authFailRes.attempts).toBe(1);
    expect(authFailRes.retryable).toBe(false);

    // Conflict resolution prepares pending patch without fake local ACK
    const decision = resolveSyncConflict({
      localUpdatedAt: '2026-11-20T10:00:00Z',
      remoteUpdatedAt: '2026-11-20T12:00:00Z',
      strategy: 'latest_timestamp',
    });
    expect(decision.winner).toBe('remote');
    expect(buildResolvedPendingPatch(decision).status).toBe('pending');
  });
});
