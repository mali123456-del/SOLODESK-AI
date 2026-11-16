import Big from 'big.js';
import { secondsToDecimalHours, todayDateStr } from '../domain/calculations/dates';
import { addMoney, subtractMoney } from '../domain/calculations/money';
import type {
  FinanceEntry,
  Invoice,
  Project,
  Task,
  TimeEntry,
  WorkspaceGoal,
} from '../domain/schemas/entities';

export type AgingBucketKey = 'current' | '1_30' | '31_60' | '61_plus';

export interface InvoiceAgingBucket {
  key: AgingBucketKey;
  label: string;
  count: number;
  totalBalance: number;
  invoices: Array<{
    id: string;
    number: string;
    clientId: string;
    dueDate: string;
    daysPastDue: number;
    balanceDue: number;
    currency: string;
  }>;
}

export interface InvoiceAgingReport {
  referenceDate: string;
  openInvoiceCount: number;
  totalOpenBalance: number;
  buckets: InvoiceAgingBucket[];
}

export interface ProjectEstimateVsActual {
  projectId: string;
  projectName: string;
  clientId: string;
  status: Project['status'];
  currency: string;
  budget: number;
  hourlyRate: number;
  estimatedHours: number;
  actualHours: number;
  billableHours: number;
  hourVariance: number;
  trackedBillableValue: number;
  budgetRemainingVsTracked: number;
  recordedIncome: number;
  recordedExpenses: number;
  overBudgetHours: boolean;
}

export interface MonthlyBusinessHealth {
  monthPrefix: string;
  revenueThisMonth: number;
  expensesThisMonth: number;
  netThisMonth: number;
  billableHoursThisMonth: number;
  targetRevenue: number;
  targetBillableHours: number;
  maxExpenseBudget: number;
  revenueProgressPercent: number;
  hoursProgressPercent: number;
  overdueInvoiceCount: number;
  overdueTaskCount: number;
  healthScore: number;
  healthStatus: 'strong' | 'watch' | 'needs_attention';
  notes: string[];
}

function diffDays(laterDateStr: string, earlierDateStr: string): number {
  const laterMs = Date.parse(`${laterDateStr}T00:00:00Z`);
  const earlierMs = Date.parse(`${earlierDateStr}T00:00:00Z`);
  if (!Number.isFinite(laterMs) || !Number.isFinite(earlierMs)) return 0;
  return Math.floor((laterMs - earlierMs) / 86_400_000);
}

export function calculateInvoiceAging(
  invoices: Invoice[],
  referenceDate = todayDateStr()
): InvoiceAgingReport {
  const openInvoices = invoices.filter(
    (inv) => inv.status !== 'cancelled' && inv.status !== 'paid' && inv.balanceDue > 0
  );

  const bucketsMap: Record<AgingBucketKey, InvoiceAgingBucket> = {
    current: { key: 'current', label: 'Current (Not Yet Due)', count: 0, totalBalance: 0, invoices: [] },
    '1_30': { key: '1_30', label: '1–30 Days Past Due', count: 0, totalBalance: 0, invoices: [] },
    '31_60': { key: '31_60', label: '31–60 Days Past Due', count: 0, totalBalance: 0, invoices: [] },
    '61_plus': { key: '61_plus', label: '61+ Days Past Due', count: 0, totalBalance: 0, invoices: [] },
  };

  for (const inv of openInvoices) {
    const pastDue = diffDays(referenceDate, inv.dueDate);
    let key: AgingBucketKey = 'current';
    if (pastDue > 60) key = '61_plus';
    else if (pastDue > 30) key = '31_60';
    else if (pastDue >= 1) key = '1_30';

    const bucket = bucketsMap[key];
    bucket.count += 1;
    bucket.totalBalance = addMoney(bucket.totalBalance, inv.balanceDue);
    bucket.invoices.push({
      id: inv.id,
      number: inv.number,
      clientId: inv.clientId,
      dueDate: inv.dueDate,
      daysPastDue: Math.max(0, pastDue),
      balanceDue: inv.balanceDue,
      currency: inv.currency,
    });
  }

  const buckets = [bucketsMap.current, bucketsMap['1_30'], bucketsMap['31_60'], bucketsMap['61_plus']];
  const totalOpenBalance = addMoney(...openInvoices.map((i) => i.balanceDue));

  return {
    referenceDate,
    openInvoiceCount: openInvoices.length,
    totalOpenBalance,
    buckets,
  };
}

export function calculateEstimatesVsActuals(
  projects: Project[],
  timeEntries: TimeEntry[],
  financeEntries: FinanceEntry[]
): ProjectEstimateVsActual[] {
  return projects
    .filter((p) => p.status !== 'archived')
    .map((prj) => {
      const prjTime = timeEntries.filter((t) => t.projectId === prj.id);
      const totalSeconds = prjTime.reduce((sum, t) => sum + t.durationSeconds, 0);
      const billableSeconds = prjTime
        .filter((t) => t.billable)
        .reduce((sum, t) => sum + t.durationSeconds, 0);

      const actualHours = Number(secondsToDecimalHours(totalSeconds).toFixed(2));
      const billableHours = Number(secondsToDecimalHours(billableSeconds).toFixed(2));
      const estimatedHours =
        prj.hourlyRate > 0 && prj.budget > 0
          ? Number(new Big(prj.budget).div(prj.hourlyRate).toFixed(2))
          : 0;

      const trackedBillableValue = Number(
        prjTime
          .filter((t) => t.billable)
          .reduce((acc, t) => {
            const hrs = secondsToDecimalHours(t.durationSeconds);
            const rate = t.hourlyRate > 0 ? t.hourlyRate : prj.hourlyRate;
            return acc.plus(new Big(hrs).times(rate));
          }, new Big(0))
          .toFixed(2)
      );

      const prjFin = financeEntries.filter((f) => f.projectId === prj.id);
      const recordedIncome = addMoney(
        ...prjFin.filter((f) => f.type === 'income').map((f) => f.amount)
      );
      const recordedExpenses = addMoney(
        ...prjFin.filter((f) => f.type === 'expense').map((f) => f.amount)
      );

      return {
        projectId: prj.id,
        projectName: prj.name,
        clientId: prj.clientId,
        status: prj.status,
        currency: prj.currency,
        budget: prj.budget,
        hourlyRate: prj.hourlyRate,
        estimatedHours,
        actualHours,
        billableHours,
        hourVariance: Number((estimatedHours - actualHours).toFixed(2)),
        trackedBillableValue,
        budgetRemainingVsTracked: subtractMoney(prj.budget, trackedBillableValue),
        recordedIncome,
        recordedExpenses,
        overBudgetHours: estimatedHours > 0 && actualHours > estimatedHours,
      };
    });
}

export function evaluateMonthlyBusinessHealth(params: {
  monthPrefix?: string;
  goals: WorkspaceGoal[];
  financeEntries: FinanceEntry[];
  timeEntries: TimeEntry[];
  invoices: Invoice[];
  tasks: Task[];
  today?: string;
}): MonthlyBusinessHealth {
  const today = params.today ?? todayDateStr();
  const monthPrefix = params.monthPrefix ?? today.slice(0, 7);
  const activeGoal = params.goals.find((g) => g.monthPrefix === monthPrefix);

  const monthFin = params.financeEntries.filter((f) => f.date.startsWith(monthPrefix));
  const revenueThisMonth = addMoney(
    ...monthFin.filter((f) => f.type === 'income').map((f) => f.amount)
  );
  const expensesThisMonth = addMoney(
    ...monthFin.filter((f) => f.type === 'expense').map((f) => f.amount)
  );
  const netThisMonth = subtractMoney(revenueThisMonth, expensesThisMonth);

  const billableSeconds = params.timeEntries
    .filter((t) => t.billable && t.startTime.startsWith(monthPrefix))
    .reduce((sum, t) => sum + t.durationSeconds, 0);
  const billableHoursThisMonth = Number(secondsToDecimalHours(billableSeconds).toFixed(2));

  const targetRevenue = activeGoal?.targetRevenue ?? 0;
  const targetBillableHours = activeGoal?.targetBillableHours ?? 0;
  const maxExpenseBudget = activeGoal?.maxExpenseBudget ?? 0;

  const revenueProgressPercent =
    targetRevenue > 0
      ? Math.min(100, Math.round((revenueThisMonth / targetRevenue) * 100))
      : 0;
  const hoursProgressPercent =
    targetBillableHours > 0
      ? Math.min(100, Math.round((billableHoursThisMonth / targetBillableHours) * 100))
      : 0;

  const overdueInvoiceCount = params.invoices.filter(
    (i) => i.status === 'overdue' && i.balanceDue > 0
  ).length;
  const overdueTaskCount = params.tasks.filter(
    (t) => t.status !== 'done' && t.status !== 'archived' && t.dueDate !== '' && t.dueDate < today
  ).length;

  let score = 85;
  score -= Math.min(30, overdueInvoiceCount * 10);
  score -= Math.min(20, overdueTaskCount * 4);
  if (maxExpenseBudget > 0 && expensesThisMonth > maxExpenseBudget) {
    score -= 12;
  }
  if (targetRevenue > 0 && revenueThisMonth >= targetRevenue) {
    score += 10;
  }
  if (netThisMonth < 0) {
    score -= 15;
  }
  const healthScore = Math.max(0, Math.min(100, score));

  const notes: string[] = [];
  if (overdueInvoiceCount > 0) {
    notes.push(`${overdueInvoiceCount} overdue invoice(s) have remaining balances.`);
  }
  if (overdueTaskCount > 0) {
    notes.push(`${overdueTaskCount} open task(s) are past due.`);
  }
  if (maxExpenseBudget > 0 && expensesThisMonth > maxExpenseBudget) {
    notes.push('Monthly expenses exceed your configured expense ceiling.');
  }
  if (!activeGoal) {
    notes.push(`Set a monthly revenue & hours target for ${monthPrefix} to track goal progress.`);
  }
  if (notes.length === 0) {
    notes.push('No overdue invoices, overdue tasks, or expense overruns detected.');
  }

  return {
    monthPrefix,
    revenueThisMonth,
    expensesThisMonth,
    netThisMonth,
    billableHoursThisMonth,
    targetRevenue,
    targetBillableHours,
    maxExpenseBudget,
    revenueProgressPercent,
    hoursProgressPercent,
    overdueInvoiceCount,
    overdueTaskCount,
    healthScore,
    healthStatus: healthScore >= 75 ? 'strong' : healthScore >= 50 ? 'watch' : 'needs_attention',
    notes,
  };
}
