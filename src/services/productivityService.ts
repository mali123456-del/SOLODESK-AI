import {
  addDaysToDateStr,
  isDateOverdue,
  secondsToDecimalHours,
  todayDateStr,
  toWorkspaceDateStr,
} from '../domain/calculations/dates';
import { addMoney } from '../domain/calculations/money';
import type {
  Appointment,
  Client,
  Invoice,
  Project,
  Task,
  TimeEntry,
} from '../domain/schemas/entities';
import { buildFollowUpQueue, type FollowUpQueueItem } from './communicationService';

export interface DailyDigestMilestoneItem {
  projectId: string;
  projectName: string;
  milestoneId: string;
  title: string;
  dueDate: string;
  overdue: boolean;
}

export interface DailyDigestSummary {
  date: string;
  dueTodayTasks: Task[];
  overdueTasks: Task[];
  highPriorityTasks: Task[];
  pendingInvoices: Invoice[];
  pendingInvoiceTotal: number;
  overdueInvoiceCount: number;
  upcomingMilestones: DailyDigestMilestoneItem[];
  todaysAppointments: Appointment[];
  outstandingFollowUps: FollowUpQueueItem[];
  totalActionItems: number;
}

export interface ProductivityStats {
  tasksCompletedLast7Days: number;
  tasksCompletedLast30Days: number;
  openTaskCount: number;
  overdueTaskCount: number;
  hoursLoggedLast7Days: number;
  hoursLoggedLast30Days: number;
  billableSharePercent: number;
  onTimeCompletionPercent: number;
}

export function buildDailyDigest(input: {
  clients: Client[];
  projects: Project[];
  tasks: Task[];
  invoices: Invoice[];
  appointments: Appointment[];
  businessName?: string;
  today?: string;
}): DailyDigestSummary {
  const today = input.today ?? todayDateStr();
  const horizonDate = addDaysToDateStr(today, 7);

  const openTasks = input.tasks.filter((t) => t.status !== 'done' && t.status !== 'archived');
  const dueTodayTasks = openTasks.filter((t) => t.dueDate === today);
  const overdueTasks = openTasks.filter((t) => t.dueDate !== '' && isDateOverdue(t.dueDate, today));
  const highPriorityTasks = openTasks.filter(
    (t) => t.priority === 'urgent' || t.priority === 'high'
  );

  const pendingInvoices = input.invoices.filter(
    (i) => i.status !== 'cancelled' && i.status !== 'paid' && i.balanceDue > 0
  );
  const pendingInvoiceTotal = addMoney(...pendingInvoices.map((i) => i.balanceDue));
  const overdueInvoiceCount = pendingInvoices.filter(
    (i) => i.status === 'overdue' || isDateOverdue(i.dueDate, today)
  ).length;

  const upcomingMilestones: DailyDigestMilestoneItem[] = [];
  for (const project of input.projects) {
    if (project.status === 'completed' || project.status === 'archived') continue;
    for (const ms of project.milestones) {
      if (ms.completed || !ms.dueDate) continue;
      if (ms.dueDate <= horizonDate) {
        upcomingMilestones.push({
          projectId: project.id,
          projectName: project.name,
          milestoneId: ms.id,
          title: ms.title,
          dueDate: ms.dueDate,
          overdue: isDateOverdue(ms.dueDate, today),
        });
      }
    }
  }
  upcomingMilestones.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const todaysAppointments = input.appointments
    .filter((a) => a.status === 'scheduled' && a.date === today)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const outstandingFollowUps = buildFollowUpQueue({
    clients: input.clients,
    invoices: input.invoices,
    proposals: [],
    appointments: input.appointments,
    businessName: input.businessName,
    referenceDate: today,
  }).slice(0, 6);

  const totalActionItems =
    dueTodayTasks.length +
    overdueTasks.length +
    pendingInvoices.length +
    upcomingMilestones.length +
    todaysAppointments.length +
    outstandingFollowUps.length;

  return {
    date: today,
    dueTodayTasks,
    overdueTasks,
    highPriorityTasks,
    pendingInvoices,
    pendingInvoiceTotal,
    overdueInvoiceCount,
    upcomingMilestones,
    todaysAppointments,
    outstandingFollowUps,
    totalActionItems,
  };
}

export function computeProductivityStats(input: {
  tasks: Task[];
  timeEntries: TimeEntry[];
  today?: string;
}): ProductivityStats {
  const today = input.today ?? todayDateStr();
  const cutoff7 = addDaysToDateStr(today, -7);
  const cutoff30 = addDaysToDateStr(today, -30);

  const doneTasks = input.tasks.filter((t) => t.status === 'done');
  const tasksCompletedLast7Days = doneTasks.filter(
    (t) => (t.completedAt || t.updatedAt).slice(0, 10) >= cutoff7
  ).length;
  const tasksCompletedLast30Days = doneTasks.filter(
    (t) => (t.completedAt || t.updatedAt).slice(0, 10) >= cutoff30
  ).length;

  const openTasks = input.tasks.filter((t) => t.status !== 'done' && t.status !== 'archived');
  const overdueTaskCount = openTasks.filter(
    (t) => t.dueDate !== '' && isDateOverdue(t.dueDate, today)
  ).length;

  const doneWithDue = doneTasks.filter((t) => t.dueDate !== '' && t.completedAt !== '');
  const onTimeCount = doneWithDue.filter(
    (t) => t.completedAt.slice(0, 10) <= t.dueDate
  ).length;
  const onTimeCompletionPercent =
    doneWithDue.length > 0 ? Math.round((onTimeCount / doneWithDue.length) * 100) : 100;

  const completedEntries = input.timeEntries.filter((e) => !e.isRunning);
  const sec7 = completedEntries
    .filter((e) => e.startTime.slice(0, 10) >= cutoff7)
    .reduce((sum, e) => sum + e.durationSeconds, 0);
  const entries30 = completedEntries.filter((e) => e.startTime.slice(0, 10) >= cutoff30);
  const sec30 = entries30.reduce((sum, e) => sum + e.durationSeconds, 0);
  const billableSec30 = entries30
    .filter((e) => e.billable)
    .reduce((sum, e) => sum + e.durationSeconds, 0);

  const billableSharePercent = sec30 > 0 ? Math.round((billableSec30 / sec30) * 100) : 0;

  return {
    tasksCompletedLast7Days,
    tasksCompletedLast30Days,
    openTaskCount: openTasks.length,
    overdueTaskCount,
    hoursLoggedLast7Days: Number(secondsToDecimalHours(sec7).toFixed(1)),
    hoursLoggedLast30Days: Number(secondsToDecimalHours(sec30).toFixed(1)),
    billableSharePercent,
    onTimeCompletionPercent,
  };
}

export interface DailyTaskGoalProgress {
  date: string;
  target: number;
  hasTarget: boolean;
  completedToday: number;
  completedTaskIds: string[];
  rawPercent: number;
  ringPercent: number;
  goalReached: boolean;
  remainingCount: number;
}

export function validateDailyTaskGoalTarget(raw: string | number): {
  valid: boolean;
  value: number;
  error?: string;
} {
  if (typeof raw === 'string' && raw.trim() === '') {
    return { valid: false, value: 0, error: 'Enter a whole number between 0 and 500.' };
  }
  const num = typeof raw === 'number' ? raw : Number(raw.trim());
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return { valid: false, value: 0, error: 'Daily task target must be a whole number.' };
  }
  if (num < 0) {
    return { valid: false, value: 0, error: 'Daily task target cannot be negative.' };
  }
  if (num > 500) {
    return { valid: false, value: 0, error: 'Daily task target cannot exceed 500 tasks per day.' };
  }
  return { valid: true, value: num };
}

export function computeDailyTaskGoalProgress(input: {
  tasks: Task[];
  target?: number | null;
  today?: string;
  timeZone?: string;
}): DailyTaskGoalProgress {
  const today = input.today ?? todayDateStr(new Date(), input.timeZone);
  const rawTarget = input.target ?? 0;
  const safeTarget =
    typeof rawTarget === 'number' && Number.isFinite(rawTarget) && rawTarget > 0
      ? Math.min(500, Math.floor(rawTarget))
      : 0;

  const seenIds = new Set<string>();
  const completedTaskIds: string[] = [];

  for (const task of input.tasks) {
    if (!task.id || seenIds.has(task.id)) continue;
    if (task.status !== 'done') continue;
    if (!task.completedAt) continue;
    const completedDate = toWorkspaceDateStr(task.completedAt, input.timeZone);
    if (!completedDate) continue;
    if (completedDate === today) {
      seenIds.add(task.id);
      completedTaskIds.push(task.id);
    }
  }

  const completedToday = completedTaskIds.length;
  const hasTarget = safeTarget > 0;
  const rawPercent = hasTarget ? Math.round((completedToday / safeTarget) * 100) : 0;
  const ringPercent = Math.min(100, Math.max(0, rawPercent));

  return {
    date: today,
    target: safeTarget,
    hasTarget,
    completedToday,
    completedTaskIds,
    rawPercent,
    ringPercent,
    goalReached: hasTarget && completedToday >= safeTarget,
    remainingCount: hasTarget ? Math.max(0, safeTarget - completedToday) : 0,
  };
}

