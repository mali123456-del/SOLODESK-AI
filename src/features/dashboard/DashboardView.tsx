import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckSquare,
  Clock,
  DollarSign,
  FolderKanban,
  Plus,
  Receipt,
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
  EmptyState,
  PageHeader,
  Select,
} from '../../components/ui';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import {
  addDaysToDateStr,
  formatDisplayDate,
  getMonthKey,
  isDateOverdue,
  secondsToDecimalHours,
  todayDateStr,
} from '../../domain/calculations/dates';
import { addMoney, formatMoney, subtractMoney } from '../../domain/calculations/money';
import type { AppRouteId } from '../../types/navigation';

interface DashboardViewProps {
  onNavigate: (route: AppRouteId) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const {
    businessProfile,
    clients,
    projects,
    tasks,
    invoices,
    financeEntries,
    timeEntries,
    activities,
    settings,
    loadDemoWorkspace,
  } = useWorkspace();

  const [range, setRange] = useState<'30d' | '90d' | 'all'>('all');
  const [seeding, setSeeding] = useState(false);

  const currency = settings?.defaultCurrency ?? 'USD';
  const dateFormat = settings?.dateFormat ?? 'DD MMM YYYY';
  const today = todayDateStr();
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

  const isEmptyWorkspace =
    clients.length === 0 &&
    projects.length === 0 &&
    invoices.length === 0 &&
    financeEntries.length === 0;

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
        <Button size="sm" variant="outline" onClick={() => onNavigate('settings-backup')}>
          JSON Backup
        </Button>
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
    </div>
  );
};
