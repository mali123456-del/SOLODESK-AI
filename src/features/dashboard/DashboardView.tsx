import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CalendarClock,
  CheckSquare,
  Clock,
  DollarSign,
  Focus,
  FolderKanban,
  LayoutGrid,
  Pin,
  Plus,
  Receipt,
  Star,
  Target,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Textarea,
  useToast,
} from '../../components/ui';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import { repositories } from '../../database/repositories/dexieRepositories';
import {
  addDaysToDateStr,
  formatDisplayDate,
  getMonthKey,
  isDateOverdue,
  secondsToDecimalHours,
  todayDateStr,
} from '../../domain/calculations/dates';
import { addMoney, formatMoney, subtractMoney } from '../../domain/calculations/money';
import {
  evaluateMonthlyBusinessHealth,
  generateWeeklyDigest,
} from '../../services/businessHealthService';
import { buildDailyDigest, computeProductivityStats } from '../../services/productivityService';
import type { AppRouteId } from '../../types/navigation';
import { DailyTaskGoalCard } from './DailyTaskGoalCard';
import { QuickNotesCard } from './QuickNotesCard';

interface DashboardViewProps {
  onNavigate: (route: AppRouteId) => void;
  onEnterFocusMode?: (target?: { type: 'project' | 'task'; id: string }) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onEnterFocusMode,
}) => {
  const {
    businessProfile,
    clients,
    projects,
    tasks,
    invoices,
    financeEntries,
    timeEntries,
    appointments,
    workspaceGoals,
    activities,
    settings,
    refresh,
    loadDemoWorkspace,
  } = useWorkspace();
  const { pushToast } = useToast();

  const [range, setRange] = useState<'30d' | '90d' | 'all'>('all');
  const [digestMode, setDigestMode] = useState<'daily' | 'weekly'>('daily');
  const [seeding, setSeeding] = useState(false);
  const [widgetsModalOpen, setWidgetsModalOpen] = useState(false);

  const today = todayDateStr(new Date(), settings?.workspaceTimeZone?.trim() || undefined);
  const currentMonthPrefix = today.slice(0, 7);
  const existingMonthGoal = workspaceGoals.find((g) => g.monthPrefix === currentMonthPrefix);

  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [targetRevenue, setTargetRevenue] = useState('5000');
  const [targetBillableHours, setTargetBillableHours] = useState('100');
  const [maxExpenseBudget, setMaxExpenseBudget] = useState('1000');
  const [goalNotes, setGoalNotes] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);

  const currency = settings?.defaultCurrency ?? 'USD';
  const dateFormat = settings?.dateFormat ?? 'DD MMM YYYY';
  const cutoffDate =
    range === '30d'
      ? addDaysToDateStr(today, -30)
      : range === '90d'
        ? addDaysToDateStr(today, -90)
        : '';

  const inRange = (dateStr: string) => {
    if (!cutoffDate) return true;
    const d = dateStr.slice(0, 10);
    return d >= cutoffDate;
  };

  const activeClients = useMemo(
    () => clients.filter((c) => c.status === 'active').length,
    [clients]
  );
  const activeProjects = useMemo(
    () => projects.filter((p) => p.status === 'active' || p.status === 'planning').length,
    [projects]
  );
  const pendingTasks = useMemo(
    () => tasks.filter((t) => t.status !== 'done' && t.status !== 'archived').length,
    [tasks]
  );
  const completedTasks = useMemo(
    () => tasks.filter((t) => t.status === 'done').length,
    [tasks]
  );

  const filteredFinance = useMemo(
    () => financeEntries.filter((f) => inRange(f.date)),
    [financeEntries, cutoffDate]
  );

  const totalIncome = useMemo(
    () => addMoney(...filteredFinance.filter((f) => f.type === 'income').map((f) => f.amount)),
    [filteredFinance]
  );
  const totalExpenses = useMemo(
    () => addMoney(...filteredFinance.filter((f) => f.type === 'expense').map((f) => f.amount)),
    [filteredFinance]
  );
  const netProfit = useMemo(
    () => subtractMoney(totalIncome, totalExpenses),
    [totalIncome, totalExpenses]
  );

  const outstandingInvoices = useMemo(
    () => invoices.filter((i) => i.status !== 'cancelled' && i.balanceDue > 0),
    [invoices]
  );
  const outstandingTotal = useMemo(
    () => addMoney(...outstandingInvoices.map((i) => i.balanceDue)),
    [outstandingInvoices]
  );
  const overdueInvoices = useMemo(
    () =>
      outstandingInvoices.filter(
        (i) => i.status === 'overdue' || isDateOverdue(i.dueDate, today)
      ),
    [outstandingInvoices, today]
  );

  const totalHours = useMemo(() => {
    const secs = timeEntries
      .filter((t) => !t.isRunning && inRange(t.startTime))
      .reduce((s, t) => s + t.durationSeconds, 0);
    return secondsToDecimalHours(secs);
  }, [timeEntries, cutoffDate]);

  const monthlySeries = useMemo(() => {
    const map = new Map<string, { month: string; income: number; expenses: number }>();
    for (const entry of filteredFinance) {
      const m = getMonthKey(entry.date);
      const cur = map.get(m) ?? { month: m, income: 0, expenses: 0 };
      if (entry.type === 'income') cur.income = addMoney(cur.income, entry.amount);
      else cur.expenses = addMoney(cur.expenses, entry.amount);
      map.set(m, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6);
  }, [filteredFinance]);

  const businessHealth = useMemo(
    () =>
      evaluateMonthlyBusinessHealth({
        monthPrefix: currentMonthPrefix,
        goals: workspaceGoals,
        financeEntries,
        timeEntries,
        invoices,
        tasks,
        today,
      }),
    [currentMonthPrefix, workspaceGoals, financeEntries, timeEntries, invoices, tasks, today]
  );

  const myDayTasks = useMemo(
    () =>
      tasks
        .filter(
          (t) =>
            t.status !== 'done' &&
            t.status !== 'archived' &&
            (t.dueDate === today || (t.dueDate !== '' && t.dueDate < today) || t.priority === 'urgent')
        )
        .slice(0, 4),
    [tasks, today]
  );

  const myDayAppointments = useMemo(
    () =>
      appointments
        .filter((a) => a.status === 'scheduled' && a.date >= today)
        .slice(0, 3),
    [appointments, today]
  );

  const upcomingDeadlines = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      kind: 'Project' | 'Task' | 'Invoice';
      dueDate: string;
      overdue: boolean;
      route: AppRouteId;
    }> = [];

    projects
      .filter((p) => p.status !== 'completed' && p.status !== 'archived' && p.dueDate)
      .forEach((p) =>
        items.push({
          id: p.id,
          title: p.name,
          kind: 'Project',
          dueDate: p.dueDate,
          overdue: isDateOverdue(p.dueDate, today),
          route: 'projects',
        })
      );
    tasks
      .filter((t) => t.status !== 'done' && t.status !== 'archived' && t.dueDate)
      .forEach((t) =>
        items.push({
          id: t.id,
          title: t.title,
          kind: 'Task',
          dueDate: t.dueDate,
          overdue: isDateOverdue(t.dueDate, today),
          route: 'tasks',
        })
      );
    outstandingInvoices.forEach((i) =>
      items.push({
        id: i.id,
        title: `Invoice ${i.number}`,
        kind: 'Invoice',
        dueDate: i.dueDate,
        overdue: isDateOverdue(i.dueDate, today),
        route: 'invoices',
      })
    );
    return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6);
  }, [projects, tasks, outstandingInvoices, today]);

  const dailyDigest = useMemo(
    () =>
      buildDailyDigest({
        clients,
        projects,
        tasks,
        invoices,
        appointments,
        businessName: businessProfile?.businessName,
        today,
      }),
    [clients, projects, tasks, invoices, appointments, businessProfile?.businessName, today]
  );

  const weeklyDigest = useMemo(
    () =>
      generateWeeklyDigest({
        projects,
        tasks,
        invoices,
        financeEntries,
        timeEntries,
        today,
      }),
    [projects, tasks, invoices, financeEntries, timeEntries, today]
  );

  const productivityStats = useMemo(
    () =>
      computeProductivityStats({
        tasks,
        timeEntries,
        today,
      }),
    [tasks, timeEntries, today]
  );

  const widgetVisible = (id: string) => {
    const found = settings?.dashboardWidgets?.find((w) => w.id === id);
    return found ? found.visible : true;
  };

  const toggleWidget = async (id: string) => {
    const defaults = [
      { id: 'digest', visible: true, order: 0 },
      { id: 'daily-goal', visible: true, order: 1 },
      { id: 'quick-notes', visible: true, order: 2 },
      { id: 'kpis', visible: true, order: 3 },
      { id: 'stats', visible: true, order: 4 },
      { id: 'pinned', visible: true, order: 5 },
      { id: 'goals', visible: true, order: 6 },
      { id: 'cashflow', visible: true, order: 7 },
    ];
    const current = settings?.dashboardWidgets?.length ? settings.dashboardWidgets : defaults;
    const exists = current.some((w) => w.id === id);
    const next = exists
      ? current.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w))
      : [...current, { id, visible: false, order: current.length }];
    await repositories.saveSettings({ dashboardWidgets: next });
    await refresh();
  };

  const pinnedProjects = useMemo(
    () => projects.filter((p) => (settings?.pinnedIds ?? []).includes(p.id) || (settings?.favoriteIds ?? []).includes(p.id)),
    [projects, settings?.pinnedIds, settings?.favoriteIds]
  );

  const isEmptyWorkspace =
    clients.length === 0 &&
    projects.length === 0 &&
    invoices.length === 0 &&
    financeEntries.length === 0;

  const openGoalEditor = () => {
    setTargetRevenue(String(existingMonthGoal?.targetRevenue ?? 5000));
    setTargetBillableHours(String(existingMonthGoal?.targetBillableHours ?? 100));
    setMaxExpenseBudget(String(existingMonthGoal?.maxExpenseBudget ?? 1000));
    setGoalNotes(existingMonthGoal?.notes ?? '');
    setGoalModalOpen(true);
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGoal(true);
    try {
      await repositories.saveWorkspaceGoal({
        id: existingMonthGoal?.id,
        monthPrefix: currentMonthPrefix,
        currency,
        targetRevenue: Math.max(0, Number(targetRevenue) || 0),
        targetBillableHours: Math.max(0, Number(targetBillableHours) || 0),
        maxExpenseBudget: Math.max(0, Number(maxExpenseBudget) || 0),
        notes: goalNotes.trim(),
      });
      await refresh();
      setGoalModalOpen(false);
      pushToast({
        tone: 'success',
        title: 'Monthly goal saved',
        description: `Targets updated for ${currentMonthPrefix}.`,
      });
    } finally {
      setSavingGoal(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome${businessProfile?.ownerName ? `, ${businessProfile.ownerName}` : ''}`}
        description="Live workspace metrics calculated directly from your local IndexedDB records."
        actions={
          <>
            <div className="w-40">
              <Select
                aria-label="Dashboard date range"
                value={range}
                onChange={(e) => setRange(e.target.value as typeof range)}
                options={[
                  { value: 'all', label: 'All Time' },
                  { value: '90d', label: 'Last 90 Days' },
                  { value: '30d', label: 'Last 30 Days' },
                ]}
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setWidgetsModalOpen(true)}
              icon={<LayoutGrid className="w-4 h-4" />}
            >
              Widgets
            </Button>
            {onEnterFocusMode && (
              <Button
                variant="outline"
                onClick={() => onEnterFocusMode()}
                icon={<Focus className="w-4 h-4" />}
              >
                Focus Mode
              </Button>
            )}
            <Button onClick={() => onNavigate('invoices')} icon={<Plus className="w-4 h-4" />}>
              New Invoice
            </Button>
          </>
        }
      />

      {isEmptyWorkspace && (
        <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Your workspace is clean and ready
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Add your first client or load sample [Demo] records to explore proposals, quotations,
              invoices, time tracking, and reports immediately.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" onClick={() => onNavigate('clients')}>
              Add Client
            </Button>
            <Button
              loading={seeding}
              onClick={async () => {
                setSeeding(true);
                try {
                  await loadDemoWorkspace();
                } finally {
                  setSeeding(false);
                }
              }}
            >
              Load Sample Demo Data
            </Button>
          </div>
        </Card>
      )}

      {/* Daily & Weekly Digest Component */}
      {widgetVisible('digest') && (
        <Card aria-label="Daily Digest">
          <CardHeader
            title={
              digestMode === 'daily'
                ? `Daily Digest · ${formatDisplayDate(dailyDigest.date, dateFormat)}`
                : `Weekly Digest · ${formatDisplayDate(weeklyDigest.windowStart, dateFormat)} – ${formatDisplayDate(weeklyDigest.windowEnd, dateFormat)}`
            }
            description={
              digestMode === 'daily'
                ? `${dailyDigest.totalActionItems} live action item(s) across deadlines, pending invoices, milestones, and calls today.`
                : `${weeklyDigest.topFocusItems[0]} (${weeklyDigest.dataSource})`
            }
            action={
              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setDigestMode('daily')}
                    className={`px-2.5 py-1 rounded-md cursor-pointer ${
                      digestMode === 'daily'
                        ? 'bg-blue-600 text-white font-medium'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Daily
                  </button>
                  <button
                    type="button"
                    onClick={() => setDigestMode('weekly')}
                    className={`px-2.5 py-1 rounded-md cursor-pointer ${
                      digestMode === 'weekly'
                        ? 'bg-blue-600 text-white font-medium'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Weekly
                  </button>
                </div>
                {onEnterFocusMode && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() =>
                      onEnterFocusMode(
                        dailyDigest.highPriorityTasks[0]
                          ? { type: 'task', id: dailyDigest.highPriorityTasks[0].id }
                          : undefined
                      )
                    }
                  >
                    <Focus className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                    Focus Top Priority
                  </Button>
                )}
              </div>
            }
          />
          {digestMode === 'daily' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <button
                type="button"
                onClick={() => onNavigate('tasks')}
                className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-[#101827] text-left cursor-pointer"
              >
                <p className="text-slate-500">Due Today / Overdue Tasks</p>
                <p className="text-lg font-bold font-mono tabular-nums mt-1">
                  {dailyDigest.dueTodayTasks.length} today · {dailyDigest.overdueTasks.length} overdue
                </p>
                <p className="text-slate-500 mt-1 truncate">
                  {dailyDigest.highPriorityTasks.length} high/urgent priority open
                </p>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('invoices')}
                className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-[#101827] text-left cursor-pointer"
              >
                <p className="text-slate-500">Pending & Overdue Invoices</p>
                <p className="text-lg font-bold font-mono tabular-nums mt-1">
                  {formatMoney(dailyDigest.pendingInvoiceTotal, currency)}
                </p>
                <p className="text-slate-500 mt-1">
                  {dailyDigest.pendingInvoices.length} open ({dailyDigest.overdueInvoiceCount} overdue)
                </p>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('projects')}
                className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-[#101827] text-left cursor-pointer"
              >
                <p className="text-slate-500">Milestones (Next 7 Days)</p>
                <p className="text-lg font-bold font-mono tabular-nums mt-1">
                  {dailyDigest.upcomingMilestones.length} milestone(s)
                </p>
                <p className="text-slate-500 mt-1 truncate">
                  {dailyDigest.upcomingMilestones[0]
                    ? dailyDigest.upcomingMilestones[0].title
                    : 'No milestones due soon'}
                </p>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('communication')}
                className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-[#101827] text-left cursor-pointer"
              >
                <p className="text-slate-500">Today&apos;s Calls & Follow-Ups</p>
                <p className="text-lg font-bold font-mono tabular-nums mt-1">
                  {dailyDigest.todaysAppointments.length} calls · {dailyDigest.outstandingFollowUps.length} follow-ups
                </p>
                <p className="text-slate-500 mt-1 truncate">
                  {dailyDigest.todaysAppointments[0]
                    ? `${dailyDigest.todaysAppointments[0].startTime} ${dailyDigest.todaysAppointments[0].title}`
                    : 'Check outreach follow-up queue'}
                </p>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <p className="text-slate-500">7-Day Income / Net</p>
                <p className="text-lg font-bold font-mono tabular-nums mt-1 text-emerald-600">
                  {formatMoney(weeklyDigest.incomeLast7Days, currency)}
                </p>
                <p className="text-slate-500 mt-1 font-mono tabular-nums">
                  Net: {formatMoney(weeklyDigest.netLast7Days, currency)}
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <p className="text-slate-500">7-Day Delivery</p>
                <p className="text-lg font-bold font-mono tabular-nums mt-1">
                  {weeklyDigest.completedTasksLast7Days} tasks · {weeklyDigest.billableHoursLast7Days}h
                </p>
                <p className="text-slate-500 mt-1">Billable hours logged</p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <p className="text-slate-500">Next 7 Days Queue</p>
                <p className="text-lg font-bold font-mono tabular-nums mt-1">
                  {weeklyDigest.openTasksDueNext7Days} due · {weeklyDigest.overdueTaskCount} overdue
                </p>
                <p className="text-slate-500 mt-1">Open task obligations</p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <p className="text-slate-500">Open Receivables</p>
                <p className="text-lg font-bold font-mono tabular-nums mt-1">
                  {formatMoney(weeklyDigest.openReceivablesTotal, currency)}
                </p>
                <p className="text-slate-500 mt-1">{weeklyDigest.overdueInvoiceCount} overdue invoice(s)</p>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">Recorded Income</p>
            <DollarSign className="w-4 h-4 text-emerald-600" aria-hidden="true" />
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums mt-2 text-slate-900 dark:text-white">
            {formatMoney(totalIncome, currency)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Expenses: <span className="font-mono">{formatMoney(totalExpenses, currency)}</span>
          </p>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">Estimated Net Profit</p>
            <Receipt className="w-4 h-4 text-[#2563EB]" aria-hidden="true" />
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums mt-2 text-slate-900 dark:text-white">
            {formatMoney(netProfit, currency)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Outstanding: <span className="font-mono">{formatMoney(outstandingTotal, currency)}</span>
          </p>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">Active Clients & Projects</p>
            <FolderKanban className="w-4 h-4 text-[#20C7D9]" aria-hidden="true" />
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums mt-2 text-slate-900 dark:text-white">
            {activeClients} / {activeProjects}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Total clients: {clients.length} · Overdue invoices: {overdueInvoices.length}
          </p>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">Tasks & Hours Tracked</p>
            <Clock className="w-4 h-4 text-amber-600" aria-hidden="true" />
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums mt-2 text-slate-900 dark:text-white">
            {pendingTasks} open · {totalHours.toFixed(1)}h
          </p>
          <p className="text-xs text-slate-500 mt-1">{completedTasks} tasks completed</p>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onNavigate('clients')} icon={<Users className="w-3.5 h-3.5" />}>
          Manage Clients
        </Button>
        <Button size="sm" variant="outline" onClick={() => onNavigate('quotations')} icon={<Plus className="w-3.5 h-3.5" />}>
          Create Quotation
        </Button>
        <Button size="sm" variant="outline" onClick={() => onNavigate('time-tracker')} icon={<Clock className="w-3.5 h-3.5" />}>
          Open Timer
        </Button>
        <Button size="sm" variant="outline" onClick={() => onNavigate('tasks')} icon={<CheckSquare className="w-3.5 h-3.5" />}>
          Task Board
        </Button>
        <Button size="sm" variant="outline" onClick={() => onNavigate('communication')} icon={<Calendar className="w-3.5 h-3.5" />}>
          Schedule & Follow-Ups
        </Button>
        <Button size="sm" variant="outline" onClick={() => onNavigate('settings-backup')}>
          JSON Backup
        </Button>
      </div>

      {/* Daily Task Completion Goal & Quick Notes Scratchpad */}
      {(widgetVisible('daily-goal') || widgetVisible('quick-notes')) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {widgetVisible('daily-goal') && (
            <DailyTaskGoalCard onOpenTasks={() => onNavigate('tasks')} referenceDate={today} />
          )}
          {widgetVisible('quick-notes') && <QuickNotesCard />}
        </div>
      )}

      {/* My Day & Monthly Goals / Business Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader
            title="My Day — Priority Focus"
            description={`Open urgent/due tasks and upcoming meetings for ${formatDisplayDate(today, dateFormat)}.`}
            action={
              <Button size="sm" variant="ghost" onClick={() => onNavigate('communication')}>
                Schedule <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            }
          />
          {myDayTasks.length === 0 && myDayAppointments.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">
              No overdue/urgent tasks or upcoming calls scheduled right now.
            </p>
          ) : (
            <div className="space-y-3 text-xs">
              {myDayTasks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onNavigate('tasks')}
                  className="w-full flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-left cursor-pointer"
                >
                  <span className="font-medium text-slate-900 dark:text-white truncate">
                    Task: {t.title}
                  </span>
                  <Badge tone={t.dueDate && t.dueDate < today ? 'danger' : 'warning'}>
                    {t.dueDate ? formatDisplayDate(t.dueDate, dateFormat) : t.priority}
                  </Badge>
                </button>
              ))}
              {myDayAppointments.map((apt) => (
                <button
                  key={apt.id}
                  type="button"
                  onClick={() => onNavigate('communication')}
                  className="w-full flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-left cursor-pointer"
                >
                  <span className="font-medium text-slate-900 dark:text-white truncate">
                    Call: {apt.title}
                  </span>
                  <span className="font-mono text-slate-500 shrink-0">
                    {formatDisplayDate(apt.date, dateFormat)} · {apt.startTime}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title={`Monthly Goals & Health (${currentMonthPrefix})`}
            description="Informational progress calculated from this month's local transactions and time entries."
            action={
              <Button size="sm" variant="outline" onClick={openGoalEditor} icon={<Target className="w-3.5 h-3.5" />}>
                {existingMonthGoal ? 'Edit Goal' : 'Set Monthly Goal'}
              </Button>
            }
          />
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">
                Revenue vs Goal ({formatMoney(businessHealth.revenueThisMonth, currency)} /{' '}
                {businessHealth.targetRevenue > 0
                  ? formatMoney(businessHealth.targetRevenue, currency)
                  : 'Not set'}
                )
              </span>
              <span className="font-mono font-semibold tabular-nums">
                {businessHealth.revenueProgressPercent}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-[#2563EB] rounded-full transition-all"
                style={{ width: `${businessHealth.revenueProgressPercent}%` }}
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-slate-600 dark:text-slate-300">
                Billable Hours ({businessHealth.billableHoursThisMonth}h /{' '}
                {businessHealth.targetBillableHours > 0 ? `${businessHealth.targetBillableHours}h` : 'Not set'})
              </span>
              <span className="font-mono font-semibold tabular-nums">
                {businessHealth.hoursProgressPercent}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-[#20C7D9] rounded-full transition-all"
                style={{ width: `${businessHealth.hoursProgressPercent}%` }}
              />
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <span className="text-slate-500">
                {businessHealth.notes[0]}
              </span>
              <Badge
                tone={
                  businessHealth.healthStatus === 'strong'
                    ? 'success'
                    : businessHealth.healthStatus === 'watch'
                      ? 'warning'
                      : 'danger'
                }
              >
                {businessHealth.healthStatus === 'strong'
                  ? 'On Track'
                  : businessHealth.healthStatus === 'watch'
                    ? 'Watch'
                    : 'Needs Attention'}
              </Badge>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Monthly Cashflow (Informational)"
            description="Income vs. expenses aggregated from recorded transactions."
            action={
              <Button size="sm" variant="ghost" onClick={() => onNavigate('reports')}>
                Full Reports <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            }
          />
          {monthlySeries.length === 0 ? (
            <EmptyState
              icon={<DollarSign className="w-5 h-5" />}
              title="No cashflow history yet"
              description="Record invoice payments, income, or expenses to visualize monthly cashflow."
            />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <RechartsTooltip />
                  <Bar dataKey="income" name="Income" fill="#2563EB" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#20C7D9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Upcoming & Overdue Deadlines"
            description="Projects, tasks, and open invoices."
          />
          {upcomingDeadlines.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              <CalendarClock className="w-6 h-6 mx-auto mb-2 text-slate-400" aria-hidden="true" />
              No upcoming deadlines scheduled.
            </div>
          ) : (
            <ul className="space-y-2.5">
              {upcomingDeadlines.map((item) => (
                <li key={`${item.kind}_${item.id}`}>
                  <button
                    type="button"
                    onClick={() => onNavigate(item.route)}
                    className="w-full flex items-center justify-between gap-2 text-left p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {item.title}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {item.kind} · {formatDisplayDate(item.dueDate, dateFormat)}
                      </p>
                    </div>
                    {item.overdue && (
                      <Badge tone="danger">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Overdue
                      </Badge>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Recent Workspace Activity"
          action={
            <Button size="sm" variant="ghost" onClick={() => onNavigate('activity')}>
              View All <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          }
        />
        {activities.length === 0 ? (
          <p className="text-xs text-slate-500">No workspace activity logged yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {activities.slice(0, 6).map((act) => (
              <li key={act.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                <span className="text-slate-700 dark:text-slate-200 truncate">{act.summary}</span>
                <span className="text-slate-400 shrink-0">
                  {formatDisplayDate(act.createdAt, dateFormat)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Productivity Statistics & Pinned / Recently Viewed */}
      {(widgetVisible('stats') || widgetVisible('pinned')) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {widgetVisible('stats') && (
            <Card>
              <CardHeader
                title="Productivity Statistics"
                description="Calculated from completed tasks and time entries."
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="text-slate-500">Done (7d / 30d)</p>
                  <p className="text-base font-bold font-mono tabular-nums mt-1">
                    {productivityStats.tasksCompletedLast7Days} / {productivityStats.tasksCompletedLast30Days}
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="text-slate-500">Hours (7d / 30d)</p>
                  <p className="text-base font-bold font-mono tabular-nums mt-1">
                    {productivityStats.hoursLoggedLast7Days}h / {productivityStats.hoursLoggedLast30Days}h
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="text-slate-500">Billable Share</p>
                  <p className="text-base font-bold font-mono tabular-nums mt-1">
                    {productivityStats.billableSharePercent}%
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="text-slate-500">On-Time Rate</p>
                  <p className="text-base font-bold font-mono tabular-nums mt-1">
                    {productivityStats.onTimeCompletionPercent}%
                  </p>
                </div>
              </div>
            </Card>
          )}

          {widgetVisible('pinned') && (
            <Card>
              <CardHeader
                title="Pinned & Recently Viewed"
                description="Quick jump to starred projects and recent workspace items."
              />
              {pinnedProjects.length === 0 && (settings?.recentItems ?? []).length === 0 ? (
                <p className="text-xs text-slate-500 py-3">
                  Pin or favorite any project in Projects to keep it surfaced here.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {pinnedProjects.map((p) => (
                    <Button
                      key={p.id}
                      size="sm"
                      variant="outline"
                      onClick={() => onNavigate('projects')}
                    >
                      <Pin className="w-3 h-3 mr-1 text-[#2563EB]" />
                      {p.name}
                    </Button>
                  ))}
                  {(settings?.recentItems ?? []).slice(0, 4).map((r) => (
                    <Button
                      key={r.id}
                      size="sm"
                      variant="ghost"
                      onClick={() => onNavigate(r.route as AppRouteId)}
                    >
                      <Star className="w-3 h-3 mr-1 text-amber-500" />
                      {r.label}
                    </Button>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      <Dialog
        open={goalModalOpen}
        onClose={() => setGoalModalOpen(false)}
        title={`Monthly Business Goal (${currentMonthPrefix})`}
        size="md"
      >
        <form onSubmit={handleSaveGoal} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label={`Target Revenue (${currency})`}
              type="number"
              min="0"
              step="50"
              value={targetRevenue}
              onChange={(e) => setTargetRevenue(e.target.value)}
            />
            <Input
              label="Billable Hours Target"
              type="number"
              min="0"
              step="1"
              value={targetBillableHours}
              onChange={(e) => setTargetBillableHours(e.target.value)}
            />
            <Input
              label={`Expense Ceiling (${currency})`}
              type="number"
              min="0"
              step="50"
              value={maxExpenseBudget}
              onChange={(e) => setMaxExpenseBudget(e.target.value)}
            />
          </div>
          <Textarea
            label="Focus Notes"
            rows={2}
            value={goalNotes}
            onChange={(e) => setGoalNotes(e.target.value)}
            placeholder="Key deliverables or client acquisition targets this month..."
          />
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" onClick={() => setGoalModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={savingGoal}>
              Save Goal
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={widgetsModalOpen}
        onClose={() => setWidgetsModalOpen(false)}
        title="Customize Dashboard Widgets"
        description="Toggle which dashboard cards appear in your workspace overview."
        size="sm"
      >
        <div className="space-y-2.5 text-sm">
          {[
            { id: 'digest', label: 'Daily Digest Card' },
            { id: 'daily-goal', label: 'Daily Task Completion Goal' },
            { id: 'quick-notes', label: 'Quick Notes Scratchpad' },
            { id: 'stats', label: 'Productivity Statistics' },
            { id: 'pinned', label: 'Pinned & Recently Viewed' },
          ].map((item) => (
            <label
              key={item.id}
              className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer"
            >
              <span>{item.label}</span>
              <input
                type="checkbox"
                checked={widgetVisible(item.id)}
                onChange={() => void toggleWidget(item.id)}
              />
            </label>
          ))}
        </div>
      </Dialog>
    </div>
  );
};

