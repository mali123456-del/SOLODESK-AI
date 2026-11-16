import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  CheckSquare,
  Circle,
  Columns3,
  List,
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
import { formatDisplayDate, isDateOverdue } from '../../domain/calculations/dates';
import {
  createId,
  type Priority,
  type Subtask,
  type Task,
  type TaskStatus,
} from '../../domain/schemas/entities';

const KANBAN_COLUMNS: Array<{ status: TaskStatus; label: string }> = [
  { status: 'todo', label: 'To Do' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'review', label: 'In Review' },
  { status: 'done', label: 'Done' },
];

export const TasksView: React.FC = () => {
  const { tasks, projects, clients, settings, refresh } = useWorkspace();
  const { pushToast } = useToast();

  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [statusFilter, setStatusFilter] = useState<'active' | 'done' | 'archived' | 'all'>('active');
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
  const [tagsText, setTagsText] = useState('');
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [saving, setSaving] = useState(false);

  const dateFormat = settings?.dateFormat ?? 'DD MMM YYYY';
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
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
  }, [tasks, statusFilter, search, projectMap]);

  const openCreate = () => {
    setEditing(null);
    setTitle('');
    setDescription('');
    setProjectId(projects[0]?.id ?? '');
    setPriority('medium');
    setStatus('todo');
    setDueDate('');
    setTagsText('');
    setSubtasks([]);
    setNewSubtask('');
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
    setTagsText(t.tags.join(', '));
    setSubtasks(t.subtasks);
    setNewSubtask('');
    setModalOpen(true);
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

      if (editing) {
        await repositories.updateTask(editing.id, {
          title: title.trim(),
          description,
          projectId,
          clientId: linkedProject?.clientId ?? '',
          priority,
          status,
          dueDate,
          tags,
          subtasks,
        });
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
          tags,
          subtasks,
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

  const quickToggleDone = async (task: Task) => {
    await repositories.updateTask(task.id, {
      status: task.status === 'done' ? 'todo' : 'done',
    });
    await refresh();
  };

  const moveStatus = async (task: Task, nextStatus: TaskStatus) => {
    await repositories.updateTask(task.id, { status: nextStatus });
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
                      {task.subtasks.length > 0 &&
                        ` · ${task.subtasks.filter((s) => s.done).length}/${task.subtasks.length} subtasks`}
                      {task.tags.length > 0 && ` · ${task.tags.join(', ')}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 pl-8 sm:pl-0">
                  <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge>
                  <span
                    className={`text-xs ${
                      overdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-500'
                    }`}
                  >
                    {task.dueDate ? formatDisplayDate(task.dueDate, dateFormat) : 'No due date'}
                    {overdue ? ' · Overdue' : ''}
                  </span>
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
          </div>
          <Input
            label="Tags"
            placeholder="Comma-separated"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
          />
          <Textarea
            label="Description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

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
