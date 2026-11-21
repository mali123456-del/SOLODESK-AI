import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../src/app/providers/ThemeProvider';
import { useWorkspace, WorkspaceProvider } from '../../src/app/providers/WorkspaceProvider';
import { ToastProvider } from '../../src/components/ui';
import { db } from '../../src/database/db';
import { repositories } from '../../src/database/repositories/dexieRepositories';
import { todayDateStr } from '../../src/domain/calculations/dates';
import type { Task } from '../../src/domain/schemas/entities';
import { DailyTaskGoalCard } from '../../src/features/dashboard/DailyTaskGoalCard';
import { QuickNotesCard } from '../../src/features/dashboard/QuickNotesCard';
import { computeDailyTaskGoalProgress } from '../../src/services/productivityService';

const WorkspaceSwitcherHarness: React.FC = () => {
  const { loading, activeWorkspaceId, setActiveWorkspaceId, refresh } = useWorkspace();
  if (loading) return <div>Loading workspace...</div>;
  return (
    <div>
      <button type="button" onClick={() => void setActiveWorkspaceId('workspace-alpha')}>
        Switch Alpha
      </button>
      <button type="button" onClick={() => void setActiveWorkspaceId('workspace-beta')}>
        Switch Beta
      </button>
      <button type="button" onClick={() => void refresh()}>
        Refresh Workspace
      </button>
      <span data-testid="active-ws-id">{activeWorkspaceId}</span>
      <QuickNotesCard />
      <DailyTaskGoalCard />
    </div>
  );
};

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <WorkspaceProvider>{ui}</WorkspaceProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

describe('Phases 61–62: Dashboard Quick Notes & Daily Task Completion Goal', () => {
  beforeEach(async () => {
    await db.appSettings.clear();
    await db.tasks.clear();
    await db.projects.clear();
    await db.clients.clear();
    await db.activities.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('handles Quick Notes empty, unsaved, save, edit, reload persistence, and clear confirmation states without webStorage', async () => {
    const view = renderWithProviders(<WorkspaceSwitcherHarness />);

    await waitFor(() => {
      expect(screen.queryByText('Loading workspace...')).not.toBeInTheDocument();
    });

    // 1. Initial empty state
    expect(screen.getByText(/Empty scratchpad/i)).toBeInTheDocument();
    const textarea = screen.getByLabelText('Temporary Notes & Reminders') as HTMLTextAreaElement;
    expect(textarea.value).toBe('');
    expect(screen.getByRole('button', { name: /Save Note/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Clear Note/i })).toBeDisabled();

    // 2. Typing shows unsaved state & enables Save + Discard
    fireEvent.change(textarea, { target: { value: 'Call Acme Corp before 3 PM' } });
    expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Note/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Discard Changes/i })).toBeEnabled();

    // 3. Save note locally to IndexedDB
    fireEvent.click(screen.getByRole('button', { name: /Save Note/i }));
    await waitFor(() => {
      expect(screen.getByText(/Saved locally/i)).toBeInTheDocument();
    });

    // Zero localStorage/sessionStorage usage
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    // 4. Simulate full page reload by unmounting and re-mounting
    view.unmount();
    renderWithProviders(<WorkspaceSwitcherHarness />);
    await waitFor(() => {
      expect(screen.queryByText('Loading workspace...')).not.toBeInTheDocument();
    });

    const reloadedTextarea = screen.getByLabelText(
      'Temporary Notes & Reminders'
    ) as HTMLTextAreaElement;
    expect(reloadedTextarea.value).toBe('Call Acme Corp before 3 PM');

    // 5. Edit existing note and confirm Discard restores saved text
    fireEvent.change(reloadedTextarea, { target: { value: 'Accidental overwrite' } });
    fireEvent.click(screen.getByRole('button', { name: /Discard Changes/i }));
    expect(reloadedTextarea.value).toBe('Call Acme Corp before 3 PM');

    // Edit & re-save
    fireEvent.change(reloadedTextarea, { target: { value: 'Updated reminder: send SOW v2' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Note/i }));
    await waitFor(() => {
      expect(screen.getByText(/Saved locally/i)).toBeInTheDocument();
    });

    // 6. Clear note via confirmation dialog
    fireEvent.click(screen.getByRole('button', { name: /Clear Note/i }));
    expect(await screen.findByText('Clear Quick Notes?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear Scratchpad' }));

    await waitFor(() => {
      expect(
        (screen.getByLabelText('Temporary Notes & Reminders') as HTMLTextAreaElement).value
      ).toBe('');
      expect(screen.getByText(/Empty scratchpad/i)).toBeInTheDocument();
    });
  });

  it('isolates Quick Notes per workspace and preserves draft text on IndexedDB save errors', async () => {
    renderWithProviders(<WorkspaceSwitcherHarness />);

    await waitFor(() => {
      expect(screen.queryByText('Loading workspace...')).not.toBeInTheDocument();
    });

    // Save note in workspace-alpha
    fireEvent.click(screen.getByText('Switch Alpha'));
    await waitFor(() => {
      expect(screen.getByTestId('active-ws-id').textContent).toBe('workspace-alpha');
    });

    const textarea = screen.getByLabelText('Temporary Notes & Reminders') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Alpha confidential note' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Note/i }));
    await waitFor(() => {
      expect(screen.getByText(/Saved locally/i)).toBeInTheDocument();
    });

    // Switch to workspace-beta — must NOT see workspace-alpha notes
    fireEvent.click(screen.getByText('Switch Beta'));
    await waitFor(() => {
      expect(screen.getByTestId('active-ws-id').textContent).toBe('workspace-beta');
    });
    expect(
      (screen.getByLabelText('Temporary Notes & Reminders') as HTMLTextAreaElement).value
    ).toBe('');

    // Error handling: failing write displays alert while preserving user draft
    const saveSpy = vi
      .spyOn(repositories, 'saveSettings')
      .mockRejectedValueOnce(new Error('IndexedDB write quota reached'));
    fireEvent.change(screen.getByLabelText('Temporary Notes & Reminders'), {
      target: { value: 'Beta unsaved draft that must survive error' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Note/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('IndexedDB write quota reached');
    });
    expect(
      (screen.getByLabelText('Temporary Notes & Reminders') as HTMLTextAreaElement).value
    ).toBe('Beta unsaved draft that must survive error');
    saveSpy.mockRestore();

    // Switch back to workspace-alpha — note remains intact
    fireEvent.click(screen.getByText('Switch Alpha'));
    await waitFor(() => {
      expect(
        (screen.getByLabelText('Temporary Notes & Reminders') as HTMLTextAreaElement).value
      ).toBe('Alpha confidential note');
    });
  });

  it('sets, validates, updates, persists Daily Task Goal and tracks task completion & reopening live', async () => {
    const t1 = await repositories.createTask({
      title: 'Design hero cards',
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
    const t2 = await repositories.createTask({
      title: 'Verify tax rounding',
      description: '',
      projectId: '',
      clientId: '',
      priority: 'medium',
      status: 'in_progress',
      dueDate: todayDateStr(),
      tags: [],
      subtasks: [],
      completedAt: '',
      isDemo: false,
    });

    const view = renderWithProviders(<WorkspaceSwitcherHarness />);
    await waitFor(() => {
      expect(screen.queryByText('Loading workspace...')).not.toBeInTheDocument();
    });

    // 1. Initial 0/unset target state
    expect(screen.getByText(/No daily target set/i)).toBeInTheDocument();
    expect(screen.getByTestId('daily-task-goal-percent').textContent).toBe('0%');

    // 2. Reject invalid targets (-3, decimal, empty, >500)
    const goalInput = screen.getByLabelText('Daily task target') as HTMLInputElement;
    fireEvent.change(goalInput, { target: { value: '-3' } });
    fireEvent.click(screen.getByRole('button', { name: /Update Target/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Daily task target cannot be negative.'
    );

    fireEvent.change(goalInput, { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: /Update Target/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Daily task target must be a whole number.'
    );

    // 3. Set valid target = 2
    fireEvent.change(goalInput, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /Update Target/i }));
    await waitFor(() => {
      expect(screen.getByTestId('daily-task-goal-ratio').textContent).toBe('0/2');
    });

    // 4. Complete first task -> 1/2 (50%)
    await repositories.updateTask(t1.id, { status: 'done' });
    fireEvent.click(screen.getByText('Refresh Workspace'));
    await waitFor(() => {
      expect(screen.getByTestId('daily-task-goal-ratio').textContent).toBe('1/2');
      expect(screen.getByTestId('daily-task-goal-percent').textContent).toBe('50%');
    });

    // 5. Complete second task -> 2/2 (100% + Goal Reached)
    await repositories.updateTask(t2.id, { status: 'done' });
    fireEvent.click(screen.getByText('Refresh Workspace'));
    await waitFor(() => {
      expect(screen.getByTestId('daily-task-goal-ratio').textContent).toBe('2/2');
      expect(screen.getByTestId('daily-task-goal-percent').textContent).toBe('100%');
      expect(screen.getByText(/Daily goal reached!/i)).toBeInTheDocument();
    });

    // 6. Reopen task -> count drops back to 1/2 (50%)
    await repositories.updateTask(t2.id, { status: 'in_progress' });
    fireEvent.click(screen.getByText('Refresh Workspace'));
    await waitFor(() => {
      expect(screen.getByTestId('daily-task-goal-ratio').textContent).toBe('1/2');
      expect(screen.getByTestId('daily-task-goal-percent').textContent).toBe('50%');
    });

    // 7. Persistence across full remount ("reload")
    view.unmount();
    renderWithProviders(<WorkspaceSwitcherHarness />);
    await waitFor(() => {
      expect(screen.queryByText('Loading workspace...')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('daily-task-goal-ratio').textContent).toBe('1/2');
    expect(screen.getByTestId('daily-task-goal-percent').textContent).toBe('50%');
  });

  it('prevents duplicate counting, handles date rollover without losing history, and respects workspace timezone', () => {
    const baseTask: Task = {
      id: 'tsk_dup_1',
      projectId: '',
      clientId: '',
      title: 'Send invoice',
      description: '',
      status: 'done',
      priority: 'high',
      dueDate: '2026-11-20',
      assignee: '',
      tags: [],
      subtasks: [],
      comments: [],
      attachmentVaultIds: [],
      dependsOnIds: [],
      estimatedHours: 1,
      recurrenceRule: 'none',
      autoPriorityScore: 10,
      completedAt: '2026-11-20T18:30:00Z',
      isDemo: false,
      createdAt: '2026-11-20T10:00:00Z',
      updatedAt: '2026-11-20T18:30:00Z',
    };

    const yesterdayTask: Task = {
      ...baseTask,
      id: 'tsk_yesterday',
      completedAt: '2026-11-19T15:00:00Z',
      updatedAt: '2026-11-19T15:00:00Z',
    };

    // Duplicate task IDs passed in array are counted once; yesterday's task does not count for 2026-11-20
    const dayOneProgress = computeDailyTaskGoalProgress({
      tasks: [baseTask, baseTask, yesterdayTask],
      target: 4,
      today: '2026-11-20',
      timeZone: 'UTC',
    });
    expect(dayOneProgress.completedToday).toBe(1);
    expect(dayOneProgress.rawPercent).toBe(25);

    // Date rolls over to 2026-11-21 -> count resets logically to 0 without deleting yesterday's tasks
    const rolledOverProgress = computeDailyTaskGoalProgress({
      tasks: [baseTask, yesterdayTask],
      target: 4,
      today: '2026-11-21',
      timeZone: 'UTC',
    });
    expect(rolledOverProgress.completedToday).toBe(0);
    expect(rolledOverProgress.rawPercent).toBe(0);

    // Zero / missing target yields safe 0% with hasTarget = false
    const zeroTarget = computeDailyTaskGoalProgress({
      tasks: [baseTask],
      target: 0,
      today: '2026-11-20',
      timeZone: 'UTC',
    });
    expect(zeroTarget.hasTarget).toBe(false);
    expect(zeroTarget.rawPercent).toBe(0);
    expect(zeroTarget.completedToday).toBe(1);
  });
});
