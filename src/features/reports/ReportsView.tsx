import React, { useMemo, useState } from 'react';
import { BarChart3, Download, FileDown, Info } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  PageHeader,
} from '../../components/ui';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import { getMonthKey, todayDateStr } from '../../domain/calculations/dates';
import { addMoney, formatMoney, subtractMoney } from '../../domain/calculations/money';
import { buildCsvContent, downloadTextFile } from '../../export/csvUtils';
import { generateFinancialSummaryPdf } from '../../pdf/pdfGenerator';
import {
  calculateEstimatesVsActuals,
  calculateInvoiceAging,
} from '../../services/businessHealthService';

const PIE_COLORS = ['#2563EB', '#20C7D9', '#10B981', '#F59E0B', '#6366F1', '#EC4899'];

export const ReportsView: React.FC = () => {
  const {
    financeEntries,
    invoices,
    clients,
    projects,
    timeEntries,
    businessProfile,
    settings,
  } = useWorkspace();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const currency = settings?.defaultCurrency ?? 'USD';
  const today = todayDateStr();

  const filteredFinance = useMemo(() => {
    return financeEntries.filter((f) => {
      if (fromDate && f.date < fromDate) return false;
      if (toDate && f.date > toDate) return false;
      return true;
    });
  }, [financeEntries, fromDate, toDate]);

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

  const monthlyRows = useMemo(() => {
    const map = new Map<string, { label: string; income: number; expenses: number; net: number }>();
    for (const entry of filteredFinance) {
      const m = getMonthKey(entry.date);
      const row = map.get(m) ?? { label: m, income: 0, expenses: 0, net: 0 };
      if (entry.type === 'income') row.income = addMoney(row.income, entry.amount);
      else row.expenses = addMoney(row.expenses, entry.amount);
      row.net = subtractMoney(row.income, row.expenses);
      map.set(m, row);
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredFinance]);

  const expenseCategories = useMemo(() => {
    const map = new Map<string, number>();
    filteredFinance
      .filter((f) => f.type === 'expense')
      .forEach((f) => map.set(f.category, addMoney(map.get(f.category) ?? 0, f.amount)));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filteredFinance]);

  const agingReport = useMemo(() => calculateInvoiceAging(invoices, today), [invoices, today]);
  const agingByKey = useMemo(
    () => new Map(agingReport.buckets.map((b) => [b.key, b])),
    [agingReport]
  );
  const aging = {
    current: agingByKey.get('current')?.totalBalance ?? 0,
    d1_30: agingByKey.get('1_30')?.totalBalance ?? 0,
    d31_60: agingByKey.get('31_60')?.totalBalance ?? 0,
    d60_plus: agingByKey.get('61_plus')?.totalBalance ?? 0,
  };

  const estimatesVsActuals = useMemo(
    () => calculateEstimatesVsActuals(projects, timeEntries, financeEntries),
    [projects, timeEntries, financeEntries]
  );

  const clientLeaderboard = useMemo(() => {
    const map = new Map<string, number>();
    filteredFinance
      .filter((f) => f.type === 'income' && f.clientId)
      .forEach((f) => map.set(f.clientId, addMoney(map.get(f.clientId) ?? 0, f.amount)));
    return Array.from(map.entries())
      .map(([cid, amount]) => ({
        name: clients.find((c) => c.id === cid)?.name ?? 'Client',
        amount,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [filteredFinance, clients]);

  const outstandingReceivables = agingReport.totalOpenBalance;
  const overdueAmount = addMoney(aging.d1_30, aging.d31_60, aging.d60_plus);

  const exportCsv = () => {
    const csv = buildCsvContent(
      ['Month', 'Income', 'Expenses', 'Estimated Net Profit'],
      monthlyRows.map((r) => [r.label, r.income, r.expenses, r.net])
    );
    downloadTextFile(`solodesk-report-${today}.csv`, csv);
  };

  const exportPdf = () => {
    const periodLabel =
      fromDate || toDate ? `${fromDate || 'Start'} to ${toDate || 'Present'}` : 'All Time';
    void generateFinancialSummaryPdf({
      businessName: businessProfile?.businessName ?? 'SOLODESK AI',
      periodLabel,
      currency,
      totalIncome,
      totalExpenses,
      netProfit,
      outstandingReceivables,
      overdueAmount,
      rows: monthlyRows,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Reports"
        description="Income vs. expenses, category breakdown, invoice aging, and top clients."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} icon={<Download className="w-4 h-4" />}>
              Export CSV
            </Button>
            <Button onClick={exportPdf} icon={<FileDown className="w-4 h-4" />}>
              Export PDF Summary
            </Button>
          </>
        }
      />

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#172338] p-3 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2">
        <Info className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          Reports reflect user-entered records stored in your browser. Outputs are informational
          estimates and not certified accounting statements.
        </p>
      </div>

      <Card className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <Input
          label="From Date"
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />
        <Input
          label="To Date"
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
        />
        <Button
          variant="outline"
          onClick={() => {
            setFromDate('');
            setToDate('');
          }}
        >
          Reset Filters
        </Button>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <p className="text-xs text-slate-500">Income</p>
          <p className="text-xl font-bold font-mono tabular-nums mt-1 text-emerald-600">
            {formatMoney(totalIncome, currency)}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Expenses</p>
          <p className="text-xl font-bold font-mono tabular-nums mt-1 text-red-600">
            {formatMoney(totalExpenses, currency)}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Net Profit</p>
          <p className="text-xl font-bold font-mono tabular-nums mt-1">
            {formatMoney(netProfit, currency)}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Overdue Receivables</p>
          <p className="text-xl font-bold font-mono tabular-nums mt-1 text-amber-600">
            {formatMoney(overdueAmount, currency)}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Income vs. Expenses by Month" />
          {monthlyRows.length === 0 ? (
            <EmptyState
              icon={<BarChart3 className="w-5 h-5" />}
              title="No data in range"
              description="Add income or expense records to display monthly performance."
            />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <RechartsTooltip />
                  <Bar dataKey="income" name="Income" fill="#2563EB" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Expense Category Distribution" />
          {expenseCategories.length === 0 ? (
            <EmptyState
              icon={<BarChart3 className="w-5 h-5" />}
              title="No expenses in range"
              description="Log categorized expenses to inspect spending distribution."
            />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseCategories}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label
                  >
                    {expenseCategories.map((entry, idx) => (
                      <Cell key={entry.name} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader
            title={`Invoice Aging Summary (${agingReport.openInvoiceCount} open)`}
            description="Open invoice balances grouped by days past due."
          />
          <div className="grid grid-cols-2 gap-3 text-xs">
            {agingReport.buckets.map((bucket) => (
              <div key={bucket.key} className="p-3 rounded-lg bg-slate-50 dark:bg-[#101827]">
                <p className="text-slate-500">
                  {bucket.label} ({bucket.count})
                </p>
                <p
                  className={`text-base font-bold font-mono tabular-nums mt-1 ${
                    bucket.key === '61_plus'
                      ? 'text-red-600'
                      : bucket.key === '31_60'
                        ? 'text-orange-600'
                        : bucket.key === '1_30'
                          ? 'text-amber-600'
                          : ''
                  }`}
                >
                  {formatMoney(bucket.totalBalance, currency)}
                </p>
              </div>
            ))}
          </div>
          {agingReport.buckets.some((b) => b.key !== 'current' && b.invoices.length > 0) && (
            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
              <p className="font-semibold text-slate-700 dark:text-slate-200">Overdue Invoices Detail</p>
              {agingReport.buckets
                .filter((b) => b.key !== 'current')
                .flatMap((b) => b.invoices)
                .map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between gap-2 text-slate-600 dark:text-slate-300">
                    <span>
                      <span className="font-mono font-semibold">{inv.number}</span> · {inv.daysPastDue}d past due
                    </span>
                    <span className="font-mono tabular-nums font-semibold">
                      {formatMoney(inv.balanceDue, inv.currency)}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Top Revenue Clients" />
          {clientLeaderboard.length === 0 ? (
            <p className="text-xs text-slate-500">No client-linked income entries in this period.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {clientLeaderboard.map((c) => (
                <li key={c.name} className="py-2.5 flex justify-between">
                  <span className="font-medium text-slate-800 dark:text-slate-100">{c.name}</span>
                  <span className="font-mono font-semibold tabular-nums">{formatMoney(c.amount, currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Project Estimates vs Actuals"
          description="Compares planned budget hours against tracked timer entries and recorded income."
        />
        {estimatesVsActuals.length === 0 ? (
          <p className="text-xs text-slate-500">Create active projects and track hours to compare estimates vs actuals.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-2 text-left">Project</th>
                  <th className="py-2 text-right">Budget</th>
                  <th className="py-2 text-right">Est. Hours</th>
                  <th className="py-2 text-right">Actual Hours</th>
                  <th className="py-2 text-right">Variance</th>
                  <th className="py-2 text-right">Recorded Income</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {estimatesVsActuals.map((row) => (
                  <tr key={row.projectId}>
                    <td className="py-2.5 font-medium text-slate-900 dark:text-white">
                      {row.projectName}
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums">
                      {formatMoney(row.budget, row.currency)}
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums">{row.estimatedHours.toFixed(1)}h</td>
                    <td className="py-2.5 text-right font-mono tabular-nums">{row.actualHours.toFixed(1)}h</td>
                    <td
                      className={`py-2.5 text-right font-mono tabular-nums font-semibold ${
                        row.overBudgetHours ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {row.hourVariance >= 0 ? `+${row.hourVariance.toFixed(1)}h` : `${row.hourVariance.toFixed(1)}h`}
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums">
                      {formatMoney(row.recordedIncome, row.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
