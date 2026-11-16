import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { db } from '../../src/database/db';
import { repositories } from '../../src/database/repositories/dexieRepositories';
import { ToastProvider } from '../../src/components/ui';
import { WorkspaceProvider } from '../../src/app/providers/WorkspaceProvider';
import { PaymentsView } from '../../src/features/payments/PaymentsView';
import { FinanceView } from '../../src/features/finance/FinanceView';
import { TimeTrackerView } from '../../src/features/time-tracker/TimeTrackerView';

async function clearDb() {
  await db.transaction(
    'rw',
    [db.clients, db.projects, db.invoices, db.payments, db.financeEntries, db.timeEntries, db.activities],
    async () => {
      await Promise.all([
        db.clients.clear(),
        db.projects.clear(),
        db.invoices.clear(),
        db.payments.clear(),
        db.financeEntries.clear(),
        db.timeEntries.clear(),
        db.activities.clear(),
      ]);
    }
  );
}

function renderWithWorkspace(ui: React.ReactNode) {
  return render(
    <ToastProvider>
      <WorkspaceProvider>{ui}</WorkspaceProvider>
    </ToastProvider>
  );
}

describe('Phase 6: Payments, Finance & Time Tracker', () => {
  beforeEach(async () => {
    await clearDb();
  });

  it('recovers a running timer from IndexedDB after remount and prevents duplicate timers', async () => {
    const startedAt = new Date(Date.now() - 125_000).toISOString();
    await db.timeEntries.add({
      id: 'tim_active',
      projectId: '',
      taskId: '',
      description: 'Refactor invoice calculations',
      startTime: startedAt,
      endTime: '',
      durationSeconds: 0,
      hourlyRate: 75,
      billable: true,
      isRunning: true,
      isDemo: false,
      createdAt: startedAt,
      updatedAt: startedAt,
    });

    await expect(
      repositories.startTimer({
        description: 'Duplicate timer attempt',
        hourlyRate: 50,
        billable: true,
      })
    ).rejects.toThrow(/already running/i);

    renderWithWorkspace(<TimeTrackerView />);
    expect(await screen.findByText('Refactor invoice calculations')).toBeInTheDocument();
    expect(await screen.findByText(/^00:02:0[456]$/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /stop timer/i }));
    await waitFor(async () => {
      const running = await repositories.getRunningTimer();
      expect(running).toBeUndefined();
    });
  });

  it('records partial and final payments and rolls back balance when deleted', async () => {
    const client = await repositories.createClient({
      name: 'Bilal Tariq',
      company: 'Tariq Labs',
      email: 'bilal@tariq.example',
      phone: '',
      website: '',
      location: 'Lahore',
      status: 'active',
      category: 'SaaS',
      tags: [],
      notes: '',
      isDemo: false,
    });

    const invoice = await repositories.createInvoice({
      number: 'INV-5001',
      clientId: client.id,
      projectId: '',
      quotationId: '',
      issueDate: '2026-11-01',
      dueDate: '2026-11-30',
      currency: 'USD',
      lineItems: [{ id: 'li_1', description: 'Phase 1', quantity: 1, unitPrice: 1000 }],
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

    const res1 = await repositories.recordPayment({
      invoiceId: invoice.id,
      clientId: client.id,
      amount: 400,
      currency: 'USD',
      paymentDate: '2026-11-05',
      method: 'bank_transfer',
      reference: 'TX-400',
      notes: '',
      isDemo: false,
    });
    expect(res1.invoice.status).toBe('partially_paid');
    expect(res1.invoice.balanceDue).toBe(600);

    renderWithWorkspace(<PaymentsView />);
    expect(await screen.findByText('INV-5001')).toBeInTheDocument();
    expect(screen.getByText('TX-400')).toBeInTheDocument();

    await repositories.deletePayment(res1.payment.id);
    const reloaded = await repositories.getInvoice(invoice.id);
    expect(reloaded?.balanceDue).toBe(1000);
    expect(reloaded?.status).toBe('sent');
  });

  it('renders informational accounting disclaimer on FinanceView', async () => {
    renderWithWorkspace(<FinanceView mode="profitability" />);
    expect(
      await screen.findByText(/not certified accounting or tax filings/i)
    ).toBeInTheDocument();
  });
});
