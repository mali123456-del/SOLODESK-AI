import { getMonthKey } from './dates';
import { addMoney } from './money';
import type { Invoice } from '../schemas/entities';

export interface MonthlyRevenueTrendPoint {
  month: string;
  label: string;
  invoicedRevenue: number;
  collectedRevenue: number;
  invoiceCount: number;
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatMonthLabel(monthKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return monthKey;
  const idx = Number(m[2]) - 1;
  const monthName = SHORT_MONTHS[idx] ?? m[2];
  return `${monthName} ${m[1]}`;
}

export function buildMonthlyRevenueTrend(
  invoices: Invoice[],
  options?: { cutoffDate?: string; maxMonths?: number }
): MonthlyRevenueTrendPoint[] {
  const cutoffDate = options?.cutoffDate ?? '';
  const maxMonths = Math.max(1, options?.maxMonths ?? 12);
  const byMonth = new Map<
    string,
    { invoicedRevenue: number; collectedRevenue: number; invoiceCount: number }
  >();

  for (const inv of invoices) {
    if (inv.status === 'cancelled') continue;
    const issueDay = inv.issueDate.slice(0, 10);
    if (cutoffDate && issueDay < cutoffDate) continue;
    const month = getMonthKey(inv.issueDate);
    if (month === 'Unknown') continue;

    const existing = byMonth.get(month) ?? {
      invoicedRevenue: 0,
      collectedRevenue: 0,
      invoiceCount: 0,
    };

    existing.invoicedRevenue = addMoney(existing.invoicedRevenue, inv.total);
    existing.collectedRevenue = addMoney(existing.collectedRevenue, inv.amountPaid);
    existing.invoiceCount += 1;
    byMonth.set(month, existing);
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-maxMonths)
    .map(([month, agg]) => ({
      month,
      label: formatMonthLabel(month),
      invoicedRevenue: agg.invoicedRevenue,
      collectedRevenue: agg.collectedRevenue,
      invoiceCount: agg.invoiceCount,
    }));
}
