import { addDaysToDateStr, todayDateStr } from '../domain/calculations/dates';
import { createId, type Invoice } from '../domain/schemas/entities';
import { repositories, type DexieSolodeskRepositories } from '../database/repositories/dexieRepositories';
import { computeNextRecurrenceDate } from './financialIntelligenceService';

export interface BackgroundJobSummary {
  executedAt: string;
  generatedRecurringInvoices: Invoice[];
  overdueRefreshedCount: number;
  emittedNotifications: number;
}

const JOB_RUN_STORAGE_KEY = 'solodesk_last_bg_job_date';

/**
 * Deterministic, idempotent local background scheduler.
 * Executes due recurring invoices (`nextRecurrenceDate <= today`), updates overdue status,
 * and pushes deduplicated notifications without double-generating invoices.
 */
export async function runWorkspaceBackgroundJobs(options: {
  today?: string;
  repo?: DexieSolodeskRepositories;
  force?: boolean;
} = {}): Promise<BackgroundJobSummary> {
  const today = options.today ?? todayDateStr();
  const repo = options.repo ?? repositories;

  const overdueRefreshedCount = await repo.refreshOverdueInvoices();
  const [invoices, notifications] = await Promise.all([
    repo.listInvoices(),
    repo.listNotifications(),
  ]);

  const generatedRecurringInvoices: Invoice[] = [];
  let emittedNotifications = 0;

  for (const inv of invoices) {
    if (
      !inv.recurrenceRule ||
      inv.recurrenceRule === 'none' ||
      !inv.nextRecurrenceDate ||
      inv.status === 'cancelled'
    ) {
      continue;
    }

    if (inv.nextRecurrenceDate <= today) {
      const nextDueDate = computeNextRecurrenceDate(inv.nextRecurrenceDate, inv.recurrenceRule);
      // Advance parent nextRecurrenceDate FIRST to guarantee idempotency across concurrent tabs
      await repo.updateInvoice(inv.id, {
        nextRecurrenceDate: nextDueDate,
      });

      const issueDate = inv.nextRecurrenceDate;
      const dueDate = addDaysToDateStr(issueDate, 14);
      const created = await repo.createInvoice({
        number: '',
        clientId: inv.clientId,
        projectId: inv.projectId,
        quotationId: '',
        issueDate,
        dueDate,
        currency: inv.currency,
        lineItems: inv.lineItems.map((li) => ({ ...li, id: createId('li') })),
        discountType: inv.discountType,
        discountValue: inv.discountValue,
        taxRate: inv.taxRate,
        taxInclusive: inv.taxInclusive,
        subtotal: inv.subtotal,
        discountAmount: inv.discountAmount,
        taxAmount: inv.taxAmount,
        total: inv.total,
        notes: inv.notes
          ? `${inv.notes}\nAuto-generated recurring invoice from ${inv.number}.`
          : `Auto-generated recurring invoice from ${inv.number}.`,
        paymentInstructions: inv.paymentInstructions,
        status: 'draft',
        recurrenceRule: 'none',
        nextRecurrenceDate: '',
        isDemo: inv.isDemo,
      });
      generatedRecurringInvoices.push(created);

      await repo.pushNotification({
        title: `Recurring Draft Invoice ${created.number}`,
        message: `Generated automatically from ${inv.number} (${created.currency} ${created.total.toFixed(2)}).`,
        severity: 'info',
        read: false,
        route: 'invoices',
      });
      emittedNotifications += 1;
    }
  }

  // Emit non-duplicate overdue alert once per day if overdue balance exists
  const alreadyAlertedToday = notifications.some(
    (n) => n.title === 'Overdue Invoices Require Attention' && n.createdAt.startsWith(today)
  );
  const overdueInvoices = invoices.filter((i) => i.status === 'overdue' && i.balanceDue > 0);
  if (!alreadyAlertedToday && overdueInvoices.length > 0 && typeof window !== 'undefined') {
    const lastRun = window.sessionStorage.getItem(JOB_RUN_STORAGE_KEY);
    if (options.force || lastRun !== today) {
      window.sessionStorage.setItem(JOB_RUN_STORAGE_KEY, today);
      await repo.pushNotification({
        title: 'Overdue Invoices Require Attention',
        message: `${overdueInvoices.length} invoice(s) are past due.`,
        severity: 'warning',
        read: false,
        route: 'invoices',
      });
      emittedNotifications += 1;
    }
  }

  return {
    executedAt: new Date().toISOString(),
    generatedRecurringInvoices,
    overdueRefreshedCount,
    emittedNotifications,
  };
}
