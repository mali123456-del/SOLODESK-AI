import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { db } from '../../src/database/db';
import { repositories } from '../../src/database/repositories/dexieRepositories';
import { ToastProvider } from '../../src/components/ui';
import { WorkspaceProvider } from '../../src/app/providers/WorkspaceProvider';
import { QuotationsView } from '../../src/features/quotations/QuotationsView';
import { InvoicesView } from '../../src/features/invoices/InvoicesView';
import { ContractsView } from '../../src/features/contracts/ContractsView';

async function clearDb() {
  await db.transaction(
    'rw',
    [
      db.clients,
      db.projects,
      db.proposals,
      db.quotations,
      db.contracts,
      db.invoices,
      db.payments,
      db.activities,
      db.appSettings,
    ],
    async () => {
      await Promise.all([
        db.clients.clear(),
        db.projects.clear(),
        db.proposals.clear(),
        db.quotations.clear(),
        db.contracts.clear(),
        db.invoices.clear(),
        db.payments.clear(),
        db.activities.clear(),
        db.appSettings.clear(),
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

describe('Phase 5: Business Document Studio', () => {
  beforeEach(async () => {
    await clearDb();
  });

  it('converts a quotation to an invoice once and prevents duplicate conversion', async () => {
    const client = await repositories.createClient({
      name: 'Hina Siddiqui',
      company: 'Siddiqui Studio',
      email: 'hina@siddiqui.example',
      phone: '',
      website: '',
      location: 'Islamabad',
      status: 'active',
      category: 'Design',
      tags: [],
      notes: '',
      isDemo: false,
    });

    await repositories.createQuotation({
      clientId: client.id,
      projectId: '',
      title: 'Brand Identity Package',
      issueDate: '2026-11-01',
      expiryDate: '2026-11-30',
      currency: 'USD',
      lineItems: [{ id: 'li_1', description: 'Visual Identity', quantity: 1, unitPrice: 1200 }],
      discountType: 'none',
      discountValue: 0,
      taxRate: 10,
      taxInclusive: false,
      subtotal: 1200,
      discountAmount: 0,
      taxAmount: 120,
      total: 1320,
      notes: '',
      status: 'accepted',
      convertedInvoiceId: '',
      isDemo: false,
    });

    renderWithWorkspace(<QuotationsView />);

    const row = await screen.findByText('Brand Identity Package');
    fireEvent.click(row);

    const convertBtn = await screen.findByRole('button', { name: /convert to invoice/i });
    fireEvent.click(convertBtn);

    await waitFor(async () => {
      const invoices = await repositories.listInvoices();
      expect(invoices).toHaveLength(1);
      expect(invoices[0].total).toBe(1320);
      const quotes = await repositories.listQuotations();
      expect(quotes[0].status).toBe('converted');
    });
  });

  it('prevents duplicate invoice numbers when creating invoices', async () => {
    const client = await repositories.createClient({
      name: 'Zain Raza',
      company: 'Raza Media',
      email: 'zain@raza.example',
      phone: '',
      website: '',
      location: 'Karachi',
      status: 'active',
      category: 'Media',
      tags: [],
      notes: '',
      isDemo: false,
    });

    await repositories.createInvoice({
      number: 'INV-9001',
      clientId: client.id,
      projectId: '',
      quotationId: '',
      issueDate: '2026-11-01',
      dueDate: '2026-11-15',
      currency: 'USD',
      lineItems: [{ id: 'li_1', description: 'Consulting', quantity: 2, unitPrice: 150 }],
      discountType: 'none',
      discountValue: 0,
      taxRate: 0,
      taxInclusive: false,
      subtotal: 300,
      discountAmount: 0,
      taxAmount: 0,
      total: 300,
      notes: '',
      paymentInstructions: '',
      status: 'sent',
      isDemo: false,
    });

    await expect(
      repositories.createInvoice({
        number: 'INV-9001',
        clientId: client.id,
        projectId: '',
        quotationId: '',
        issueDate: '2026-11-02',
        dueDate: '2026-11-16',
        currency: 'USD',
        lineItems: [{ id: 'li_2', description: 'Consulting', quantity: 1, unitPrice: 150 }],
        discountType: 'none',
        discountValue: 0,
        taxRate: 0,
        taxInclusive: false,
        subtotal: 150,
        discountAmount: 0,
        taxAmount: 0,
        total: 150,
        notes: '',
        paymentInstructions: '',
        status: 'draft',
        isDemo: false,
      })
    ).rejects.toThrow(/already exists/i);

    renderWithWorkspace(<InvoicesView />);
    expect(await screen.findByText('INV-9001')).toBeInTheDocument();
  });

  it('shows non-legal-advice disclaimer on ContractsView', async () => {
    renderWithWorkspace(<ContractsView />);
    expect(
      await screen.findByText(/do not constitute legal advice/i)
    ).toBeInTheDocument();
  });
});
