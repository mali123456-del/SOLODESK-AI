import React, { useMemo, useState } from 'react';
import { AlertTriangle, CreditCard, Plus, Search, Trash2 } from 'lucide-react';
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
  Textarea,
  useToast,
  type ColumnDef,
} from '../../components/ui';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import { repositories } from '../../database/repositories/dexieRepositories';
import { formatDisplayDate, todayDateStr } from '../../domain/calculations/dates';
import { formatMoney } from '../../domain/calculations/money';
import type { Payment, PaymentMethod } from '../../domain/schemas/entities';

export const PaymentsView: React.FC = () => {
  const { payments, invoices, clients, settings, refresh } = useWorkspace();
  const { pushToast } = useToast();

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);

  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayDateStr());
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dateFormat = settings?.dateFormat ?? 'DD MMM YYYY';
  const defaultCurrency = settings?.defaultCurrency ?? 'USD';

  const invoiceMap = useMemo(() => new Map(invoices.map((i) => [i.id, i])), [invoices]);
  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const payableInvoices = useMemo(
    () => invoices.filter((i) => i.status !== 'cancelled' && i.balanceDue > 0),
    [invoices]
  );

  const selectedInvoice = invoiceMap.get(invoiceId);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter((p) => {
      const inv = invoiceMap.get(p.invoiceId);
      const cli = clientMap.get(p.clientId);
      return (
        (inv?.number.toLowerCase().includes(q) ?? false) ||
        (cli?.name.toLowerCase().includes(q) ?? false) ||
        p.reference.toLowerCase().includes(q)
      );
    });
  }, [payments, search, invoiceMap, clientMap]);

  const openCreate = (preselectInvoiceId?: string) => {
    const targetInv =
      (preselectInvoiceId ? invoiceMap.get(preselectInvoiceId) : undefined) ??
      payableInvoices[0];
    setInvoiceId(targetInv?.id ?? '');
    setAmount(targetInv ? String(targetInv.balanceDue) : '');
    setPaymentDate(todayDateStr());
    setMethod('bank_transfer');
    setReference('');
    setNotes('');
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const inv = invoiceMap.get(invoiceId);
    if (!inv) {
      setErrorMsg('Please select an invoice.');
      return;
    }
    const parsedAmt = Number(amount);
    if (!Number.isFinite(parsedAmt) || parsedAmt <= 0) {
      setErrorMsg('Enter a payment amount greater than 0.');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      await repositories.recordPayment({
        invoiceId: inv.id,
        clientId: inv.clientId,
        amount: parsedAmt,
        currency: inv.currency,
        paymentDate,
        method,
        reference: reference.trim(),
        notes: notes.trim(),
        isDemo: false,
      });
      await refresh();
      setModalOpen(false);
      pushToast({
        tone: 'success',
        title: 'Payment recorded',
        description: `${formatMoney(parsedAmt, inv.currency)} applied to ${inv.number}.`,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to record payment.');
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<Payment>[] = [
    {
      key: 'invoice',
      header: 'Invoice & Client',
      render: (p) => {
        const inv = invoiceMap.get(p.invoiceId);
        const cli = clientMap.get(p.clientId);
        return (
          <div>
            <p className="font-mono font-semibold text-slate-900 dark:text-white">
              {inv?.number ?? 'Invoice'}
            </p>
            <p className="text-xs text-slate-500">{cli?.name ?? 'Client'}</p>
          </div>
        );
      },
    },
    {
      key: 'method',
      header: 'Method',
      render: (p) => (
        <div>
          <Badge tone="neutral">{p.method.replace('_', ' ')}</Badge>
          {p.reference && <p className="text-xs font-mono text-slate-500 mt-0.5">{p.reference}</p>}
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Payment Date',
      sortValue: (p) => p.paymentDate,
      render: (p) => (
        <span className="text-xs text-slate-600 dark:text-slate-300">
          {formatDisplayDate(p.paymentDate, dateFormat)}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sortValue: (p) => p.amount,
      render: (p) => (
        <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
          {formatMoney(p.amount, p.currency)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setDeleteTarget(p);
          }}
          aria-label="Delete payment"
          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
      ),
    },
  ];

  const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalOutstanding = payableInvoices.reduce((sum, i) => sum + i.balanceDue, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Log full or partial manual payments against invoices and automatically sync balances and income."
        actions={
          <Button
            onClick={() => openCreate()}
            disabled={payableInvoices.length === 0}
            icon={<Plus className="w-4 h-4" />}
          >
            Record Payment
          </Button>
        }
      />

      <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="font-semibold">Offline Manual Ledger Active — Automated Gateway Settlement Blocked</p>
          <p className="mt-0.5">
            Recording payments updates invoice balances and income records atomically in local
            IndexedDB. Automated live card checkout (Stripe, Safepay, PayFast, or JazzCash) remains
            disabled until verified merchant API credentials are provisioned.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <p className="text-xs text-slate-500">Total Payments Logged</p>
          <p className="text-2xl font-bold font-mono tabular-nums mt-1">
            {formatMoney(totalCollected, defaultCurrency)}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Open Invoice Balances</p>
          <p className="text-2xl font-bold font-mono tabular-nums mt-1 text-[#2563EB]">
            {formatMoney(totalOutstanding, defaultCurrency)}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Invoices Awaiting Payment</p>
          <p className="text-2xl font-bold font-mono tabular-nums mt-1">{payableInvoices.length}</p>
        </Card>
      </div>

      <div className="flex justify-end">
        <div className="w-full sm:w-72">
          <Input
            placeholder="Search invoice #, client, reference..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
            aria-label="Search payments"
          />
        </div>
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        keyExtractor={(p) => p.id}
        ariaLabel="Payments table"
        emptyState={
          <EmptyState
            icon={<CreditCard className="w-5 h-5" />}
            title="No payments recorded yet"
            description="Record a manual or partial payment when a client settles an invoice."
            action={
              payableInvoices.length > 0 ? (
                <Button onClick={() => openCreate()} icon={<Plus className="w-4 h-4" />}>
                  Record Payment
                </Button>
              ) : undefined
            }
          />
        }
      />

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Record Manual Payment"
        description="Updates invoice balance and adds a linked income record atomically."
        size="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {errorMsg && (
            <div role="alert" className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-xs">
              {errorMsg}
            </div>
          )}

          <Select
            label="Invoice"
            required
            value={invoiceId}
            onChange={(e) => {
              const id = e.target.value;
              setInvoiceId(id);
              const inv = invoiceMap.get(id);
              if (inv) setAmount(String(inv.balanceDue));
            }}
            options={payableInvoices.map((i) => ({
              value: i.id,
              label: `${i.number} — ${clientMap.get(i.clientId)?.name ?? 'Client'} (Due: ${formatMoney(i.balanceDue, i.currency)})`,
            }))}
          />

          {selectedInvoice && (
            <p className="text-xs text-slate-500">
              Total: {formatMoney(selectedInvoice.total, selectedInvoice.currency)} · Remaining Balance:{' '}
              <span className="font-mono font-semibold">
                {formatMoney(selectedInvoice.balanceDue, selectedInvoice.currency)}
              </span>
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={`Amount (${selectedInvoice?.currency ?? defaultCurrency})`}
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Input
              label="Payment Date"
              type="date"
              required
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
            <Select
              label="Payment Method"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              options={[
                { value: 'bank_transfer', label: 'Bank Transfer' },
                { value: 'cash', label: 'Cash' },
                { value: 'card', label: 'Card' },
                { value: 'mobile_wallet', label: 'Mobile Wallet' },
                { value: 'check', label: 'Check' },
                { value: 'other', label: 'Other' },
              ]}
            />
            <Input
              label="Reference / Transaction ID"
              placeholder="Optional"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          <Textarea
            label="Notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save Payment
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await repositories.deletePayment(deleteTarget.id);
          setDeleteTarget(null);
          await refresh();
          pushToast({ tone: 'info', title: 'Payment removed and invoice balance recalculated' });
        }}
        title="Delete Payment"
        description="Deleting this payment will recalculate the linked invoice balance and remove the linked income entry."
        confirmLabel="Delete"
        danger
      />
    </div>
  );
};
