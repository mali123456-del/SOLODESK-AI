import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Edit3,
  FolderKanban,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Tabs,
  Textarea,
  useToast,
  type ColumnDef,
} from '../../components/ui';
import { repositories } from '../../database/repositories/dexieRepositories';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import { formatDisplayDate, isDateOverdue, todayDateStr } from '../../domain/calculations/dates';
import { formatMoney, SUPPORTED_CURRENCIES } from '../../domain/calculations/money';
import {
  createId,
  type Milestone,
  type Priority,
  type Project,
  type ProjectStatus,
} from '../../domain/schemas/entities';

interface ProjectFormState {
  clientId: string;
  name: string;
  description: string;
  status: ProjectStatus;
  priority: Priority;
  startDate: string;
  dueDate: string;
  budget: string;
  agreedValue: string;
  currency: string;
  hourlyRate: string;
  progress: string;
  notes: string;
}

export const ProjectsView: React.FC = () => {
  const { clients, projects, tasks, invoices, financeEntries, timeEntries, settings, refresh } =
    useWorkspace();
  const { pushToast } = useToast();

  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newMilestoneDue, setNewMilestoneDue] = useState('');

  const defaultCurrency = settings?.defaultCurrency ?? 'USD';
  const dateFormat = settings?.dateFormat ?? 'DD MMM YYYY';

  const [form, setForm] = useState<ProjectFormState>({
    clientId: '',
    name: '',
    description: '',
    status: 'active',
    priority: 'medium',
    startDate: todayDateStr(),
    dueDate: '',
    budget: '0',
    agreedValue: '0',
    currency: defaultCurrency,
    hourlyRate: String(settings?.defaultHourlyRate ?? 50),
    progress: '0',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (!q) return true;
      const clientName = clientMap.get(p.clientId)?.name.toLowerCase() ?? '';
      return p.name.toLowerCase().includes(q) || clientName.includes(q);
    });
  }, [projects, statusFilter, search, clientMap]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedId) ?? null,
    [projects, selectedId]
  );

  const openCreate = () => {
    setEditing(null);
    setErrorMsg(null);
    setForm({
      clientId: clients.find((c) => c.status !== 'archived')?.id ?? clients[0]?.id ?? '',
      name: '',
      description: '',
      status: 'active',
      priority: 'medium',
      startDate: todayDateStr(),
      dueDate: '',
      budget: '0',
      agreedValue: '0',
      currency: defaultCurrency,
      hourlyRate: String(settings?.defaultHourlyRate ?? 50),
      progress: '0',
      notes: '',
    });
    setModalOpen(true);
  };

  const openEdit = (p: Project) => {
    setEditing(p);
    setErrorMsg(null);
    setForm({
      clientId: p.clientId,
      name: p.name,
      description: p.description,
      status: p.status,
      priority: p.priority,
      startDate: p.startDate,
      dueDate: p.dueDate,
      budget: String(p.budget),
      agreedValue: String(p.agreedValue),
      currency: p.currency,
      hourlyRate: String(p.hourlyRate),
      progress: String(p.progress),
      notes: p.notes,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clientId) {
      setErrorMsg('Please add or select a client first.');
      return;
    }
    if (!form.name.trim()) {
      setErrorMsg('Project name is required.');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const payload = {
        clientId: form.clientId,
        name: form.name.trim(),
        description: form.description,
        status: form.status,
        priority: form.priority,
        startDate: form.startDate,
        dueDate: form.dueDate,
        budget: Math.max(0, Number(form.budget) || 0),
        agreedValue: Math.max(0, Number(form.agreedValue) || 0),
        currency: form.currency,
        hourlyRate: Math.max(0, Number(form.hourlyRate) || 0),
        progress: Math.min(100, Math.max(0, Number(form.progress) || 0)),
        notes: form.notes,
      };
      if (editing) {
        const updated = await repositories.updateProject(editing.id, payload);
        setSelectedId(updated.id);
        pushToast({ tone: 'success', title: 'Project updated', description: updated.name });
      } else {
        const created = await repositories.createProject({
          ...payload,
          milestones: [],
          isDemo: false,
        });
        setSelectedId(created.id);
        pushToast({ tone: 'success', title: 'Project created', description: created.name });
      }
      await refresh();
      setModalOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save project.');
    } finally {
      setSaving(false);
    }
  };

  const addMilestone = async (project: Project) => {
    if (!newMilestoneTitle.trim()) return;
    const next: Milestone[] = [
      ...project.milestones,
      {
        id: createId('ms'),
        title: newMilestoneTitle.trim(),
        dueDate: newMilestoneDue,
        completed: false,
      },
    ];
    const done = next.filter((m) => m.completed).length;
    const progress = next.length > 0 ? Math.round((done / next.length) * 100) : project.progress;
    await repositories.updateProject(project.id, { milestones: next, progress });
    setNewMilestoneTitle('');
    setNewMilestoneDue('');
    await refresh();
  };

  const toggleMilestone = async (project: Project, msId: string) => {
    const next = project.milestones.map((m) =>
      m.id === msId ? { ...m, completed: !m.completed } : m
    );
    const done = next.filter((m) => m.completed).length;
    const progress = next.length > 0 ? Math.round((done / next.length) * 100) : project.progress;
    await repositories.updateProject(project.id, { milestones: next, progress });
    await refresh();
  };

  const columns: ColumnDef<Project>[] = [
    {
      key: 'name',
      header: 'Project',
      sortValue: (p) => p.name.toLowerCase(),
      render: (p) => (
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{p.name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {clientMap.get(p.clientId)?.name ?? 'Unknown client'}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (p) => p.status,
      render: (p) => (
        <Badge
          tone={
            p.status === 'active'
              ? 'info'
              : p.status === 'completed'
                ? 'success'
                : p.status === 'on_hold'
                  ? 'warning'
                  : 'neutral'
          }
        >
          {p.status.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      key: 'progress',
      header: 'Progress',
      align: 'right',
      sortValue: (p) => p.progress,
      render: (p) => <span className="font-mono text-xs">{p.progress}%</span>,
    },
    {
      key: 'budget',
      header: 'Agreed / Budget',
      align: 'right',
      sortValue: (p) => p.agreedValue || p.budget,
      render: (p) => (
        <span className="font-mono text-xs">
          {formatMoney(p.agreedValue || p.budget, p.currency)}
        </span>
      ),
    },
    {
      key: 'dueDate',
      header: 'Due Date',
      sortValue: (p) => p.dueDate || '9999-12-31',
      render: (p) => {
        const overdue =
          p.status !== 'completed' && p.status !== 'archived' && isDateOverdue(p.dueDate);
        return (
          <span className={`text-xs ${overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-slate-500'}`}>
            {formatDisplayDate(p.dueDate, dateFormat)}
            {overdue ? ' · Overdue' : ''}
          </span>
        );
      },
    },
  ];

  const linkedTasks = selectedProject
    ? tasks.filter((t) => t.projectId === selectedProject.id)
    : [];
  const linkedInvoices = selectedProject
    ? invoices.filter((i) => i.projectId === selectedProject.id)
    : [];
  const linkedExpenses = selectedProject
    ? financeEntries.filter((f) => f.projectId === selectedProject.id && f.type === 'expense')
    : [];
  const linkedTimeSec = selectedProject
    ? timeEntries
        .filter((t) => t.projectId === selectedProject.id)
        .reduce((s, t) => s + t.durationSeconds, 0)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Track client engagements, milestones, budgets, deadlines, and real delivery progress."
        actions={
          <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>
            New Project
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Tabs
          activeId={statusFilter}
          onChange={(id) => setStatusFilter(id as 'all' | ProjectStatus)}
          items={[
            { id: 'all', label: 'All', count: projects.length },
            { id: 'active', label: 'Active', count: projects.filter((p) => p.status === 'active').length },
            { id: 'planning', label: 'Planning', count: projects.filter((p) => p.status === 'planning').length },
            { id: 'completed', label: 'Completed', count: projects.filter((p) => p.status === 'completed').length },
          ]}
        />
        <div className="w-full sm:w-64">
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
            aria-label="Search projects"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className={selectedProject ? 'xl:col-span-2' : 'xl:col-span-3'}>
          <DataTable
            data={filtered}
            columns={columns}
            keyExtractor={(p) => p.id}
            onRowClick={(p) => setSelectedId(p.id)}
            ariaLabel="Projects table"
            emptyState={
              <EmptyState
                icon={<FolderKanban className="w-5 h-5" />}
                title="No projects yet"
                description={
                  clients.length === 0
                    ? 'Add a client first, then create your first project to track milestones, tasks, and time.'
                    : 'Create a project to organize tasks, milestones, and invoices.'
                }
                action={
                  clients.length > 0 ? (
                    <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>
                      Create Project
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        </div>

        {selectedProject && (
          <Card className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">
                  {selectedProject.name}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {clientMap.get(selectedProject.clientId)?.name ?? 'Client'} · Priority:{' '}
                  {selectedProject.priority}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="outline" onClick={() => openEdit(selectedProject)} icon={<Edit3 className="w-3.5 h-3.5" />}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeleteTarget(selectedProject)}
                  aria-label="Delete project"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                </Button>
              </div>
            </div>

            {selectedProject.description && (
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {selectedProject.description}
              </p>
            )}

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-500">Progress</span>
                <span className="font-mono font-semibold">{selectedProject.progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-[#2563EB] transition-all"
                  style={{ width: `${selectedProject.progress}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#101827]">
                <p className="text-slate-500">Agreed Value</p>
                <p className="font-mono font-semibold mt-0.5">
                  {formatMoney(selectedProject.agreedValue, selectedProject.currency)}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#101827]">
                <p className="text-slate-500">Invoiced</p>
                <p className="font-mono font-semibold mt-0.5">
                  {formatMoney(
                    linkedInvoices.reduce((s, i) => s + i.total, 0),
                    selectedProject.currency
                  )}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#101827]">
                <p className="text-slate-500">Expenses</p>
                <p className="font-mono font-semibold mt-0.5">
                  {formatMoney(
                    linkedExpenses.reduce((s, e) => s + e.amount, 0),
                    selectedProject.currency
                  )}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#101827]">
                <p className="text-slate-500">Tasks / Hours</p>
                <p className="font-mono font-semibold mt-0.5">
                  {linkedTasks.length} tasks · {(linkedTimeSec / 3600).toFixed(1)}h
                </p>
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Milestones ({selectedProject.milestones.filter((m) => m.completed).length}/
                {selectedProject.milestones.length})
              </p>
              <ul className="space-y-1.5">
                {selectedProject.milestones.map((ms) => (
                  <li key={ms.id}>
                    <button
                      type="button"
                      onClick={() => void toggleMilestone(selectedProject, ms.id)}
                      className="w-full flex items-center justify-between gap-2 text-left text-xs py-1 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {ms.completed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <Circle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        <span className={ms.completed ? 'line-through text-slate-400 truncate' : 'truncate'}>
                          {ms.title}
                        </span>
                      </span>
                      {ms.dueDate && (
                        <span className="text-slate-400 shrink-0">
                          {formatDisplayDate(ms.dueDate, dateFormat)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-1.5 pt-1">
                <Input
                  placeholder="Add milestone..."
                  value={newMilestoneTitle}
                  onChange={(e) => setNewMilestoneTitle(e.target.value)}
                  aria-label="New milestone title"
                />
                <Input
                  type="date"
                  value={newMilestoneDue}
                  onChange={(e) => setNewMilestoneDue(e.target.value)}
                  className="w-36"
                  aria-label="New milestone due date"
                />
                <Button
                  size="sm"
                  onClick={() => void addMilestone(selectedProject)}
                  disabled={!newMilestoneTitle.trim()}
                >
                  Add
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Create Project'}
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {errorMsg && (
            <div role="alert" className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-xs">
              {errorMsg}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Client"
              required
              value={form.clientId}
              onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
              placeholder="Select a client"
              options={clients.map((c) => ({
                value: c.id,
                label: c.company ? `${c.name} (${c.company})` : c.name,
              }))}
            />
            <Input
              label="Project Name"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Select
              label="Status"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ProjectStatus }))}
              options={[
                { value: 'planning', label: 'Planning' },
                { value: 'active', label: 'Active' },
                { value: 'on_hold', label: 'On Hold' },
                { value: 'completed', label: 'Completed' },
                { value: 'archived', label: 'Archived' },
              ]}
            />
            <Select
              label="Priority"
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
                { value: 'urgent', label: 'Urgent' },
              ]}
            />
            <Input
              label="Start Date"
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            />
            <Input
              label="Due Date"
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
            <Select
              label="Currency"
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              options={SUPPORTED_CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
            />
            <Input
              label="Agreed Value"
              type="number"
              step="0.01"
              min="0"
              value={form.agreedValue}
              onChange={(e) => setForm((f) => ({ ...f, agreedValue: e.target.value }))}
            />
            <Input
              label="Budget"
              type="number"
              step="0.01"
              min="0"
              value={form.budget}
              onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
            />
            <Input
              label="Hourly Rate"
              type="number"
              step="0.01"
              min="0"
              value={form.hourlyRate}
              onChange={(e) => setForm((f) => ({ ...f, hourlyRate: e.target.value }))}
            />
            <Input
              label="Progress (%)"
              type="number"
              min="0"
              max="100"
              value={form.progress}
              onChange={(e) => setForm((f) => ({ ...f, progress: e.target.value }))}
            />
          </div>
          <Textarea
            label="Description"
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? 'Save Project' : 'Create Project'}
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await repositories.deleteProject(deleteTarget.id);
          setSelectedId(null);
          setDeleteTarget(null);
          await refresh();
          pushToast({ tone: 'info', title: 'Project deleted' });
        }}
        title="Delete Project"
        description={`Delete "${deleteTarget?.name}"? Linked tasks and invoices will keep their records without this project link.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
};
