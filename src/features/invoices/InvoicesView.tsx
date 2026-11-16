import React, { useMemo, useState } from 'react';
import {
  CreditCard,
  Download,
  Edit3,
  Eye,
  Plus,
  Printer,
  Receipt,
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
  type Invoice,
  type InvoiceStatus,
  type LineItem,
} from '../../domain/schemas/entities';
import { generateInvoicePdf } from '../../pdf/pdfGenerator';

interface InvoicesViewProps {
  onNavigate?: (route: 'payments') => void;
}

export const InvoicesView: React.FC<InvoicesViewProps> = ({ onNavigate }) => {
  const { invoices, clients, projects, serviceCatalog, businessProfile, settings, refresh } =
    useWorkspace();
  const { pushToast } = useToast();

  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);

  const defaultCurrency = settings?.defaultCurrency ?? 'USD';
  const dateFormat = settings?.dateFormat ?? 'DD MMM YYYY';

  const [customNumber, setCustomNumber] = useState('');
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [issueDate, setIssueDate] = useState(todayDateStr());
  const [dueDate, setDueDate] = useState(addDaysToDateStr(todayDateStr(), 14));
  const [currency, setCurrency] = useState(defaultCurrency);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: createId('li'), description: '', quantity: 1, unitPrice: 0 },
  ]);
  const [discountType, setDiscountType] = useState<DiscountType>('none');
  const [discountValue, setDiscountValue] = useState('0');
  const [taxRate, setTaxRate] = useState(String(settings?.defaultTaxRate ?? 0));
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [notes, setNotes] = useState('');
  const [paymentInstructions, setPaymentInstructions] = useState(
    businessProfile?.paymentInstructions ?? ''
  );
  const [status, setStatus] = useState<InvoiceStatus>('draft');
  const [formError, setFormError] = useState<string | null>(null);
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
    return invoices.filter((inv) => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (!q) return true;
      return (
        inv.number.toLowerCase().includes(q) ||
        (clientMap.get(inv.clientId)?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [invoices, statusFilter, search, clientMap]);

  const selected = useMemo(
    () => invoices.find((i) => i.id === selectedId) ?? null,
    [invoices, selectedId]
  );

  const openCreate = () => {
    const today = todayDateStr();
    setEditing(null);
    setFormError(null);
    setCustomNumber('');
    setClientId(clients[0]?.id ?? '');
    setProjectId('');
    setIssueDate(today);
    setDueDate(addDaysToDateStr(today, 14));
    setCurrency(defaultCurrency);
    setLineItems([{ id: createId('li'), description: '', quantity: 1, unitPrice: 0 }]);
    setDiscountType('none');
    setDiscountValue('0');
    setTaxRate(String(settings?.defaultTaxRate ?? 0));
    setTaxInclusive(false);
    setNotes('');
    setPaymentInstructions(businessProfile?.paymentInstructions ?? '');
    setStatus('draft');
    setModalOpen(true);
  };

  const openEdit = (inv: Invoice) => {
    setEditing(inv);
    setFormError(null);
    setCustomNumber(inv.number);
    setClientId(inv.clientId);
    setProjectId(inv.projectId);
    setIssueDate(inv.issueDate);
    setDueDate(inv.dueDate);
    setCurrency(inv.currency);
    setLineItems(inv.lineItems.map((l) => ({ ...l })));
    setDiscountType(inv.discountType);
    setDiscountValue(String(inv.discountValue));
    setTaxRate(String(inv.taxRate));
    setTaxInclusive(inv.taxInclusive);
    setNotes(inv.notes);
    setPaymentInstructions(inv.paymentInstructions);
    setStatus(inv.status);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = lineItems.filter((l) => l.description.trim() && l.quantity > 0);
    if (!clientId || validLines.length === 0) {
      setFormError('Client and at least one valid line item are required.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        clientId,
        projectId,
        quotationId: editing?.quotationId ?? '',
        issueDate,
        dueDate,
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
        paymentInstructions,
        status,
      };
      if (editing) {
        const updated = await repositories.updateInvoice(editing.id, {
          ...payload,
          number: customNumber.trim() || editing.number,
        });
        setSelectedId(updated.id);
        pushToast({ tone: 'success', title: 'Invoice updated', description: updated.number });
      } else {
        const created = await repositories.createInvoice({
          ...payload,
          number: customNumber.trim() || undefined,
          isDemo: false,
        });
        setSelectedId(created.id);
        pushToast({ tone: 'success', title: 'Invoice created', description: created.number });
      }
      await refresh();
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save invoice.');
    } finally {
      setSaving(false);
    }
  };

  const statusTone = (st: InvoiceStatus) =>
    st === 'paid'
      ? 'success'
      : st === 'partially_paid' || st === 'sent'
        ? 'info'
        : st === 'overdue'
          ? 'danger'
          : 'neutral';

  const columns: ColumnDef<Invoice>[] = [
    {
      key: 'number',
      header: 'Invoice #',
      sortValue: (i) => i.number,
      render: (i) => (
        <div>
          <p className="font-mono font-semibold text-slate-900 dark:text-white">{i.number}</p>
          <p className="text-xs text-slate-500">{clientMap.get(i.clientId)?.name ?? 'Client'}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (i) => <Badge tone={statusTone(i.status)}>{i.status.replace('_', ' ')}</Badge>,
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      sortValue: (i) => i.total,
      render: (i) => <span className="font-mono text-xs">{formatMoney(i.total, i.currency)}</span>,
    },
    {
      key: 'balanceDue',
      header: 'Balance Due',
      align: 'right',
      sortValue: (i) => i.balanceDue,
      render: (i) => (
        <span className="font-mono text-xs font-semibold">
          {formatMoney(i.balanceDue, i.currency)}
        </span>
      ),
    },
    {
      key: 'dueDate',
      header: 'Due Date',
      sortValue: (i) => i.dueDate,
      render: (i) => (
        <span className="text-xs text-slate-500">{formatDisplayDate(i.dueDate, dateFormat)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Generate numbered invoices with line items, taxes, discounts, live preview, PDF download, and print."
        actions={
          <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>
            New Invoice
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Tabs
          activeId={statusFilter}
          onChange={(id) => setStatusFilter(id as typeof statusFilter)}
          items={[
            { id: 'all', label: 'All', count: invoices.length },
            { id: 'draft', label: 'Draft', count: invoices.filter((i) => i.status === 'draft').length },
            { id: 'sent', label: 'Sent', count: invoices.filter((i) => i.status === 'sent').length },
            { id: 'overdue', label: 'Overdue', count: invoices.filter((i) => i.status === 'overdue').length },
            { id: 'paid', label: 'Paid', count: invoices.filter((i) => i.status === 'paid').length },
          ]}
        />
        <div className="w-full sm:w-64">
          <Input
            placeholder="Search invoice # or client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
            aria-label="Search invoices"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className={selected ? 'xl:col-span-2' : 'xl:col-span-3'}>
          <DataTable
            data={filtered}
            columns={columns}
            keyExtractor={(i) => i.id}
            onRowClick={(i) => setSelectedId(i.id)}
            ariaLabel="Invoices table"
            emptyState={
              <EmptyState
                icon={<Receipt className="w-5 h-5" />}
                title="No invoices yet"
                description="Create an invoice directly or convert an accepted quotation."
                action={
                  clients.length > 0 ? (
                    <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>
                      Create Invoice
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
                <p className="text-base font-mono font-bold text-slate-900 dark:text-white">
                  {selected.number}
                </p>
                <p className="text-xs text-slate-500">
                  {clientMap.get(selected.clientId)?.name ?? 'Client'} · Due{' '}
                  {formatDisplayDate(selected.dueDate, dateFormat)}
                </p>
              </div>
              <Badge tone={statusTone(selected.status)}>{selected.status.replace('_', ' ')}</Badge>
            </div>

            <div className="flex flex-wrap gap-2">
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
                variant="outline"
                onClick={() => setPreviewInvoice(selected)}
                icon={<Eye className="w-3.5 h-3.5" />}
              >
                Preview
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  void generateInvoicePdf(
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
              {selected.balanceDue > 0 && selected.status !== 'cancelled' && onNavigate && (
                <Button
                  size="sm"
                  onClick={() => onNavigate('payments')}
                  icon={<CreditCard className="w-3.5 h-3.5" />}
                >
                  Record Payment
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeleteTarget(selected)}
                aria-label="Delete invoice"
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
              <div className="border-t border-slate-100 dark:border-slate-800 pt-2 space-y-1 font-mono tabular-nums">
                <div className="flex justify-between">
                  <span className="text-slate-500">Total</span>
                  <span className="font-semibold">{formatMoney(selected.total, selected.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Paid</span>
                  <span>{formatMoney(selected.amountPaid, selected.currency)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm pt-1">
                  <span>Balance Due</span>
                  <span>{formatMoney(selected.balanceDue, selected.currency)}</span>
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Create / Edit Modal */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit Invoice ${editing.number}` : 'Create Invoice'}
        size="xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <div role="alert" className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-xs">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Input
              label="Invoice Number"
              placeholder="Auto-generated if blank"
              value={customNumber}
              onChange={(e) => setCustomNumber(e.target.value)}
            />
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
              label="Issue Date"
              type="date"
              required
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
            <Input
              label="Due Date"
              type="date"
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            <Select
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
              options={[
                { value: 'draft', label: 'Draft' },
                { value: 'sent', label: 'Sent' },
                { value: 'partially_paid', label: 'Partially Paid' },
                { value: 'paid', label: 'Paid' },
                { value: 'overdue', label: 'Overdue' },
                { value: 'cancelled', label: 'Cancelled' },
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
                    placeholder="Service or milestone"
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
              <span>Tax-inclusive line pricing</span>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Textarea
              label="Payment Instructions"
              rows={2}
              value={paymentInstructions}
              onChange={(e) => setPaymentInstructions(e.target.value)}
            />
            <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? 'Save Invoice' : 'Create Invoice'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Printable Preview Modal */}
      <Dialog
        open={Boolean(previewInvoice)}
        onClose={() => setPreviewInvoice(null)}
        title={previewInvoice ? `Invoice Preview — ${previewInvoice.number}` : 'Invoice Preview'}
        size="xl"
      >
        {previewInvoice && (
          <div className="space-y-5 text-sm">
            <div className="flex justify-between items-start border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {businessProfile?.businessName || 'My Freelance Studio'}
                </h3>
                <p className="text-xs text-slate-500">
                  {businessProfile?.email} {businessProfile?.phone ? `· ${businessProfile.phone}` : ''}
                </p>
                {businessProfile?.address && (
                  <p className="text-xs text-slate-500">{businessProfile.address}</p>
                )}
              </div>
              <div className="text-right font-mono text-xs space-y-0.5">
                <p className="text-base font-bold text-[#2563EB]">{previewInvoice.number}</p>
                <p>Issue: {formatDisplayDate(previewInvoice.issueDate, dateFormat)}</p>
                <p>Due: {formatDisplayDate(previewInvoice.dueDate, dateFormat)}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-400">BILL TO</p>
              <p className="font-semibold text-slate-900 dark:text-white">
                {clientMap.get(previewInvoice.clientId)?.name ?? 'Client'}
              </p>
              <p className="text-xs text-slate-500">
                {clientMap.get(previewInvoice.clientId)?.company} ·{' '}
                {clientMap.get(previewInvoice.clientId)?.email}
              </p>
            </div>

            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-2 text-left">Description</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Unit Price</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {previewInvoice.lineItems.map((li) => (
                  <tr key={li.id}>
                    <td className="py-2">{li.description}</td>
                    <td className="py-2 text-right font-mono">{li.quantity}</td>
                    <td className="py-2 text-right font-mono">
                      {formatMoney(li.unitPrice, previewInvoice.currency)}
                    </td>
                    <td className="py-2 text-right font-mono">
                      {formatMoney(
                        calculateLineItemTotal(li.quantity, li.unitPrice),
                        previewInvoice.currency
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end">
              <div className="w-64 space-y-1 text-xs font-mono tabular-nums">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatMoney(previewInvoice.subtotal, previewInvoice.currency)}</span>
                </div>
                {previewInvoice.discountAmount > 0 && (
                  <div className="flex justify-between">
                    <span>Discount</span>
                    <span>-{formatMoney(previewInvoice.discountAmount, previewInvoice.currency)}</span>
                  </div>
                )}
                {previewInvoice.taxRate > 0 && (
                  <div className="flex justify-between">
                    <span>Tax ({previewInvoice.taxRate}%)</span>
                    <span>{formatMoney(previewInvoice.taxAmount, previewInvoice.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm border-t border-slate-200 dark:border-slate-800 pt-1">
                  <span>Total</span>
                  <span>{formatMoney(previewInvoice.total, previewInvoice.currency)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Paid</span>
                  <span>{formatMoney(previewInvoice.amountPaid, previewInvoice.currency)}</span>
                </div>
                <div className="flex justify-between font-bold text-[#2563EB]">
                  <span>Balance Due</span>
                  <span>{formatMoney(previewInvoice.balanceDue, previewInvoice.currency)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800 no-print">
              <Button
                variant="outline"
                onClick={() => window.print()}
                icon={<Printer className="w-4 h-4" />}
              >
                Print
              </Button>
              <Button
                onClick={() =>
                  void generateInvoicePdf(
                    previewInvoice,
                    clientMap.get(previewInvoice.clientId),
                    businessProfile,
                    dateFormat
                  )
                }
                icon={<Download className="w-4 h-4" />}
              >
                Download PDF
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await repositories.deleteInvoice(deleteTarget.id);
            setSelectedId(null);
            setDeleteTarget(null);
            await refresh();
            pushToast({ tone: 'info', title: 'Invoice deleted' });
          } catch (err) {
            setDeleteTarget(null);
            pushToast({
              tone: 'error',
              title: 'Cannot delete invoice',
              description: err instanceof Error ? err.message : 'Invoice has payments.',
            });
          }
        }}
        title="Delete Invoice"
        description={`Delete invoice "${deleteTarget?.number}"?`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
};
