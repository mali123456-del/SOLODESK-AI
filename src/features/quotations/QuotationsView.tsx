import React, { useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  Download,
  Edit3,
  FileSpreadsheet,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
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
  Tabs,
  Textarea,
  useToast,
  type ColumnDef,
} from '../../components/ui';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import { repositories } from '../../database/repositories/dexieRepositories';
import {
  addDaysToDateStr,
  formatDisplayDate,
  todayDateStr,
} from '../../domain/calculations/dates';
import {
  calculateDocumentTotals,
  calculateLineItemTotal,
  formatMoney,
  SUPPORTED_CURRENCIES,
  type DiscountType,
} from '../../domain/calculations/money';
import {
  createId,
  type LineItem,
  type Quotation,
  type QuotationStatus,
} from '../../domain/schemas/entities';
import { generateQuotationPdf } from '../../pdf/pdfGenerator';

interface QuotationsViewProps {
  onNavigate?: (route: 'invoices') => void;
}

export const QuotationsView: React.FC<QuotationsViewProps> = ({ onNavigate }) => {
  const { quotations, clients, projects, serviceCatalog, businessProfile, settings, refresh } =
    useWorkspace();
  const { pushToast } = useToast();

  const [statusFilter, setStatusFilter] = useState<'all' | QuotationStatus>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Quotation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Quotation | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const defaultCurrency = settings?.defaultCurrency ?? 'USD';
  const dateFormat = settings?.dateFormat ?? 'DD MMM YYYY';

  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [issueDate, setIssueDate] = useState(todayDateStr());
  const [expiryDate, setExpiryDate] = useState(addDaysToDateStr(todayDateStr(), 14));
  const [currency, setCurrency] = useState(defaultCurrency);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: createId('li'), description: '', quantity: 1, unitPrice: 0 },
  ]);
  const [discountType, setDiscountType] = useState<DiscountType>('none');
  const [discountValue, setDiscountValue] = useState('0');
  const [taxRate, setTaxRate] = useState(String(settings?.defaultTaxRate ?? 0));
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<QuotationStatus>('draft');
  const [saving, setSaving] = useState(false);

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const liveTotals = useMemo(
    () =>
      calculateDocumentTotals({
        lineItems: lineItems.map((i) => ({
          ...i,
          quantity: Number(i.quantity) || 0,
          unitPrice: Number(i.unitPrice) || 0,
        })),
        discountType,
        discountValue: Number(discountValue) || 0,
        taxRate: Number(taxRate) || 0,
        taxInclusive,
      }),
    [lineItems, discountType, discountValue, taxRate, taxInclusive]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quotations.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!q) return true;
      return (
        item.number.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        (clientMap.get(item.clientId)?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [quotations, statusFilter, search, clientMap]);

  const selected = useMemo(
    () => quotations.find((q) => q.id === selectedId) ?? null,
    [quotations, selectedId]
  );

  const openCreate = () => {
    const today = todayDateStr();
    setEditing(null);
    setClientId(clients[0]?.id ?? '');
    setProjectId('');
    setTitle('');
    setIssueDate(today);
    setExpiryDate(addDaysToDateStr(today, 14));
    setCurrency(defaultCurrency);
    setLineItems([{ id: createId('li'), description: '', quantity: 1, unitPrice: 0 }]);
    setDiscountType('none');
    setDiscountValue('0');
    setTaxRate(String(settings?.defaultTaxRate ?? 0));
    setTaxInclusive(false);
    setNotes('');
    setStatus('draft');
    setModalOpen(true);
  };

  const openEdit = (q: Quotation) => {
    setEditing(q);
    setClientId(q.clientId);
    setProjectId(q.projectId);
    setTitle(q.title);
    setIssueDate(q.issueDate);
    setExpiryDate(q.expiryDate);
    setCurrency(q.currency);
    setLineItems(q.lineItems.map((l) => ({ ...l })));
    setDiscountType(q.discountType);
    setDiscountValue(String(q.discountValue));
    setTaxRate(String(q.taxRate));
    setTaxInclusive(q.taxInclusive);
    setNotes(q.notes);
    setStatus(q.status);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = lineItems.filter((l) => l.description.trim() && l.quantity > 0);
    if (!clientId || !title.trim() || validLines.length === 0) {
      pushToast({
        tone: 'error',
        title: 'Missing details',
        description: 'Client, title, and at least one valid line item are required.',
      });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        clientId,
        projectId,
        title: title.trim(),
        issueDate,
        expiryDate,
        currency,
        lineItems: validLines,
        discountType,
        discountValue: Math.max(0, Number(discountValue) || 0),
        taxRate: Math.max(0, Math.min(100, Number(taxRate) || 0)),
        taxInclusive,
        subtotal: liveTotals.subtotal,
        discountAmount: liveTotals.discountAmount,
        taxAmount: liveTotals.taxAmount,
        total: liveTotals.total,
        notes,
        status,
        convertedInvoiceId: editing?.convertedInvoiceId ?? '',
      };

      if (editing) {
        const updated = await repositories.updateQuotation(editing.id, payload);
        setSelectedId(updated.id);
        pushToast({ tone: 'success', title: 'Quotation updated', description: updated.number });
      } else {
        const created = await repositories.createQuotation({ ...payload, isDemo: false });
        setSelectedId(created.id);
        pushToast({ tone: 'success', title: 'Quotation created', description: created.number });
      }
      await refresh();
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleConvertToInvoice = async (q: Quotation) => {
    setConvertingId(q.id);
    try {
      const dueDate = addDaysToDateStr(todayDateStr(), 14);
      const { invoice } = await repositories.convertQuotationToInvoice(q.id, dueDate);
      await refresh();
      pushToast({
        tone: 'success',
        title: 'Converted to invoice',
        description: `Created invoice ${invoice.number} from ${q.number}.`,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Conversion blocked',
        description: err instanceof Error ? err.message : 'Unable to convert quotation.',
      });
    } finally {
      setConvertingId(null);
    }
  };

  const columns: ColumnDef<Quotation>[] = [
    {
      key: 'number',
      header: 'Quotation',
      sortValue: (q) => q.number,
      render: (q) => (
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{q.title}</p>
          <p className="text-xs font-mono text-slate-500">
            {q.number} · {clientMap.get(q.clientId)?.name ?? 'Client'}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (q) => (
        <Badge
          tone={
            q.status === 'converted' || q.status === 'accepted'
              ? 'success'
              : q.status === 'sent'
                ? 'info'
                : q.status === 'rejected' || q.status === 'expired'
                  ? 'danger'
                  : 'neutral'
          }
        >
          {q.status}
        </Badge>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      sortValue: (q) => q.total,
      render: (q) => <span className="font-mono text-xs">{formatMoney(q.total, q.currency)}</span>,
    },
    {
      key: 'expiryDate',
      header: 'Valid Until',
      render: (q) => (
        <span className="text-xs text-slate-500">{formatDisplayDate(q.expiryDate, dateFormat)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotations"
        description="Build priced estimates, export PDFs, and convert accepted quotations into invoices atomically."
        actions={
          <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>
            New Quotation
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Tabs
          activeId={statusFilter}
          onChange={(id) => setStatusFilter(id as typeof statusFilter)}
          items={[
            { id: 'all', label: 'All', count: quotations.length },
            { id: 'draft', label: 'Draft', count: quotations.filter((q) => q.status === 'draft').length },
            { id: 'sent', label: 'Sent', count: quotations.filter((q) => q.status === 'sent').length },
            { id: 'accepted', label: 'Accepted', count: quotations.filter((q) => q.status === 'accepted').length },
            { id: 'converted', label: 'Converted', count: quotations.filter((q) => q.status === 'converted').length },
          ]}
        />
        <div className="w-full sm:w-64">
          <Input
            placeholder="Search quotations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
            aria-label="Search quotations"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className={selected ? 'xl:col-span-2' : 'xl:col-span-3'}>
          <DataTable
            data={filtered}
            columns={columns}
            keyExtractor={(q) => q.id}
            onRowClick={(q) => setSelectedId(q.id)}
            ariaLabel="Quotations table"
            emptyState={
              <EmptyState
                icon={<FileSpreadsheet className="w-5 h-5" />}
                title="No quotations yet"
                description="Create itemized price estimates and convert them to invoices in one click."
                action={
                  clients.length > 0 ? (
                    <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>
                      Create Quotation
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        </div>

        {selected && (
          <Card className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-mono text-slate-500">{selected.number}</p>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{selected.title}</h2>
                <p className="text-xs text-slate-500">
                  {clientMap.get(selected.clientId)?.name ?? 'Client'} ·{' '}
                  {formatDisplayDate(selected.issueDate, dateFormat)}
                </p>
              </div>
              <Badge tone={selected.status === 'converted' ? 'success' : 'info'}>
                {selected.status}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              {selected.status !== 'converted' && !selected.convertedInvoiceId && (
                <Button
                  size="sm"
                  onClick={() => void handleConvertToInvoice(selected)}
                  loading={convertingId === selected.id}
                  icon={<ArrowRightLeft className="w-3.5 h-3.5" />}
                >
                  Convert to Invoice
                </Button>
              )}
              {selected.convertedInvoiceId && onNavigate && (
                <Button size="sm" variant="outline" onClick={() => onNavigate('invoices')}>
                  View Linked Invoice
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => openEdit(selected)}
                icon={<Edit3 className="w-3.5 h-3.5" />}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  void generateQuotationPdf(
                    selected,
                    clientMap.get(selected.clientId),
                    businessProfile,
                    dateFormat
                  )
                }
                icon={<Download className="w-3.5 h-3.5" />}
              >
                PDF
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeleteTarget(selected)}
                aria-label="Delete quotation"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-600" />
              </Button>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2 text-xs">
              {selected.lineItems.map((li) => (
                <div key={li.id} className="flex justify-between gap-2">
                  <span className="text-slate-700 dark:text-slate-200">
                    {li.description} ({li.quantity} × {formatMoney(li.unitPrice, selected.currency)})
                  </span>
                  <span className="font-mono shrink-0">
                    {formatMoney(calculateLineItemTotal(li.quantity, li.unitPrice), selected.currency)}
                  </span>
                </div>
              ))}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-2 flex justify-between font-bold text-sm">
                <span>Total</span>
                <span className="font-mono">{formatMoney(selected.total, selected.currency)}</span>
              </div>
            </div>
          </Card>
        )}
      </div>

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.number}` : 'Create Quotation'}
        size="xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Select
              label="Client"
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Select client"
              options={clients.map((c) => ({ value: c.id, label: c.name }))}
            />
            <Select
              label="Project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              options={[
                { value: '', label: 'None' },
                ...projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
            <Input
              label="Title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Input
              label="Issue Date"
              type="date"
              required
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
            <Input
              label="Valid Until"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
            <Select
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as QuotationStatus)}
              options={[
                { value: 'draft', label: 'Draft' },
                { value: 'sent', label: 'Sent' },
                { value: 'accepted', label: 'Accepted' },
                { value: 'rejected', label: 'Rejected' },
                { value: 'expired', label: 'Expired' },
              ]}
            />
          </div>

          <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Line Items</p>
              <div className="flex items-center gap-2">
                {serviceCatalog.filter((s) => s.active).length > 0 && (
                  <div className="w-48">
                    <Select
                      aria-label="Insert from Service Catalog"
                      value=""
                      onChange={(e) => {
                        const svc = serviceCatalog.find((s) => s.id === e.target.value);
                        if (!svc) return;
                        setLineItems((prev) => [
                          ...prev.filter((x) => x.description.trim() || x.unitPrice > 0),
                          {
                            id: createId('li'),
                            description: svc.name,
                            quantity: 1,
                            unitPrice: svc.defaultUnitPrice,
                          },
                        ]);
                      }}
                      options={[
                        { value: '', label: 'Insert service item…' },
                        ...serviceCatalog
                          .filter((s) => s.active)
                          .map((s) => ({
                            value: s.id,
                            label: `${s.name} (${formatMoney(s.defaultUnitPrice, s.currency)})`,
                          })),
                      ]}
                    />
                  </div>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setLineItems((prev) => [
                      ...prev,
                      { id: createId('li'), description: '', quantity: 1, unitPrice: 0 },
                    ])
                  }
                  icon={<Plus className="w-3.5 h-3.5" />}
                >
                  Add Item
                </Button>
              </div>
            </div>
            {lineItems.map((li, idx) => (
              <div key={li.id} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-12 sm:col-span-6">
                  <Input
                    label={idx === 0 ? 'Description' : undefined}
                    placeholder="Service or deliverable"
                    value={li.description}
                    onChange={(e) =>
                      setLineItems((prev) =>
                        prev.map((x) => (x.id === li.id ? { ...x, description: e.target.value } : x))
                      )
                    }
                  />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <Input
                    label={idx === 0 ? 'Qty' : undefined}
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={li.quantity}
                    onChange={(e) =>
                      setLineItems((prev) =>
                        prev.map((x) =>
                          x.id === li.id ? { ...x, quantity: Number(e.target.value) || 0 } : x
                        )
                      )
                    }
                  />
                </div>
                <div className="col-span-6 sm:col-span-3">
                  <Input
                    label={idx === 0 ? 'Unit Price' : undefined}
                    type="number"
                    step="0.01"
                    min="0"
                    value={li.unitPrice}
                    onChange={(e) =>
                      setLineItems((prev) =>
                        prev.map((x) =>
                          x.id === li.id ? { ...x, unitPrice: Number(e.target.value) || 0 } : x
                        )
                      )
                    }
                  />
                </div>
                <div className="col-span-2 sm:col-span-1 flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={lineItems.length <= 1}
                    onClick={() => setLineItems((prev) => prev.filter((x) => x.id !== li.id))}
                    aria-label="Remove line item"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Select
              label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              options={SUPPORTED_CURRENCIES.map((c) => ({ value: c.code, label: c.code }))}
            />
            <Select
              label="Discount"
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as DiscountType)}
              options={[
                { value: 'none', label: 'None' },
                { value: 'percentage', label: 'Percentage (%)' },
                { value: 'fixed', label: 'Fixed Amount' },
              ]}
            />
            <Input
              label="Discount Value"
              type="number"
              step="0.01"
              min="0"
              disabled={discountType === 'none'}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
            />
            <Input
              label="Tax Rate (%)"
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-slate-50 dark:bg-[#101827] p-3.5 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={taxInclusive}
                onChange={(e) => setTaxInclusive(e.target.checked)}
              />
              <span>Prices already include tax (tax-inclusive)</span>
            </label>
            <div className="space-y-0.5 text-right font-mono tabular-nums">
              <p>Subtotal: {formatMoney(liveTotals.subtotal, currency)}</p>
              {liveTotals.discountAmount > 0 && (
                <p>Discount: -{formatMoney(liveTotals.discountAmount, currency)}</p>
              )}
              <p>Tax: {formatMoney(liveTotals.taxAmount, currency)}</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                Total: {formatMoney(liveTotals.total, currency)}
              </p>
            </div>
          </div>

          <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? 'Save Quotation' : 'Create Quotation'}
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await repositories.deleteQuotation(deleteTarget.id);
          setSelectedId(null);
          setDeleteTarget(null);
          await refresh();
          pushToast({ tone: 'info', title: 'Quotation deleted' });
        }}
        title="Delete Quotation"
        description={`Delete quotation "${deleteTarget?.number}"?`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
};
