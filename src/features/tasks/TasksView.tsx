import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  Circle,
  Columns3,
  Focus,
  List,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Tabs,
  Textarea,
  useToast,
} from '../../components/ui';
import { repositories } from '../../database/repositories/dexieRepositories';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import { addDaysToDateStr, formatDisplayDate, isDateOverdue, todayDateStr } from '../../domain/calculations/dates';
import {
  createId,
  type Priority,
  type Subtask,
  type Task,
  type TaskStatus,
} from '../../domain/schemas/entities';
import { VoiceNotesPanel } from '../../components/common/VoiceNotesPanel';
import {
  computeAutoPriorityScore,
  computeCriticalPath,
  wouldTaskCreateCycle,
} from '../../services/projectPlanningService';

interface TasksViewProps {
  onFocusTask?: (taskId: string) => void;
}

const KANBAN_COLUMNS: Array<{ status: TaskStatus; label: string }> = [
  { status: 'todo', label: 'To Do' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'review', label: 'In Review' },
  { status: 'done', label: 'Done' },
];

export const TasksView: React.FC<TasksViewProps> = ({ onFocusTask }) => {
  const { tasks, projects, clients, vaultFiles, settings, refresh } = useWorkspace();
  const { pushToast } = useToast();

  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [statusFilter, setStatusFilter] = useState<'active' | 'done' | 'archived' | 'all'>('active');
  const [sortByAutoPriority, setSortByAutoPriority] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [dueDate, setDueDate] = useState('');
  const [assignee, setAssignee] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('2');
  const [recurrenceRule, setRecurrenceRule] = useState<Task['recurrenceRule']>('none');
  const [dependsOnIds, setDependsOnIds] = useState<string[]>([]);
  const [depError, setDepError] = useState<string | null>(null);
  const [tagsText, setTagsText] = useState('');
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [newCommentBody, setNewCommentBody] = useState('');
  const [attachVaultId, setAttachVaultId] = useState('');
  const [saving, setSaving] = useState(false);

  const liveEditing = useMemo(
    () => (editing ? tasks.find((t) => t.id === editing.id) ?? editing : null),
    [tasks, editing]
  );

  const dateFormat = settings?.dateFormat ?? 'DD MMM YYYY';
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const criticalPath = useMemo(() => computeCriticalPath(tasks), [tasks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = tasks.filter((t) => {
      if (statusFilter === 'active' && (t.status === 'done' || t.status === 'archived')) return false;
      if (statusFilter === 'done' && t.status !== 'done') return false;
      if (statusFilter === 'archived' && t.status !== 'archived') return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
        (projectMap.get(t.projectId)?.name.toLowerCase().includes(q) ?? false)
      );
    });
    if (sortByAutoPriority) {
      return [...list].sort((a, b) => computeAutoPriorityScore(b) - computeAutoPriorityScore(a));
    }
    return list;
  }, [tasks, statusFilter, search, projectMap, sortByAutoPriority]);

  const openCreate = () => {
    setEditing(null);
    setTitle('');
    setDescription('');
    setProjectId(projects[0]?.id ?? '');
    setPriority('medium');
    setStatus('todo');
    setDueDate('');
    setAssignee('');
    setEstimatedHours('2');
    setRecurrenceRule('none');
    setDependsOnIds([]);
    setDepError(null);
    setTagsText('');
    setSubtasks([]);
    setNewSubtask('');
    setNewCommentBody('');
    setAttachVaultId('');
    setModalOpen(true);
  };

  const openEdit = (t: Task) => {
    setEditing(t);
    setTitle(t.title);
    setDescription(t.description);
    setProjectId(t.projectId);
    setPriority(t.priority);
    setStatus(t.status);
    setDueDate(t.dueDate);
    setAssignee(t.assignee ?? '');
    setEstimatedHours(String(t.estimatedHours ?? 2));
    setRecurrenceRule(t.recurrenceRule ?? 'none');
    setDependsOnIds(t.dependsOnIds ?? []);
    setDepError(null);
    setTagsText(t.tags.join(', '));
    setSubtasks(t.subtasks);
    setNewSubtask('');
    setNewCommentBody('');
    setAttachVaultId('');
    setModalOpen(true);
  };

  const toggleDependency = (depId: string) => {
    setDepError(null);
    if (dependsOnIds.includes(depId)) {
      setDependsOnIds((prev) => prev.filter((id) => id !== depId));
      return;
    }
    if (editing && wouldTaskCreateCycle(tasks, editing.id, depId)) {
      setDepError('Circular dependency blocked: adding this link would create a cycle.');
      return;
    }
    setDependsOnIds((prev) => [...prev, depId]);
  };

  const spawnRecurringNextIfNeeded = async (task: Task, nextStatus: TaskStatus) => {
    if (
      nextStatus === 'done' &&
      task.status !== 'done' &&
      task.recurrenceRule &&
      task.recurrenceRule !== 'none'
    ) {
      const days =
        task.recurrenceRule === 'daily' ? 1 : task.recurrenceRule === 'weekly' ? 7 : 30;
      const baseDate = task.dueDate || todayDateStr();
      const nextDue = addDaysToDateStr(baseDate, days);
      await repositories.createTask({
        title: task.title,
        description: task.description,
        projectId: task.projectId,
        clientId: task.clientId,
        priority: task.priority,
        status: 'todo',
        dueDate: nextDue,
        tags: task.tags,
        subtasks: task.subtasks.map((s) => ({ ...s, id: createId('st'), done: false })),
        dependsOnIds: [],
        estimatedHours: task.estimatedHours,
        recurrenceRule: task.recurrenceRule,
        completedAt: '',
        isDemo: false,
      });
      pushToast({
        title: `Recurring task scheduled for ${nextDue}`,
        tone: 'info',
      });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const linkedProject = projectMap.get(projectId);
      const tags = tagsText
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      const estHrs = Math.max(0, Number(estimatedHours) || 0);

      if (editing) {
        await repositories.updateTask(editing.id, {
          title: title.trim(),
          description,
          projectId,
          clientId: linkedProject?.clientId ?? '',
          priority,
          status,
          dueDate,
          assignee: assignee.trim(),
          tags,
          subtasks,
          dependsOnIds,
          estimatedHours: estHrs,
          recurrenceRule,
        });
        await spawnRecurringNextIfNeeded(editing, status);
        pushToast({ tone: 'success', title: 'Task updated' });
      } else {
        await repositories.createTask({
          title: title.trim(),
          description,
          projectId,
          clientId: linkedProject?.clientId ?? '',
          priority,
          status,
          dueDate,
          assignee: assignee.trim(),
          tags,
          subtasks,
          dependsOnIds,
          estimatedHours: estHrs,
          recurrenceRule,
          completedAt: '',
          isDemo: false,
        });
        pushToast({ tone: 'success', title: 'Task created' });
      }
      await refresh();
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleAddTaskComment = async (task: Task) => {
    if (!newCommentBody.trim()) return;
    const next = [
      ...(task.comments ?? []),
      {
        id: createId('cmt'),
        author: 'Workspace Owner',
        body: newCommentBody.trim(),
        createdAt: new Date().toISOString(),
      },
    ];
    await repositories.updateTask(task.id, { comments: next });
    setNewCommentBody('');
    await refresh();
  };

  const handleAttachTaskFile = async (task: Task, fileId: string) => {
    if (!fileId) return;
    const set = new Set(task.attachmentVaultIds ?? []);
    set.add(fileId);
    await repositories.updateTask(task.id, { attachmentVaultIds: Array.from(set) });
    setAttachVaultId('');
    await refresh();
  };

  const handleDetachTaskFile = async (task: Task, fileId: string) => {
    const next = (task.attachmentVaultIds ?? []).filter((id) => id !== fileId);
    await repositories.updateTask(task.id, { attachmentVaultIds: next });
    await refresh();
  };

  const quickToggleDone = async (task: Task) => {
    const nextStatus = task.status === 'done' ? 'todo' : 'done';
    await repositories.updateTask(task.id, { status: nextStatus });
    await spawnRecurringNextIfNeeded(task, nextStatus);
    await refresh();
  };

  const moveStatus = async (task: Task, nextStatus: TaskStatus) => {
    await repositories.updateTask(task.id, { status: nextStatus });
    await spawnRecurringNextIfNeeded(task, nextStatus);
    await refresh();
  };

  const priorityTone = (p: Priority) =>
    p === 'urgent' ? 'danger' : p === 'high' ? 'warning' : p === 'medium' ? 'info' : 'neutral';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description="Manage deliverables, subtasks, due dates, and Kanban workflow stages."
        actions={
          <>
            <div className="inline-flex rounded-[10px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#172338] p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-[#2563EB] text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <List className="w-3.5 h-3.5" aria-hidden="true" />
                List
              </button>
              <button
                type="button"
                onClick={() => setViewMode('board')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'board'
                    ? 'bg-[#2563EB] text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <Columns3 className="w-3.5 h-3.5" aria-hidden="true" />
                Kanban
              </button>
            </div>
            <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>
              Add Task
            </Button>
          </>
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Tabs
          activeId={statusFilter}
          onChange={(id) => setStatusFilter(id as typeof statusFilter)}
          items={[
            {
              id: 'active',
              label: 'Active',
              count: tasks.filter((t) => t.status !== 'done' && t.status !== 'archived').length,
            },
            { id: 'done', label: 'Completed', count: tasks.filter((t) => t.status === 'done').length },
            { id: 'archived', label: 'Archived', count: tasks.filter((t) => t.status === 'archived').length },
            { id: 'all', label: 'All', count: tasks.length },
          ]}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSortByAutoPriority((v) => !v)}
            className={`px-3 py-2 rounded-lg text-xs font-medium border cursor-pointer ${
              sortByAutoPriority
                ? 'border-[#2563EB] bg-blue-50 dark:bg-blue-950/40 text-[#2563EB] dark:text-[#20C7D9]'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            Auto-Priority Sort: {sortByAutoPriority ? 'ON' : 'OFF'}
          </button>
          <div className="w-full sm:w-64">
            <Input
              placeholder="Search tasks or tags..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
              aria-label="Search tasks"
            />
          </div>
        </div>
      </div>

      {tasks.length > 0 && (
        <Card padding="sm">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Critical Path Estimate:</span>
              <span className="font-mono tabular-nums">
                {criticalPath.criticalTaskIds.length} task(s) · {criticalPath.criticalDurationHours}h
              </span>
            </div>
            <div className="text-slate-500">
              {criticalPath.blockedTasks.length} task(s) waiting on unfinished dependencies
            </div>
          </div>
        </Card>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<CheckSquare className="w-5 h-5" />}
          title="No tasks match this view"
          description="Create a task to track project work, subtasks, and deadlines."
          action={
            <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>
              Add Task
            </Button>
          }
        />
      ) : viewMode === 'list' ? (
        <Card padding="none" className="divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.map((task) => {
            const overdue = task.status !== 'done' && task.status !== 'archived' && isDateOverdue(task.dueDate);
            const proj = projectMap.get(task.projectId);
            const cli = proj ? clients.find((c) => c.id === proj.clientId) : undefined;
            return (
              <div
                key={task.id}
                className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => void quickToggleDone(task)}
                    aria-label={task.status === 'done' ? `Reopen ${task.title}` : `Complete ${task.title}`}
                    className="mt-0.5 text-slate-400 hover:text-[#2563EB] cursor-pointer shrink-0"
                  >
                    {task.status === 'done' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </button>
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => openEdit(task)}
                      className={`text-sm font-medium text-left hover:underline cursor-pointer ${
                        task.status === 'done'
                          ? 'line-through text-slate-400'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {task.title}
                    </button>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {proj ? `${proj.name}${cli ? ` · ${cli.name}` : ''}` : 'Unassigned project'}
                      {task.assignee && ` · @${task.assignee}`}
                      {task.subtasks.length > 0 &&
                        ` · ${task.subtasks.filter((s) => s.done).length}/${task.subtasks.length} subtasks`}
                      {task.tags.length > 0 && ` · ${task.tags.join(', ')}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 pl-8 sm:pl-0">
                  {criticalPath.criticalTaskIds.includes(task.id) && (
                    <Badge tone="info">Critical</Badge>
                  )}
                  <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge>
                  <span
                    className={`text-xs ${
                      overdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-500'
                    }`}
                  >
                    {task.dueDate ? formatDisplayDate(task.dueDate, dateFormat) : 'No due date'}
                    {overdue ? ' · Overdue' : ''}
                  </span>
                  {onFocusTask && task.status !== 'done' && (
                    <button
                      type="button"
                      onClick={() => onFocusTask(task.id)}
                      aria-label={`Focus on ${task.title}`}
                      title="Open in Focus Mode"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-[#2563EB] hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
                    >
                      <Focus className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(task)}
                    aria-label={`Delete ${task.title}`}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {KANBAN_COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.status);
            return (
              <Card key={col.status} padding="sm" className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {col.label}
                  </h3>
                  <span className="text-xs font-mono text-slate-500">{colTasks.length}</span>
                </div>
                <div className="space-y-2.5">
                  {colTasks.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4 text-center">Empty</p>
                  ) : (
                    colTasks.map((t) => (
                      <div
                        key={t.id}
                        className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-[#101827] space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(t)}
                            className="text-sm font-medium text-left text-slate-900 dark:text-white hover:underline cursor-pointer"
                          >
                            {t.title}
                          </button>
                          <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
                        </div>
                        {t.dueDate && (
                          <p className="text-xs text-slate-500">
                            Due {formatDisplayDate(t.dueDate, dateFormat)}
                          </p>
                        )}
                        <Select
                          aria-label={`Move ${t.title} status`}
                          value={t.status}
                          onChange={(e) => void moveStatus(t, e.target.value as TaskStatus)}
                          options={KANBAN_COLUMNS.map((c) => ({
                            value: c.status,
                            label: `Stage: ${c.label}`,
                          }))}
                        />
                      </div>
                    ))
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Task' : 'New Task'}
        size="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Task Title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              options={[
                { value: '', label: 'None / General' },
                ...projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
            <Select
              label="Priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
                { value: 'urgent', label: 'Urgent' },
              ]}
            />
            <Select
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              options={[
                { value: 'todo', label: 'To Do' },
                { value: 'in_progress', label: 'In Progress' },
                { value: 'review', label: 'Review' },
                { value: 'done', label: 'Done' },
                { value: 'archived', label: 'Archived' },
              ]}
            />
            <Input
              label="Due Date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            <Input
              label="Estimated Hours"
              type="number"
              min="0"
              step="0.5"
              value={estimatedHours}
              onChange={(e) => setEstimatedHours(e.target.value)}
            />
            <Select
              label="Recurring Schedule"
              value={recurrenceRule}
              onChange={(e) => setRecurrenceRule(e.target.value as Task['recurrenceRule'])}
              options={[
                { value: 'none', label: 'One-time' },
                { value: 'daily', label: 'Daily' },
                { value: 'weekly', label: 'Weekly' },
                { value: 'monthly', label: 'Monthly' },
              ]}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Assignee"
              placeholder="e.g. Workspace Owner or collaborator"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            />
            <Input
              label="Tags"
              placeholder="Comma-separated"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
            />
          </div>
          <Textarea
            label="Description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Prerequisite Dependencies (Cycle-Protected)
            </p>
            {depError && (
              <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-xs flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{depError}</span>
              </div>
            )}
            <div className="max-h-28 overflow-y-auto space-y-1 border border-slate-200 dark:border-slate-800 rounded-lg p-2">
              {tasks
                .filter((t) => t.id !== editing?.id)
                .map((candidate) => (
                  <label key={candidate.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dependsOnIds.includes(candidate.id)}
                      onChange={() => toggleDependency(candidate.id)}
                    />
                    <span className="truncate">{candidate.title}</span>
                  </label>
                ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Subtasks</p>
            {subtasks.map((st) => (
              <div key={st.id} className="flex items-center justify-between gap-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={st.done}
                    onChange={() =>
                      setSubtasks((prev) =>
                        prev.map((x) => (x.id === st.id ? { ...x, done: !x.done } : x))
                      )
                    }
                  />
                  <span className={st.done ? 'line-through text-slate-400' : ''}>{st.title}</span>
                </label>
                <button
                  type="button"
                  onClick={() => setSubtasks((prev) => prev.filter((x) => x.id !== st.id))}
                  className="text-slate-400 hover:text-red-600 cursor-pointer"
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                placeholder="Add subtask..."
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
              />
              <Button
                variant="outline"
                onClick={() => {
                  if (!newSubtask.trim()) return;
                  setSubtasks((prev) => [
                    ...prev,
                    { id: createId('st'), title: newSubtask.trim(), done: false },
                  ]);
                  setNewSubtask('');
                }}
              >
                Add
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? 'Save Task' : 'Create Task'}
            </Button>
          </div>
        </form>

        {liveEditing && (
          <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Comments ({(liveEditing.comments ?? []).length})
                </p>
              </div>
              {(liveEditing.comments ?? []).map((cmt) => (
                <div
                  key={cmt.id}
                  className="p-2 rounded-lg bg-slate-50 dark:bg-[#101827] text-xs space-y-0.5"
                >
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{cmt.author}</span>
                    <span className="font-mono tabular-nums">
                      {formatDisplayDate(cmt.createdAt, dateFormat)}
                    </span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{cmt.body}</p>
                </div>
              ))}
              <div className="flex gap-1.5">
                <Input
                  placeholder="Add task comment..."
                  value={newCommentBody}
                  onChange={(e) => setNewCommentBody(e.target.value)}
                  aria-label="Task comment"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!newCommentBody.trim()}
                  onClick={() => void handleAddTaskComment(liveEditing)}
                >
                  Post
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Vault Attachments ({(liveEditing.attachmentVaultIds ?? []).length})
                </p>
              </div>
              {(liveEditing.attachmentVaultIds ?? []).map((fileId) => {
                const file = vaultFiles.find((f) => f.id === fileId);
                return (
                  <div
                    key={fileId}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-[#101827] text-xs"
                  >
                    <span className="truncate font-mono">{file ? file.name : fileId}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Detach file ${file?.name ?? fileId}`}
                      onClick={() => void handleDetachTaskFile(liveEditing, fileId)}
                    >
                      <Trash2 className="w-3 h-3 text-red-600" />
                    </Button>
                  </div>
                );
              })}
              {vaultFiles.length > 0 && (
                <div className="flex gap-1.5">
                  <Select
                    aria-label="Attach vault file to task"
                    value={attachVaultId}
                    onChange={(e) => setAttachVaultId(e.target.value)}
                    options={[
                      { value: '', label: 'Select vault file...' },
                      ...vaultFiles
                        .filter((f) => !(liveEditing.attachmentVaultIds ?? []).includes(f.id))
                        .map((f) => ({ value: f.id, label: f.name })),
                    ]}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!attachVaultId}
                    onClick={() => void handleAttachTaskFile(liveEditing, attachVaultId)}
                  >
                    Attach
                  </Button>
                </div>
              )}
            </div>

            <VoiceNotesPanel
              parentType="task"
              parentId={liveEditing.id}
              parentLabel={liveEditing.title}
            />
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await repositories.deleteTask(deleteTarget.id);
          setDeleteTarget(null);
          await refresh();
          pushToast({ tone: 'info', title: 'Task deleted' });
        }}
        title="Delete Task"
        description={`Permanently delete "${deleteTarget?.title}"?`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
};
