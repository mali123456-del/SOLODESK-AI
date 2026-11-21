import React, { useMemo, useState } from 'react';
import { Clock, Download, Play, Plus, Square, Trash2 } from 'lucide-react';
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
  useToast,
  type ColumnDef,
} from '../../components/ui';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import { repositories } from '../../database/repositories/dexieRepositories';
import {
  calculateTimeAmount,
  formatDisplayDate,
  formatDurationHMS,
  secondsToDecimalHours,
  todayDateStr,
} from '../../domain/calculations/dates';
import { formatMoney } from '../../domain/calculations/money';
import type { TimeEntry } from '../../domain/schemas/entities';
import { buildCsvContent, downloadTextFile } from '../../export/csvUtils';

export const TimeTrackerView: React.FC = () => {
  const {
    timeEntries,
    projects,
    tasks,
    settings,
    runningTimer,
    timerElapsedSeconds,
    backgroundTimerMode,
    startGlobalTimer,
    stopGlobalTimer,
    refresh,
  } = useWorkspace();
  const { pushToast } = useToast();

  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [hourlyRate, setHourlyRate] = useState(String(settings?.defaultHourlyRate ?? 50));
  const [billable, setBillable] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualMinutes, setManualMinutes] = useState('60');
  const [manualDate, setManualDate] = useState(todayDateStr());
  const [deleteTarget, setDeleteTarget] = useState<TimeEntry | null>(null);

  const defaultCurrency = settings?.defaultCurrency ?? 'USD';
  const dateFormat = settings?.dateFormat ?? 'DD MMM YYYY';
  const runningElapsedSeconds = timerElapsedSeconds;

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const handleProjectChange = (nextProjectId: string) => {
    setProjectId(nextProjectId);
    const proj = projectMap.get(nextProjectId);
    if (proj && proj.hourlyRate > 0) {
      setHourlyRate(String(proj.hourlyRate));
    }
  };

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      pushToast({ tone: 'warning', title: 'Enter work description before starting timer.' });
      return;
    }
    try {
      await startGlobalTimer({
        description: description.trim(),
        projectId,
        taskId,
        hourlyRate: Math.max(0, Number(hourlyRate) || 0),
        billable,
      });
      setDescription('');
      pushToast({ tone: 'success', title: 'Global timer started (persists offline & across views)' });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Timer already running',
        description: err instanceof Error ? err.message : 'Stop the active timer first.',
      });
    }
  };

  const handleStop = async () => {
    if (!runningTimer) return;
    await stopGlobalTimer(runningTimer.id);
    pushToast({ tone: 'info', title: 'Timer stopped and logged' });
  };

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const mins = Math.max(1, Number(manualMinutes) || 0);
    if (!description.trim()) return;
    const durationSeconds = Math.round(mins * 60);
    const startIso = new Date(`${manualDate}T09:00:00.000Z`).toISOString();
    const endIso = new Date(Date.parse(startIso) + durationSeconds * 1000).toISOString();
    await repositories.createManualTimeEntry({
      projectId,
      taskId,
      description: description.trim(),
      startTime: startIso,
      endTime: endIso,
      durationSeconds,
      hourlyRate: Math.max(0, Number(hourlyRate) || 0),
      billable,
      isDemo: false,
    });
    setDescription('');
    setManualOpen(false);
    await refresh();
    pushToast({ tone: 'success', title: 'Manual time entry added' });
  };

  const completedEntries = useMemo(
    () => timeEntries.filter((t) => !t.isRunning),
    [timeEntries]
  );

  const totalHours = useMemo(() => {
    const secs = completedEntries.reduce((s, t) => s + t.durationSeconds, 0);
    return secondsToDecimalHours(secs);
  }, [completedEntries]);

  const billableValue = useMemo(
    () =>
      completedEntries
        .filter((t) => t.billable)
        .reduce((s, t) => s + calculateTimeAmount(t.durationSeconds, t.hourlyRate), 0),
    [completedEntries]
  );

  const handleExportCsv = () => {
    const csv = buildCsvContent(
      ['Date', 'Description', 'Project', 'Hours', 'Rate', 'Billable', 'Amount'],
      completedEntries.map((t) => [
        t.startTime.slice(0, 10),
        t.description,
        projectMap.get(t.projectId)?.name ?? '',
        secondsToDecimalHours(t.durationSeconds),
        t.hourlyRate,
        t.billable ? 'Yes' : 'No',
        t.billable ? calculateTimeAmount(t.durationSeconds, t.hourlyRate) : 0,
      ])
    );
    downloadTextFile(`solodesk-timesheet-${todayDateStr()}.csv`, csv);
  };

  const columns: ColumnDef<TimeEntry>[] = [
    {
      key: 'description',
      header: 'Work Log',
      render: (t) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-white">{t.description}</p>
          <p className="text-xs text-slate-500">
            {projectMap.get(t.projectId)?.name ?? 'General'}
            {t.taskId && taskMap.get(t.taskId) ? ` · ${taskMap.get(t.taskId)?.title}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (t) => (
        <span className="text-xs text-slate-500">{formatDisplayDate(t.startTime, dateFormat)}</span>
      ),
    },
    {
      key: 'duration',
      header: 'Duration',
      align: 'right',
      render: (t) => (
        <span className="font-mono text-xs">{formatDurationHMS(t.durationSeconds)}</span>
      ),
    },
    {
      key: 'billable',
      header: 'Amount',
      align: 'right',
      render: (t) =>
        t.billable ? (
          <span className="font-mono text-xs font-semibold">
            {formatMoney(calculateTimeAmount(t.durationSeconds, t.hourlyRate), defaultCurrency)}
          </span>
        ) : (
          <Badge tone="neutral">Non-billable</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (t) => (
        <button
          type="button"
          onClick={() => setDeleteTarget(t)}
          aria-label={`Delete ${t.description}`}
          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Time Tracker"
        description="Persistent stopwatch backed by IndexedDB timestamps plus manual timesheets."
        actions={
          <>
            <Button
              variant="outline"
              onClick={handleExportCsv}
              disabled={completedEntries.length === 0}
              icon={<Download className="w-4 h-4" />}
            >
              Export Timesheet
            </Button>
            <Button
              variant="outline"
              onClick={() => setManualOpen(true)}
              icon={<Plus className="w-4 h-4" />}
            >
              Manual Entry
            </Button>
          </>
        }
      />

      <Card>
        {runningTimer ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-[#2563EB] tracking-wide">
                Active Timer Running ·{' '}
                <span data-testid="background-timer-mode">
                  {backgroundTimerMode === 'web-worker'
                    ? 'Background Web Worker active'
                    : 'Local interval fallback active'}
                </span>
              </p>
              <p className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                {runningTimer.description}
              </p>
              <p className="text-xs text-slate-500">
                {projectMap.get(runningTimer.projectId)?.name ?? 'General'} ·{' '}
                {runningTimer.billable
                  ? `${formatMoney(runningTimer.hourlyRate, defaultCurrency)}/hr`
                  : 'Non-billable'}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span
                data-testid="active-timer-elapsed"
                className="text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white"
              >
                {formatDurationHMS(runningElapsedSeconds)}
              </span>
              <Button variant="danger" onClick={() => void handleStop()} icon={<Square className="w-4 h-4" />}>
                Stop Timer
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleStart} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-4">
              <Input
                label="What are you working on?"
                placeholder="e.g. API integration, homepage polish"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="md:col-span-3">
              <Select
                label="Project"
                value={projectId}
                onChange={(e) => handleProjectChange(e.target.value)}
                options={[
                  { value: '', label: 'General / No Project' },
                  ...projects.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            </div>
            <div className="md:col-span-2">
              <Input
                label="Rate / Hr"
                type="number"
                step="0.01"
                min="0"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
              />
            </div>
            <div className="md:col-span-1 flex items-center h-10">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={billable}
                  onChange={(e) => setBillable(e.target.checked)}
                />
                <span>Billable</span>
              </label>
            </div>
            <div className="md:col-span-2">
              <Button type="submit" className="w-full" icon={<Play className="w-4 h-4" />}>
                Start Timer
              </Button>
            </div>
          </form>
        )}
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <p className="text-xs text-slate-500">Logged Hours</p>
          <p className="text-2xl font-bold font-mono tabular-nums mt-1">{totalHours.toFixed(2)}h</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Billable Value</p>
          <p className="text-2xl font-bold font-mono tabular-nums mt-1 text-emerald-600 dark:text-emerald-400">
            {formatMoney(billableValue, defaultCurrency)}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Entries</p>
          <p className="text-2xl font-bold font-mono tabular-nums mt-1">{completedEntries.length}</p>
        </Card>
      </div>

      <DataTable
        data={completedEntries}
        columns={columns}
        keyExtractor={(t) => t.id}
        ariaLabel="Time entries table"
        emptyState={
          <EmptyState
            icon={<Clock className="w-5 h-5" />}
            title="No time logs yet"
            description="Start the live timer above or add a manual time block."
          />
        }
      />

      <Dialog
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title="Add Manual Time Entry"
        size="md"
      >
        <form onSubmit={handleSaveManual} className="space-y-4">
          <Input
            label="Work Description"
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Project"
              value={projectId}
              onChange={(e) => handleProjectChange(e.target.value)}
              options={[
                { value: '', label: 'General' },
                ...projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
            <Input
              label="Date"
              type="date"
              required
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
            />
            <Input
              label="Duration (Minutes)"
              type="number"
              min="1"
              required
              value={manualMinutes}
              onChange={(e) => setManualMinutes(e.target.value)}
            />
            <Input
              label="Hourly Rate"
              type="number"
              step="0.01"
              min="0"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={billable}
              onChange={(e) => setBillable(e.target.checked)}
            />
            <span>Billable time</span>
          </label>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" onClick={() => setManualOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Entry</Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await repositories.deleteTimeEntry(deleteTarget.id);
          setDeleteTarget(null);
          await refresh();
          pushToast({ tone: 'info', title: 'Time entry deleted' });
        }}
        title="Delete Time Entry"
        description={`Delete "${deleteTarget?.description}"?`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
};
