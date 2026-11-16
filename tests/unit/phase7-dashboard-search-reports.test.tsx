import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { db } from '../../src/database/db';
import { repositories } from '../../src/database/repositories/dexieRepositories';
import { ToastProvider } from '../../src/components/ui';
import { WorkspaceProvider } from '../../src/app/providers/WorkspaceProvider';
import { DashboardView } from '../../src/features/dashboard/DashboardView';
import { GlobalSearchView } from '../../src/features/search/GlobalSearchView';
import { NotificationsView } from '../../src/features/notifications/NotificationsView';

async function clearDb() {
  await db.transaction(
    'rw',
    [db.clients, db.projects, db.tasks, db.invoices, db.financeEntries, db.timeEntries, db.activities],
    async () => {
      await Promise.all([
        db.clients.clear(),
        db.projects.clear(),
        db.tasks.clear(),
        db.invoices.clear(),
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

describe('Phase 7: Dashboard, Global Search & Notifications', () => {
  beforeEach(async () => {
    await clearDb();
  });

  it('computes dashboard totals strictly from real IndexedDB records', async () => {
    await repositories.createFinanceEntry({
      type: 'income',
      category: 'Retainer',
      amount: 1500,
      currency: 'USD',
      date: '2026-11-05',
      clientId: '',
      projectId: '',
      invoiceId: '',
      paymentId: '',
      description: 'Monthly retainer',
      notes: '',
      isDemo: false,
    });
    await repositories.createFinanceEntry({
      type: 'expense',
      category: 'Software & Subscriptions',
      amount: 200,
      currency: 'USD',
      date: '2026-11-06',
      clientId: '',
      projectId: '',
      invoiceId: '',
      paymentId: '',
      description: 'Cloud IDE',
      notes: '',
      isDemo: false,
    });

    renderWithWorkspace(<DashboardView onNavigate={() => {}} />);

    const incomeMatches = await screen.findAllByText(/\$1,500\.00/);
    expect(incomeMatches.length).toBeGreaterThanOrEqual(1);
    const netMatches = screen.getAllByText(/\$1,300\.00/);
    expect(netMatches.length).toBeGreaterThanOrEqual(1);
  });

  it('searches across local IndexedDB clients and invoices', async () => {
    const client = await repositories.createClient({
      name: 'Farah Mansoor',
      company: 'Mansoor Ventures',
      email: 'farah@mansoor.example',
      phone: '',
      website: '',
      location: 'Dubai',
      status: 'active',
      category: 'Consulting',
      tags: [],
      notes: '',
      isDemo: false,
    });

    await repositories.createInvoice({
      number: 'INV-7788',
      clientId: client.id,
      projectId: '',
      quotationId: '',
      issueDate: '2026-10-01',
      dueDate: '2026-10-15',
      currency: 'USD',
      lineItems: [{ id: 'li_1', description: 'Audit', quantity: 1, unitPrice: 500 }],
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
      status: 'overdue',
      isDemo: false,
    });

    renderWithWorkspace(<GlobalSearchView onNavigate={() => {}} />);
    const input = await screen.findByLabelText(/global workspace search/i);
    fireEvent.change(input, { target: { value: 'INV-7788' } });
    expect(await screen.findByText('INV-7788')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'Farah' } });
    expect(await screen.findByText('Farah Mansoor')).toBeInTheDocument();
  });

  it('surfaces overdue invoice alerts in NotificationsView', async () => {
    const client = await repositories.createClient({
      name: 'Client Alert',
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

    await repositories.createInvoice({
      number: 'INV-OVERDUE-1',
      clientId: client.id,
      projectId: '',
      quotationId: '',
      issueDate: '2025-01-01',
      dueDate: '2025-01-15',
      currency: 'USD',
      lineItems: [{ id: 'li_1', description: 'Work', quantity: 1, unitPrice: 250 }],
      discountType: 'none',
      discountValue: 0,
      taxRate: 0,
      taxInclusive: false,
      subtotal: 250,
      discountAmount: 0,
      taxAmount: 0,
      total: 250,
      notes: '',
      paymentInstructions: '',
      status: 'overdue',
      isDemo: false,
    });

    renderWithWorkspace(<NotificationsView onNavigate={() => {}} />);
    expect(await screen.findByText(/Overdue Invoice INV-OVERDUE-1/i)).toBeInTheDocument();
  });
});
