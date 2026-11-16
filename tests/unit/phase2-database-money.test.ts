import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addDaysToDateStr,
  formatDisplayDate,
  isDateOverdue,
  isValidDateOnly,
  secondsToDecimalHours,
} from '../../src/domain/calculations/dates';
import {
  addMoney,
  calculateDocumentTotals,
  calculatePaymentSummary,
} from '../../src/domain/calculations/money';
import { SolodeskDatabase } from '../../src/database/db';
import { DexieSolodeskRepositories } from '../../src/database/repositories/dexieRepositories';
import {
  clearDemoWorkspaceData,
  seedDemoWorkspace,
} from '../../src/database/seeds/demoWorkspace';

describe('Phase 2 — Decimal-Safe Financial Calculations', () => {
  it('avoids floating point drift on 0.1 + 0.2 and line items', () => {
    expect(addMoney(0.1, 0.2)).toBe(0.3);
    const result = calculateDocumentTotals({
      lineItems: [
        { id: '1', description: 'Dev', quantity: 3, unitPrice: 33.335 },
        { id: '2', description: 'QA', quantity: 1.5, unitPrice: 19.99 },
      ],
      discountType: 'percentage',
      discountValue: 10,
      taxRate: 16,
      taxInclusive: false,
    });
    // 3 * 33.335 = 100.01 (half-up), 1.5 * 19.99 = 29.99 (half-up) -> subtotal 130.00
    expect(result.subtotal).toBe(130);
    expect(result.discountAmount).toBe(13);
    expect(result.taxableAmount).toBe(117);
    expect(result.taxAmount).toBe(18.72);
    expect(result.total).toBe(135.72);
  });

  it('extracts tax accurately in tax-inclusive mode so net + tax equals total', () => {
    const result = calculateDocumentTotals({
      lineItems: [{ id: '1', description: 'Retainer', quantity: 1, unitPrice: 1000 }],
      discountType: 'fixed',
      discountValue: 100,
      taxRate: 15,
      taxInclusive: true,
    });
    expect(result.total).toBe(900);
    expect(addMoney(result.taxableAmount, result.taxAmount)).toBe(900);
    expect(result.taxableAmount).toBe(782.61);
    expect(result.taxAmount).toBe(117.39);
  });

  it('computes partial and full payment balances accurately', () => {
    const partial = calculatePaymentSummary(1000, [333.33, 333.33]);
    expect(partial.paidAmount).toBe(666.66);
    expect(partial.balanceDue).toBe(333.34);
    expect(partial.isPartiallyPaid).toBe(true);
    expect(partial.isFullyPaid).toBe(false);

    const paid = calculatePaymentSummary(1000, [333.33, 333.33, 333.34]);
    expect(paid.paidAmount).toBe(1000);
    expect(paid.balanceDue).toBe(0);
    expect(paid.isFullyPaid).toBe(true);
  });
});

describe('Phase 2 — Timezone-Safe Date & Duration Utilities', () => {
  it('validates calendar dates and rejects invalid Feb 30', () => {
    expect(isValidDateOnly('2026-02-28')).toBe(true);
    expect(isValidDateOnly('2026-02-30')).toBe(false);
    expect(isValidDateOnly('2024-02-29')).toBe(true);
  });

  it('preserves exact calendar days across DST boundaries', () => {
    // US DST spring forward & fall back boundaries
    expect(addDaysToDateStr('2026-03-07', 2)).toBe('2026-03-09');
    expect(addDaysToDateStr('2026-10-31', 3)).toBe('2026-11-03');
  });

  it('detects overdue dates and formats reliably', () => {
    expect(isDateOverdue('2026-11-10', '2026-11-15')).toBe(true);
    expect(isDateOverdue('2026-11-15', '2026-11-15')).toBe(false);
    expect(formatDisplayDate('2026-11-15', 'DD MMM YYYY')).toBe('15 Nov 2026');
    expect(secondsToDecimalHours(5400)).toBe(1.5);
  });
});

describe('Phase 2 — Dexie Repositories & Data Integrity', () => {
  let testDb: SolodeskDatabase;
  let repo: DexieSolodeskRepositories;

  beforeEach(() => {
    testDb = new SolodeskDatabase(`solodesk_test_${Math.random().toString(36).slice(2)}`);
    repo = new DexieSolodeskRepositories(testDb);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('enforces client existence, duplicate detection, and unique invoice numbers', async () => {
    const client = await repo.createClient({
      name: 'Acme Client',
      company: 'Acme Co',
      email: 'billing@acme.test',
      phone: '',
      website: '',
      location: '',
      status: 'active',
      category: 'Software',
      tags: ['VIP'],
      notes: '',
      isDemo: false,
    });

    const dups = await repo.findDuplicateClients({ email: 'BILLING@ACME.TEST' });
    expect(dups).toHaveLength(1);

    await repo.createInvoice({
      number: 'INV-9001',
      clientId: client.id,
      projectId: '',
      quotationId: '',
      issueDate: '2026-11-15',
      dueDate: '2026-11-30',
      currency: 'USD',
      lineItems: [{ id: '1', description: 'Build', quantity: 1, unitPrice: 500 }],
      discountType: 'none',
      discountValue: 0,
      taxRate: 0,
      taxInclusive: false,
      subtotal: 500,
      discountAmount: 0,
      taxAmount: 0,
      total: 500,
      notes: '',
      paymentInstructions: '',
      status: 'sent',
      isDemo: false,
    });

    await expect(
      repo.createInvoice({
        number: 'INV-9001',
        clientId: client.id,
        projectId: '',
        quotationId: '',
        issueDate: '2026-11-15',
        dueDate: '2026-11-30',
        currency: 'USD',
        lineItems: [{ id: '1', description: 'Build 2', quantity: 1, unitPrice: 200 }],
        discountType: 'none',
        discountValue: 0,
        taxRate: 0,
        taxInclusive: false,
        subtotal: 200,
        discountAmount: 0,
        taxAmount: 0,
        total: 200,
        notes: '',
        paymentInstructions: '',
        status: 'sent',
        isDemo: false,
      })
    ).rejects.toThrow(/already exists/i);
  });

  it('converts accepted quotation into invoice atomically and blocks duplicate conversion', async () => {
    const client = await repo.createClient({
      name: 'Quote Client',
      company: '',
      email: 'q@test.local',
      phone: '',
      website: '',
      location: '',
      status: 'active',
      category: 'General',
      tags: [],
      notes: '',
      isDemo: false,
    });

    const quote = await repo.createQuotation({
      clientId: client.id,
      projectId: '',
      title: 'Website Scope',
      issueDate: '2026-11-15',
      expiryDate: '2026-11-30',
      currency: 'PKR',
      lineItems: [{ id: 'q1', description: 'Design', quantity: 2, unitPrice: 15000 }],
      discountType: 'none',
      discountValue: 0,
      taxRate: 0,
      taxInclusive: false,
      subtotal: 30000,
      discountAmount: 0,
      taxAmount: 0,
      total: 30000,
      notes: '',
      status: 'accepted',
      convertedInvoiceId: '',
      isDemo: false,
    });

    const converted = await repo.convertQuotationToInvoice(quote.id, '2026-11-29');
    expect(converted.quotation.status).toBe('converted');
    expect(converted.invoice.total).toBe(30000);
    expect(converted.invoice.currency).toBe('PKR');

    await expect(repo.convertQuotationToInvoice(quote.id, '2026-11-29')).rejects.toThrow(
      /already been converted/i
    );
  });

  it('records partial payments, updates invoice status, prevents overpayment, and logs income', async () => {
    const client = await repo.createClient({
      name: 'Pay Client',
      company: '',
      email: '',
      phone: '',
      website: '',
      location: '',
      status: 'active',
      category: 'General',
      tags: [],
      notes: '',
      isDemo: false,
    });
    const inv = await repo.createInvoice({
      clientId: client.id,
      projectId: '',
      quotationId: '',
      issueDate: '2026-11-15',
      dueDate: '2026-11-30',
      currency: 'USD',
      lineItems: [{ id: 'i1', description: 'Sprint', quantity: 1, unitPrice: 1000 }],
      discountType: 'none',
      discountValue: 0,
      taxRate: 0,
      taxInclusive: false,
      subtotal: 1000,
      discountAmount: 0,
      taxAmount: 0,
      total: 1000,
      notes: '',
      paymentInstructions: '',
      status: 'sent',
      isDemo: false,
    });

    const p1 = await repo.recordPayment({
      invoiceId: inv.id,
      clientId: client.id,
      amount: 400,
      currency: 'USD',
      paymentDate: '2026-11-15',
      method: 'bank_transfer',
      reference: 'TX-1',
      notes: '',
      isDemo: false,
    });
    expect(p1.invoice.status).toBe('partially_paid');
    expect(p1.invoice.balanceDue).toBe(600);

    await expect(
      repo.recordPayment({
        invoiceId: inv.id,
        clientId: client.id,
        amount: 700,
        currency: 'USD',
        paymentDate: '2026-11-16',
        method: 'bank_transfer',
        reference: 'TX-2',
        notes: '',
        isDemo: false,
      })
    ).rejects.toThrow(/exceeds remaining/i);

    const p2 = await repo.recordPayment({
      invoiceId: inv.id,
      clientId: client.id,
      amount: 600,
      currency: 'USD',
      paymentDate: '2026-11-16',
      method: 'bank_transfer',
      reference: 'TX-2',
      notes: '',
      isDemo: false,
    });
    expect(p2.invoice.status).toBe('paid');
    expect(p2.invoice.balanceDue).toBe(0);

    const finance = await repo.listFinanceEntries();
    expect(finance.filter((f) => f.type === 'income')).toHaveLength(2);
  });

  it('prevents duplicate running timers and clears only demo data without touching user data', async () => {
    const t1 = await repo.startTimer({
      description: 'Active work',
      hourlyRate: 50,
      billable: true,
    });
    await expect(
      repo.startTimer({ description: 'Second timer', hourlyRate: 50, billable: true })
    ).rejects.toThrow(/already running/i);

    const stopped = await repo.stopTimer(t1.id);
    expect(stopped.isRunning).toBe(false);
    expect(stopped.durationSeconds).toBeGreaterThanOrEqual(1);

    await repo.createClient({
      name: 'Real User Client',
      company: '',
      email: 'real@user.test',
      phone: '',
      website: '',
      location: '',
      status: 'active',
      category: 'General',
      tags: [],
      notes: '',
      isDemo: false,
    });
    await seedDemoWorkspace(testDb);
    expect((await repo.listClients()).length).toBeGreaterThan(1);

    await clearDemoWorkspaceData(testDb);
    const remaining = await repo.listClients();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe('Real User Client');
  });
});
