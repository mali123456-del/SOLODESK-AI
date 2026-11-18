import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  EyeOff,
  FolderKanban,
  Play,
  Square,
  Target,
} from 'lucide-react';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Select,
  useToast,
} from '../../components/ui';
import { repositories } from '../../database/repositories/dexieRepositories';
import { formatDisplayDate, formatDurationHMS } from '../../domain/calculations/dates';
import { computeAutoPriorityScore } from '../../services/projectPlanningService';
import type { AppRouteId } from '../../types/navigation';

interface FocusModeViewProps {
  initialTarget?: { type: 'project' | 'task'; id: string } | null;
  onExitFocusMode: () => void;
  onNavigate: (route: AppRouteId) => void;
}

export const FocusModeView: React.FC<FocusModeViewProps> = ({
  initialTarget,
  onExitFocusMode,
  onNavigate,
}) => {
  const { projects, tasks, clients, timeEntries, settings, refresh } = useWorkspace();
  const { pushToast } = useToast();

  const openTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.status !== 'done' && t.status !== 'archived')
        .sort((a, b) => computeAutoPriorityScore(b) - computeAutoPriorityScore(a)),
    [tasks]
  );

  const activeProjects = useMemo(
    () => projects.filter((p) => !p.isTemplate && p.status !== 'archived' && p.status !== 'completed'),
    [projects]
  );

  const [focusKind, setFocusKind] = useState<'task' | 'project'>(
    initialTarget?.type ?? (openTasks.length > 0 ? 'task' : 'project')
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string>(
    initialTarget?.type === 'task' ? initialTarget.id : (openTasks[0]?.id ?? '')
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    initialTarget?.type === 'project' ? initialTarget.id : (activeProjects[0]?.id ?? '')
  );
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialTarget?.type === 'task' && initialTarget.id) {
      setFocusKind('task');
      setSelectedTaskId(initialTarget.id);
    } else if (initialTarget?.type === 'project' && initialTarget.id) {
      setFocusKind('project');
      setSelectedProjectId(initialTarget.id);
    }
  }, [initialTarget]);

  useEffect(() => {
    if (focusKind === 'task' && !selectedTaskId && openTasks[0]) {
      setSelectedTaskId(openTasks[0].id);
    }
    if (focusKind === 'project' && !selectedProjectId && activeProjects[0]) {
      setSelectedProjectId(activeProjects[0].id);
    }
  }, [focusKind, selectedTaskId, selectedProjectId, openTasks, activeProjects]);

  const runningTimer = useMemo(
    () => timeEntries.find((entry) => entry.isRunning),
    [timeEntries]
  );

  useEffect(() => {
    if (!runningTimer) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [runningTimer]);

  const focusedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) ?? openTasks[0] ?? null,
    [tasks, selectedTaskId, openTasks]
  );

  const focusedProject = useMemo(() => {
    if (focusKind === 'project') {
      return projects.find((p) => p.id === selectedProjectId) ?? activeProjects[0] ?? null;
    }
    if (focusedTask?.projectId) {
      return projects.find((p) => p.id === focusedTask.projectId) ?? null;
    }
    return null;
  }, [focusKind, projects, selectedProjectId, activeProjects, focusedTask]);

  const clientName = useMemo(() => {
    const cid = focusedProject?.clientId || focusedTask?.clientId;
    if (!cid) return 'Internal / Unassigned';
    return clients.find((c) => c.id === cid)?.name ?? 'Client';
  }, [clients, focusedProject, focusedTask]);

  const elapsedSeconds = useMemo(() => {
    if (!runningTimer) return 0;
    return Math.max(0, Math.floor((nowTick - new Date(runningTimer.startTime).getTime()) / 1000));
  }, [runningTimer, nowTick]);

  const projectTasks = useMemo(
    () =>
      focusedProject
        ? tasks.filter((t) => t.projectId === focusedProject.id && t.status !== 'archived')
        : [],
    [tasks, focusedProject]
  );

  const blockingDeps = useMemo(() => {
    if (!focusedTask) return [];
    const map = new Map(tasks.map((t) => [t.id, t]));
    return (focusedTask.dependsOnIds ?? [])
      .map((id) => map.get(id))
      .filter((t): t is NonNullable<typeof t> => Boolean(t));
  }, [focusedTask, tasks]);

  const handleToggleSubtask = async (subId: string) => {
    if (!focusedTask) return;
    const nextSubs = focusedTask.subtasks.map((s) =>
      s.id === subId ? { ...s, done: !s.done } : s
    );
    await repositories.updateTask(focusedTask.id, { subtasks: nextSubs });
    await refresh();
  };

  const handleCompleteTask = async () => {
    if (!focusedTask) return;
    setBusy(true);
    try {
      await repositories.updateTask(focusedTask.id, {
        status: 'done',
        completedAt: new Date().toISOString(),
      });
      await repositories.logActivity({
        entityType: 'task',
        entityId: focusedTask.id,
        action: 'completed_in_focus',
        summary: `Completed task "${focusedTask.title}" inside Focus Mode`,
      });
      pushToast({ title: 'Task marked complete', tone: 'success' });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleStartFocusTimer = async () => {
    if (runningTimer) return;
    setBusy(true);
    try {
      const label =
        focusKind === 'task' && focusedTask
          ? focusedTask.title
          : focusedProject
            ? `${focusedProject.name} — Deep Work`
            : 'Focus Session';
      await repositories.startTimer({
        projectId: focusedProject?.id ?? '',
        taskId: focusKind === 'task' ? (focusedTask?.id ?? '') : '',
        description: label,
        hourlyRate: focusedProject?.hourlyRate || settings?.defaultHourlyRate || 100,
        billable: true,
      });
      pushToast({ title: 'Focus timer started', tone: 'info' });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleStopTimer = async () => {
    if (!runningTimer) return;
    setBusy(true);
    try {
      await repositories.stopTimer(runningTimer.id);
      pushToast({ title: 'Time entry saved to workspace', tone: 'success' });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleToggleMilestone = async (milestoneId: string) => {
    if (!focusedProject) return;
    const updated = focusedProject.milestones.map((m) =>
      m.id === milestoneId ? { ...m, completed: !m.completed } : m
    );
    const doneCount = updated.filter((m) => m.completed).length;
    const progress = updated.length > 0 ? Math.round((doneCount / updated.length) * 100) : focusedProject.progress;
    await repositories.updateProject(focusedProject.id, { milestones: updated, progress });
    await refresh();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Focus Mode"
        description="Distraction-free single-item workspace. Sidebar navigation and notifications are hidden."
        actions={
          <Button variant="outline" onClick={onExitFocusMode}>
            <EyeOff className="w-4 h-4 mr-1.5" aria-hidden="true" />
            Exit Focus Mode (Esc)
          </Button>
        }
      />

      {/* Selector Bar */}
      <Card padding="sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Focus Target Type
            </label>
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-[10px] bg-slate-100 dark:bg-[#101827] border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setFocusKind('task')}
                className={`py-1.5 text-xs font-medium rounded-lg cursor-pointer transition-colors ${
                  focusKind === 'task'
                    ? 'bg-white dark:bg-[#172338] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Active Task ({openTasks.length})
              </button>
              <button
                type="button"
                onClick={() => setFocusKind('project')}
                className={`py-1.5 text-xs font-medium rounded-lg cursor-pointer transition-colors ${
                  focusKind === 'project'
                    ? 'bg-white dark:bg-[#172338] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Active Project ({activeProjects.length})
              </button>
            </div>
          </div>

          <div className="md:col-span-2">
            {focusKind === 'task' ? (
              <Select
                label="Focused Task"
                value={focusedTask?.id ?? ''}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                options={
                  openTasks.length > 0
                    ? openTasks.map((t) => ({
                        value: t.id,
                        label: `[${t.priority.toUpperCase()}] ${t.title}`,
                      }))
                    : [{ value: '', label: 'No open tasks available' }]
                }
              />
            ) : (
              <Select
                label="Focused Project"
                value={focusedProject?.id ?? ''}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                options={
                  activeProjects.length > 0
                    ? activeProjects.map((p) => ({
                        value: p.id,
                        label: `${p.name} (${p.progress}%)`,
                      }))
                    : [{ value: '', label: 'No active projects available' }]
                }
              />
            )}
          </div>
        </div>
      </Card>

      {/* Live Focus Timer Bar */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-[#2563EB] dark:text-[#20C7D9]">
              <Clock className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {runningTimer ? 'Active Session Timer' : 'Deep Work Timer Ready'}
              </p>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {formatDurationHMS(elapsedSeconds)}
              </p>
              {runningTimer && (
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-md">
                  Tracking: {runningTimer.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {runningTimer ? (
              <Button variant="danger" onClick={() => void handleStopTimer()} loading={busy}>
                <Square className="w-4 h-4 mr-1.5" aria-hidden="true" />
                Stop & Log Time
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => void handleStartFocusTimer()}
                loading={busy}
                disabled={focusKind === 'task' ? !focusedTask : !focusedProject}
              >
                <Play className="w-4 h-4 mr-1.5" aria-hidden="true" />
                Start Focus Timer
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Single Focused Entity Card */}
      {focusKind === 'task' ? (
        focusedTask ? (
          <Card>
            <CardHeader
              title={focusedTask.title}
              description={`${clientName}${focusedProject ? ` · ${focusedProject.name}` : ''} · Due ${formatDisplayDate(focusedTask.dueDate)}`}
              action={
                <div className="flex items-center gap-2">
                  <Badge
                    tone={
                      focusedTask.priority === 'urgent' || focusedTask.priority === 'high'
                        ? 'danger'
                        : 'info'
                    }
                  >
                    {focusedTask.priority}
                  </Badge>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => void handleCompleteTask()}
                    loading={busy}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" aria-hidden="true" />
                    Complete Task
                  </Button>
                </div>
              }
            />

            <div className="space-y-5">
              {focusedTask.description && (
                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#101827] border border-slate-200 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  {focusedTask.description}
                </div>
              )}

              {blockingDeps.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    Dependencies ({blockingDeps.length})
                  </h3>
                  <ul className="space-y-1.5">
                    {blockingDeps.map((dep) => (
                      <li
                        key={dep.id}
                        className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-sm"
                      >
                        <span className="truncate">{dep.title}</span>
                        <Badge tone={dep.status === 'done' ? 'success' : 'warning'}>
                          {dep.status}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Subtasks Checklist ({focusedTask.subtasks.filter((s) => s.done).length}/
                  {focusedTask.subtasks.length})
                </h3>
                {focusedTask.subtasks.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No subtasks configured on this task. Add subtasks in Tasks if needed.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {focusedTask.subtasks.map((sub) => (
                      <li key={sub.id}>
                        <button
                          type="button"
                          onClick={() => void handleToggleSubtask(sub.id)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-[#101827] text-left cursor-pointer"
                        >
                          {sub.done ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          <span
                            className={`text-sm ${
                              sub.done ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {sub.title}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon={<Target className="w-6 h-6" />}
              title="All tasks completed"
              description="Switch to Project focus above or create a new task to enter deep work."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    onExitFocusMode();
                    onNavigate('tasks');
                  }}
                >
                  Open Tasks
                </Button>
              }
            />
          </Card>
        )
      ) : focusedProject ? (
        <Card>
          <CardHeader
            title={focusedProject.name}
            description={`${clientName} · Progress ${focusedProject.progress}% · Due ${formatDisplayDate(focusedProject.dueDate)}`}
            action={<Badge tone="info">{focusedProject.status}</Badge>}
          />
          <div className="space-y-5">
            {focusedProject.description && (
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#101827] border border-slate-200 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300">
                {focusedProject.description}
              </div>
            )}

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Milestones ({focusedProject.milestones.filter((m) => m.completed).length}/
                {focusedProject.milestones.length})
              </h3>
              {focusedProject.milestones.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No milestones defined on this project yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {focusedProject.milestones.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => void handleToggleMilestone(m.id)}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-[#101827] text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          {m.completed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          <span
                            className={`text-sm truncate ${
                              m.completed ? 'line-through text-slate-400' : ''
                            }`}
                          >
                            {m.title}
                          </span>
                        </span>
                        <span className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
                          {formatDisplayDate(m.dueDate)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Project Open Tasks ({projectTasks.filter((t) => t.status !== 'done').length})
              </h3>
              <ul className="space-y-1.5">
                {projectTasks.slice(0, 6).map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-sm"
                  >
                    <span className={t.status === 'done' ? 'line-through text-slate-400' : ''}>
                      {t.title}
                    </span>
                    <Badge tone={t.status === 'done' ? 'success' : 'neutral'}>{t.status}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={<FolderKanban className="w-6 h-6" />}
            title="No active project selected"
            description="Create or activate a project to focus on its milestones and deliverables."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  onExitFocusMode();
                  onNavigate('projects');
                }}
              >
                Open Projects
              </Button>
            }
          />
        </Card>
      )}
    </div>
  );
};
