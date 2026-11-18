import React, { useMemo, useState } from 'react';
import {
  DollarSign,
  Download,
  Info,
  Paperclip,
  Plus,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Textarea,
  useToast,
  type ColumnDef,
} from '../../components/ui';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import { repositories } from '../../database/repositories/dexieRepositories';
import {
  formatDisplayDate,
  getMonthKey,
  secondsToDecimalHours,
  todayDateStr,
} from '../../domain/calculations/dates';
import {
  addMoney,
  formatMoney,
  subtractMoney,
  SUPPORTED_CURRENCIES,
} from '../../domain/calculations/money';
import type { FinanceEntry } from '../../domain/schemas/entities';
import { buildCsvContent, downloadTextFile } from '../../export/csvUtils';

interface FinanceViewProps {
  mode: 'income' | 'expenses' | 'profitability';
}

const EXPENSE_CATEGORIES = [
  'Software & Subscriptions',
  'Hardware & Equipment',
  'Subcontractor',
  'Cloud & Hosting',
  'Marketing',
  'Office & Utilities',
  'Travel',
  'Other',
];

const INCOME_CATEGORIES = [
  'Invoice Payment',
  'Retainer',
  'Consulting',
  'Product Sale',
  'Affiliate / Royalty',
  'Other',
];

export const FinanceView: React.FC<FinanceViewProps> = ({ mode }) => {
  const { financeEntries, projects, clients, timeEntries, retainers, settings, refresh } =
    useWorkspace();
  const { pushToast } = useToast();

  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FinanceEntry | null>(null);

  const defaultCurrency = settings?.defaultCurrency ?? 'USD';
  const dateFormat = settings?.dateFormat ?? 'DD MMM YYYY';

  const [entryType, setEntryType] = useState<'income' | 'expense'>(
    mode === 'expenses' ? 'expense' : 'income'
  );
  const [category, setCategory] = useState(
    mode === 'expenses' ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0]
  );
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [date, setDate] = useState(todayDateStr());
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [taxProfileName, setTaxProfileName] = useState('');
  const [receiptFileName, setReceiptFileName] = useState('');
  const [receiptMimeType, setReceiptMimeType] = useState('');
  const [receiptDataUrl, setReceiptDataUrl] = useState('');
  const [saving, setSaving] = useState(false);

  // Retainer form
  const [retainerModalOpen, setRetainerModalOpen] = useState(false);
  const [retClientId, setRetClientId] = useState('');
  const [retTitle, setRetTitle] = useState('');
  const [retMonthlyAmount, setRetMonthlyAmount] = useState('1500');
  const [retIncludedHours, setRetIncludedHours] = useState('20');

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const months = useMemo(() => {
    const set = new Set<string>();
    financeEntries.forEach((f) => set.add(getMonthKey(f.date)));
    return Array.from(set).sort().reverse();
  }, [financeEntries]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return financeEntries.filter((f) => {
      if (mode === 'income' && f.type !== 'income') return false;
      if (mode === 'expenses' && f.type !== 'expense') return false;
      if (monthFilter !== 'all' && getMonthKey(f.date) !== monthFilter) return false;
      if (!q) return true;
      return (
        f.description.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        (clientMap.get(f.clientId)?.name.toLowerCase().includes(q) ?? false) ||
        (projectMap.get(f.projectId)?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [financeEntries, mode, monthFilter, search, clientMap, projectMap]);

  const totalIncome = useMemo(
    () =>
      addMoney(
        ...financeEntries
          .filter((f) => f.type === 'income' && (monthFilter === 'all' || getMonthKey(f.date) === monthFilter))
          .map((f) => f.amount)
      ),
    [financeEntries, monthFilter]
  );
  const totalExpenses = useMemo(
    () =>
      addMoney(
        ...financeEntries
          .filter((f) => f.type === 'expense' && (monthFilter === 'all' || getMonthKey(f.date) === monthFilter))
          .map((f) => f.amount)
      ),
    [financeEntries, monthFilter]
  );
  const netProfit = useMemo(
    () => subtractMoney(totalIncome, totalExpenses),
    [totalIncome, totalExpenses]
  );

  const projectProfitability = useMemo(() => {
    return projects.map((proj) => {
      const income = addMoney(
        ...financeEntries
          .filter((f) => f.projectId === proj.id && f.type === 'income')
          .map((f) => f.amount)
      );
      const expense = addMoney(
        ...financeEntries
          .filter((f) => f.projectId === proj.id && f.type === 'expense')
          .map((f) => f.amount)
      );
      const net = subtractMoney(income, expense);
      const seconds = timeEntries
        .filter((t) => t.projectId === proj.id)
        .reduce((s, t) => s + t.durationSeconds, 0);
      const hours = secondsToDecimalHours(seconds);
      const effectiveRate = hours > 0 ? net / hours : 0;
      return {
        id: proj.id,
        name: proj.name,
        clientName: clientMap.get(proj.clientId)?.name ?? 'Client',
        currency: proj.currency,
        income,
        expense,
        net,
        hours,
        effectiveRate,
      };
    });
  }, [projects, financeEntries, timeEntries, clientMap]);

  const openCreate = (kind: 'income' | 'expense') => {
    setEntryType(kind);
    setCategory(kind === 'expense' ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0]);
    setAmount('');
    setCurrency(defaultCurrency);
    setDate(todayDateStr());
    setClientId('');
    setProjectId('');
    setDescription('');
    setNotes('');
    setTaxProfileName('');
    setReceiptFileName('');
    setReceiptMimeType('');
    setReceiptDataUrl('');
    setModalOpen(true);
  };

  const handleReceiptSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 1_000_000) {
      pushToast({ title: 'Receipt exceeds 1 MB browser limit.', tone: 'warning' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setReceiptFileName(file.name);
        setReceiptMimeType(file.type || 'application/octet-stream');
        setReceiptDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(amount);
    if (!description.trim() || !Number.isFinite(num) || num <= 0) return;
    setSaving(true);
    try {
      await repositories.createFinanceEntry({
        type: entryType,
        category,
        amount: num,
        currency,
        date,
        clientId,
        projectId,
        invoiceId: '',
        paymentId: '',
        description: description.trim(),
        notes,
        taxProfileName,
        receiptFileName,
        receiptMimeType,
        receiptDataUrl,
        isDemo: false,
      });
      await refresh();
      setModalOpen(false);
      pushToast({
        tone: 'success',
        title: entryType === 'income' ? 'Income logged' : 'Expense logged',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRetainer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!retClientId || !retTitle.trim()) return;
    await repositories.saveRetainer({
      clientId: retClientId,
      projectId: '',
      title: retTitle.trim(),
      monthlyAmount: Math.max(0, Number(retMonthlyAmount) || 0),
      currency: defaultCurrency,
      includedHours: Math.max(0, Number(retIncludedHours) || 0),
      hoursUsed: 0,
      billingDay: 1,
      status: 'active',
      notes: '',
    });
    setRetTitle('');
    setRetainerModalOpen(false);
    pushToast({ title: 'Retainer agreement saved', tone: 'success' });
    await refresh();
  };

  const handleExportCsv = () => {
    const csv = buildCsvContent(
      ['Date', 'Type', 'Category', 'Description', 'Amount', 'Currency', 'Client', 'Project'],
      filteredEntries.map((f) => [
        f.date,
        f.type,
        f.category,
        f.description,
        f.amount,
        f.currency,
        clientMap.get(f.clientId)?.name ?? '',
        projectMap.get(f.projectId)?.name ?? '',
      ])
    );
    downloadTextFile(`solodesk-${mode}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    pushToast({ tone: 'success', title: 'CSV downloaded' });
  };

  const entryColumns: ColumnDef<FinanceEntry>[] = [
    {
      key: 'description',
      header: 'Description',
      render: (f) => (
        <div>
          <div className="flex items-center gap-1.5">
            <p className="font-medium text-slate-900 dark:text-white">{f.description}</p>
            {f.receiptFileName && (
              <span title={`Receipt: ${f.receiptFileName}`} className="inline-flex">
                <Paperclip className="w-3.5 h-3.5 text-[#2563EB]" aria-label={`Receipt: ${f.receiptFileName}`} />
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            {f.category}
            {f.taxProfileName ? ` · Tax: ${f.taxProfileName}` : ''}
            {f.projectId ? ` · ${projectMap.get(f.projectId)?.name ?? ''}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      sortValue: (f) => f.date,
      render: (f) => <span className="text-xs text-slate-500">{formatDisplayDate(f.date, dateFormat)}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sortValue: (f) => f.amount,
      render: (f) => (
        <span
          className={`font-mono font-semibold ${
            f.type === 'income'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-red-600 dark:text-red-400'
          }`}
        >
          {f.type === 'income' ? '+' : '-'}
          {formatMoney(f.amount, f.currency)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (f) => (
        <button
          type="button"
          onClick={() => setDeleteTarget(f)}
          aria-label={`Delete ${f.description}`}
          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
      ),
    },
  ];

  const pageMeta = {
    income: {
      title: 'Income',
      desc: 'Track invoice payments, retainers, and consulting earnings with CSV export.',
      icon: <TrendingUp className="w-5 h-5" />,
    },
    expenses: {
      title: 'Expenses',
      desc: 'Log software, subcontractors, equipment, and project expenses.',
      icon: <TrendingDown className="w-5 h-5" />,
    },
    profitability: {
      title: 'Profitability',
      desc: 'Compare project income, expenses, hours logged, and estimated hourly yield.',
      icon: <DollarSign className="w-5 h-5" />,
    },
  }[mode];

  return (
    <div className="space-y-6">
      <PageHeader
        title={pageMeta.title}
        description={pageMeta.desc}
        actions={
          mode !== 'profitability' ? (
            <>
              <Button
                variant="outline"
                onClick={handleExportCsv}
                disabled={filteredEntries.length === 0}
                icon={<Download className="w-4 h-4" />}
              >
                Export CSV
              </Button>
              <Button
                onClick={() => openCreate(mode === 'expenses' ? 'expense' : 'income')}
                icon={<Plus className="w-4 h-4" />}
              >
                {mode === 'expenses' ? 'Log Expense' : 'Log Income'}
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#172338] p-3 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2">
        <Info className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          Financial summaries are informational estimates computed from your logged records and are
          not certified accounting or tax filings.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <p className="text-xs text-slate-500">Recorded Income</p>
          <p className="text-2xl font-bold font-mono tabular-nums mt-1 text-emerald-600 dark:text-emerald-400">
            {formatMoney(totalIncome, defaultCurrency)}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Recorded Expenses</p>
          <p className="text-2xl font-bold font-mono tabular-nums mt-1 text-red-600 dark:text-red-400">
            {formatMoney(totalExpenses, defaultCurrency)}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Estimated Net Profit</p>
          <p className="text-2xl font-bold font-mono tabular-nums mt-1">
            {formatMoney(netProfit, defaultCurrency)}
          </p>
        </Card>
      </div>

      {mode === 'profitability' ? (
        <Card padding="none">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800">
            <CardHeader
              title="Project Profitability Breakdown"
              description="Net margin and effective hourly yield across tracked projects."
            />
          </div>
          {projectProfitability.length === 0 ? (
            <EmptyState
              icon={<DollarSign className="w-5 h-5" />}
              title="No projects to analyze"
              description="Create projects and log income, expenses, or time entries to calculate margins."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                    <th className="py-3 px-4">Project</th>
                    <th className="py-3 px-4 text-right">Income</th>
                    <th className="py-3 px-4 text-right">Expenses</th>
                    <th className="py-3 px-4 text-right">Net Profit</th>
                    <th className="py-3 px-4 text-right">Hours</th>
                    <th className="py-3 px-4 text-right">Yield / Hr</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {projectProfitability.map((row) => (
                    <tr key={row.id}>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900 dark:text-white">{row.name}</p>
                        <p className="text-xs text-slate-500">{row.clientName}</p>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-emerald-600 dark:text-emerald-400">
                        {formatMoney(row.income, row.currency)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-red-600 dark:text-red-400">
                        {formatMoney(row.expense, row.currency)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-semibold">
                        {formatMoney(row.net, row.currency)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs">
                        {row.hours.toFixed(1)}h
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs">
                        {row.hours > 0 ? formatMoney(row.effectiveRate, row.currency) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row justify-between gap-3">
            <div className="w-full sm:w-52">
              <Select
                aria-label="Filter by month"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                options={[
                  { value: 'all', label: 'All Months' },
                  ...months.map((m) => ({ value: m, label: m })),
                ]}
              />
            </div>
            <div className="w-full sm:w-64">
              <Input
                placeholder="Search category or description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
                aria-label="Search finance entries"
              />
            </div>
          </div>

          <DataTable
            data={filteredEntries}
            columns={entryColumns}
            keyExtractor={(f) => f.id}
            ariaLabel={`${pageMeta.title} table`}
            emptyState={
              <EmptyState
                icon={pageMeta.icon}
                title={`No ${mode} entries yet`}
                description="Log records manually or via invoice payments to build monthly summaries."
                action={
                  <Button
                    onClick={() => openCreate(mode === 'expenses' ? 'expense' : 'income')}
                    icon={<Plus className="w-4 h-4" />}
                  >
                    {mode === 'expenses' ? 'Add Expense' : 'Add Income'}
                  </Button>
                }
              />
            }
          />
        </>
      )}

      {/* Client Retainers Manager */}
      <Card>
        <CardHeader
          title={`Client Retainers (${retainers.length})`}
          description="Track monthly recurring retainer allocations used by Cashflow Forecasting."
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setRetClientId(clients[0]?.id ?? '');
                setRetainerModalOpen(true);
              }}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              New Retainer
            </Button>
          }
        />
        {retainers.length === 0 ? (
          <p className="text-xs text-slate-500">No client retainers configured yet.</p>
        ) : (
          <div className="space-y-2">
            {retainers.map((ret) => (
              <div
                key={ret.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs"
              >
                <div>
                  <span className="font-semibold">{ret.title}</span>
                  <span className="text-slate-500 ml-2">
                    ({clientMap.get(ret.clientId)?.name ?? 'Client'}) ·{' '}
                    {formatMoney(ret.monthlyAmount, ret.currency)}/mo · {ret.includedHours}h included
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={ret.status === 'active' ? 'success' : 'neutral'}>{ret.status}</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await repositories.deleteRetainer(ret.id);
                      await refresh();
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={entryType === 'expense' ? 'Log Expense' : 'Log Income'}
        size="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Description"
            required
            placeholder={entryType === 'expense' ? 'e.g. Figma subscription' : 'e.g. Strategy workshop'}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              options={(entryType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES).map(
                (c) => ({ value: c, label: c })
              )}
            />
            <Input
              label="Date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <Select
              label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              options={SUPPORTED_CURRENCIES.map((c) => ({ value: c.code, label: c.code }))}
            />
            <Input
              label="Amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Select
              label="Client (Optional)"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              options={[
                { value: '', label: 'None' },
                ...clients.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
            <Select
              label="Project (Optional)"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              options={[
                { value: '', label: 'None' },
                ...projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </div>
          <Input
            label="Tax Profile Tag (Optional)"
            placeholder="e.g. Deductible Software / Standard VAT"
            value={taxProfileName}
            onChange={(e) => setTaxProfileName(e.target.value)}
          />
          {entryType === 'expense' && (
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Attach Receipt (PNG/JPG/PDF &le; 1 MB)
              </label>
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.pdf"
                onChange={(e) => void handleReceiptSelected(e)}
                className="block w-full text-xs text-slate-600 dark:text-slate-300"
              />
              {receiptFileName && (
                <p className="text-xs text-emerald-600">Attached: {receiptFileName}</p>
              )}
            </div>
          )}
          <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save Entry
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={retainerModalOpen}
        onClose={() => setRetainerModalOpen(false)}
        title="Add Client Retainer"
        size="sm"
      >
        <form onSubmit={(e) => void handleSaveRetainer(e)} className="space-y-3">
          <Select
            label="Client"
            value={retClientId}
            onChange={(e) => setRetClientId(e.target.value)}
            options={clients.map((c) => ({ value: c.id, label: c.name }))}
          />
          <Input
            label="Retainer Title"
            required
            placeholder="e.g. Monthly DevOps & UI Retainer"
            value={retTitle}
            onChange={(e) => setRetTitle(e.target.value)}
          />
          <Input
            label={`Monthly Amount (${defaultCurrency})`}
            type="number"
            min="0"
            value={retMonthlyAmount}
            onChange={(e) => setRetMonthlyAmount(e.target.value)}
          />
          <Input
            label="Included Monthly Hours"
            type="number"
            min="0"
            value={retIncludedHours}
            onChange={(e) => setRetIncludedHours(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setRetainerModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Retainer</Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await repositories.deleteFinanceEntry(deleteTarget.id);
          setDeleteTarget(null);
          await refresh();
          pushToast({ tone: 'info', title: 'Finance entry deleted' });
        }}
        title="Delete Entry"
        description={`Delete "${deleteTarget?.description}"?`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
};
