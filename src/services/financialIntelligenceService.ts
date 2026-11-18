import Big from 'big.js';
import { addDaysToDateStr, getMonthKey, todayDateStr } from '../domain/calculations/dates';
import { addMoney, getCurrencyDecimals, roundMoney } from '../domain/calculations/money';
import type { FinanceEntry, Invoice, Retainer } from '../domain/schemas/entities';

/**
 * Exact Big.js FX conversion into workspace base currency using configured rates.
 * Rates represent units of currency per 1 unit of base currency (e.g. USD=1, PKR=278.5).
 */
export function convertCurrencyToBase(
  amount: number,
  fromCurrency: string,
  baseCurrency: string,
  fxRates: Record<string, number>,
  overrideRateToBase?: number
): number {
  if (amount === 0) return 0;
  if (fromCurrency === baseCurrency && (!overrideRateToBase || overrideRateToBase === 1)) {
    return roundMoney(amount, getCurrencyDecimals(baseCurrency));
  }
  const decimals = getCurrencyDecimals(baseCurrency);
  if (overrideRateToBase && overrideRateToBase > 0 && overrideRateToBase !== 1) {
    return Number(new Big(amount).times(overrideRateToBase).round(decimals, Big.roundHalfUp).toFixed(decimals));
  }
  const fromRate = fxRates[fromCurrency] ?? 1;
  const baseRate = fxRates[baseCurrency] ?? 1;
  if (fromRate <= 0 || baseRate <= 0) return roundMoney(amount, decimals);
  const result = new Big(amount).div(fromRate).times(baseRate);
  return Number(result.round(decimals, Big.roundHalfUp).toFixed(decimals));
}

export function computeNextRecurrenceDate(
  currentDate: string,
  rule: Invoice['recurrenceRule']
): string {
  if (!rule || rule === 'none') return '';
  if (rule === 'weekly') return addDaysToDateStr(currentDate, 7);
  if (rule === 'monthly') return addDaysToDateStr(currentDate, 30);
  if (rule === 'quarterly') return addDaysToDateStr(currentDate, 90);
  return addDaysToDateStr(currentDate, 365);
}

export interface ForecastPoint {
  month: string;
  projectedIncome: number;
  projectedExpenses: number;
  projectedNet: number;
  kind: 'historical' | 'forecast';
}

export interface WhatIfScenarioResult {
  monthlyBaselineIncome: number;
  monthlyBaselineExpenses: number;
  projectedAnnualIncome: number;
  projectedAnnualExpenses: number;
  projectedAnnualNet: number;
  monthlyRunRateAfterDelta: number;
  disclaimer: string;
}

export function buildCashflowForecast(input: {
  financeEntries: FinanceEntry[];
  invoices: Invoice[];
  retainers: Retainer[];
  monthsAhead?: number;
  today?: string;
}): ForecastPoint[] {
  const monthsAhead = input.monthsAhead ?? 3;
  const today = input.today ?? todayDateStr();

  const monthlyMap = new Map<string, { income: number; expenses: number }>();
  for (const entry of input.financeEntries) {
    const m = getMonthKey(entry.date);
    const cur = monthlyMap.get(m) ?? { income: 0, expenses: 0 };
    if (entry.type === 'income') cur.income = addMoney(cur.income, entry.amount);
    else cur.expenses = addMoney(cur.expenses, entry.amount);
    monthlyMap.set(m, cur);
  }

  const sortedHistory = Array.from(monthlyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-4);

  const points: ForecastPoint[] = sortedHistory.map(([month, v]) => ({
    month,
    projectedIncome: v.income,
    projectedExpenses: v.expenses,
    projectedNet: roundMoney(v.income - v.expenses),
    kind: 'historical',
  }));

  const histCount = Math.max(1, sortedHistory.length);
  const avgIncome = sortedHistory.reduce((s, [, v]) => s + v.income, 0) / histCount;
  const avgExpenses = sortedHistory.reduce((s, [, v]) => s + v.expenses, 0) / histCount;

  const activeRetainerMonthly = addMoney(
    ...input.retainers.filter((r) => r.status === 'active').map((r) => r.monthlyAmount)
  );
  const unpaidReceivables = addMoney(
    ...input.invoices
      .filter((i) => i.status !== 'cancelled' && i.status !== 'paid' && i.balanceDue > 0)
      .map((i) => i.balanceDue)
  );

  const [yearStr, monthStr] = today.slice(0, 7).split('-');
  let y = Number(yearStr);
  let m = Number(monthStr);

  for (let i = 1; i <= monthsAhead; i += 1) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    const label = `${y}-${String(m).padStart(2, '0')}`;
    const expectedFromInvoices = i === 1 ? roundMoney(unpaidReceivables * 0.7) : 0;
    const projectedIncome = roundMoney(
      Math.max(avgIncome, activeRetainerMonthly) + expectedFromInvoices
    );
    const projectedExpenses = roundMoney(avgExpenses);
    points.push({
      month: label,
      projectedIncome,
      projectedExpenses,
      projectedNet: roundMoney(projectedIncome - projectedExpenses),
      kind: 'forecast',
    });
  }

  return points;
}

export function runWhatIfFinancialScenario(input: {
  monthlyBaselineIncome: number;
  monthlyBaselineExpenses: number;
  rateChangePercent: number;
  newMonthlyRetainerAmount: number;
  monthlyExpenseDelta: number;
}): WhatIfScenarioResult {
  const multiplier = new Big(1).plus(new Big(input.rateChangePercent).div(100));
  const adjustedIncome = Number(
    new Big(input.monthlyBaselineIncome)
      .times(multiplier)
      .plus(input.newMonthlyRetainerAmount)
      .round(2, Big.roundHalfUp)
      .toFixed(2)
  );
  const adjustedExpenses = Math.max(
    0,
    roundMoney(input.monthlyBaselineExpenses + input.monthlyExpenseDelta)
  );
  const monthlyRunRateAfterDelta = roundMoney(adjustedIncome - adjustedExpenses);
  return {
    monthlyBaselineIncome: roundMoney(input.monthlyBaselineIncome),
    monthlyBaselineExpenses: roundMoney(input.monthlyBaselineExpenses),
    projectedAnnualIncome: roundMoney(adjustedIncome * 12),
    projectedAnnualExpenses: roundMoney(adjustedExpenses * 12),
    projectedAnnualNet: roundMoney(monthlyRunRateAfterDelta * 12),
    monthlyRunRateAfterDelta,
    disclaimer:
      'Informational scenario model calculated locally from your assumptions and historical entries. Not guaranteed financial or tax advice.',
  };
}
