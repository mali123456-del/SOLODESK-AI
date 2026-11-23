import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '../../src/components/ui';
import { WorkspaceProvider } from '../../src/app/providers/WorkspaceProvider';
import { db } from '../../src/database/db';
import { repositories } from '../../src/database/repositories/dexieRepositories';
import { buildMonthlyRevenueTrend } from '../../src/domain/calculations/revenueTrend';
import type { Invoice } from '../../src/domain/schemas/entities';
import { DashboardView } from '../../src/features/dashboard/DashboardView';
import { TimeTrackerView } from '../../src/features/time-tracker/TimeTrackerView';
import {
  computeElapsedSecondsFromIso,
  createBackgroundTimerController,
} from '../../src/services/backgroundTimerService';

async function clearDashboardAndTimerStores() {
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

function makeInvoice(overrides: Partial<Invoice>): Invoice {
  return {
    id: 'inv_default',
    number: 'INV-001',
    clientId: 'cli_1',
    projectId: '',
    quotationId: '',
    issueDate: '2026-10-10',
    dueDate: '2026-10-24',
    currency: 'USD',
    lineItems: [{ id: 'li_1', description: 'Work', quantity: 1, unitPrice: 100 }],
    discountType: 'none',
    discountValue: 0,
    taxRate: 0,
    taxInclusive: false,
    subtotal: 100,
    discountAmount: 0,
    taxAmount: 0,
    total: 100,
    amountPaid: 0,
    balanceDue: 100,
    status: 'sent',
    notes: '',
    paymentInstructions: '',
    recurrenceRule: 'none',
    nextRecurrenceDate: '',
    exchangeRateToBase: 1,
    paymentSchedule: [],
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-10T00:00:00.000Z',
    isDemo: false,
    ...overrides,
  };
}

describe('Phase 96–99 Frontend Features: Web Worker Background Timer & Dashboard Revenue Trend', () => {
  beforeEach(async () => {
    await clearDashboardAndTimerStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('drives background timing via Web Worker, syncs on visibilitychange, and falls back gracefully on worker error', () => {
    const posted: unknown[] = [];
    let terminated = false;
    const mockWorker: {
      onmessage: ((e: MessageEvent) => void) | null;
      onerror: ((e: Event) => void) | null;
      postMessage: (msg: unknown) => void;
      terminate: () => void;
    } = {
      onmessage: null,
      onerror: null,
      postMessage: (msg: unknown) => {
        posted.push(msg);
      },
      terminate: () => {
        terminated = true;
      },
    };

    const ticks: Array<{ elapsedSeconds: number; mode: string }> = [];
    const controller = createBackgroundTimerController(
      (snap) => {
        ticks.push({ elapsedSeconds: snap.elapsedSeconds, mode: snap.mode });
      },
      { workerFactory: () => mockWorker as unknown as Worker, intervalMs: 500 }
    );

    expect(controller.mode).toBe('web-worker');
    const startIso = new Date(Date.now() - 12_000).toISOString();
    controller.start(startIso);
    expect(posted[0]).toEqual({ type: 'START', startTimeIso: startIso, intervalMs: 500 });
    expect(ticks.at(-1)?.elapsedSeconds).toBeGreaterThanOrEqual(11);

    // Simulate worker emitting TICK while tab was throttled in background
    mockWorker.onmessage?.({
      data: {
        type: 'TICK',
        nowMs: Date.now() + 30_000,
        elapsedSeconds: 42,
        startTimeIso: startIso,
      },
    } as MessageEvent);
    expect(ticks.at(-1)).toEqual({ elapsedSeconds: 42, mode: 'web-worker' });

    // Visibility change triggers immediate SYNC command to worker
    document.dispatchEvent(new Event('visibilitychange'));
    expect(posted.some((m) => (m as { type?: string }).type === 'SYNC')).toBe(true);

    // Worker failure falls back seamlessly to local interval mode
    mockWorker.onerror?.(new Event('error'));
    expect(terminated).toBe(true);
    expect(controller.mode).toBe('fallback');

    controller.stop();
    expect(computeElapsedSecondsFromIso('invalid-date')).toBe(0);
    controller.dispose();
  });

  it('renders TimeTrackerView with live elapsed timer and background worker mode indicator', async () => {
    render(
      <ToastProvider>
        <WorkspaceProvider>
          <TimeTrackerView />
        </WorkspaceProvider>
      </ToastProvider>
    );

    const descInput = await screen.findByLabelText(/What are you working on/i);
    fireEvent.change(descInput, { target: { value: 'Worker Timer Audit' } });
    fireEvent.click(screen.getByRole('button', { name: /Start Timer/i }));

    expect(await screen.findByTestId('background-timer-mode')).toBeInTheDocument();
    expect(screen.getByTestId('active-timer-elapsed')).toHaveTextContent(/\d{2}:\d{2}:\d{2}/);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Stop Timer/i }));
    });
    await waitFor(() => {
      expect(screen.queryByTestId('background-timer-mode')).not.toBeInTheDocument();
    });
  });

  it('computes monthly revenue trend using big.js sums, excludes cancelled invoices, and enforces cutoffDate', () => {
    const invoices: Invoice[] = [
      makeInvoice({
        id: 'inv_aug',
        issueDate: '2026-08-05',
        total: 100.1,
        amountPaid: 50.05,
        status: 'partially_paid',
      }),
      makeInvoice({
        id: 'inv_sep_1',
        issueDate: '2026-09-12',
        total: 200.2,
        amountPaid: 200.2,
        status: 'paid',
      }),
      makeInvoice({
        id: 'inv_sep_2',
        issueDate: '2026-09-20',
        total: 300.3,
        amountPaid: 100.1,
        status: 'sent',
      }),
      makeInvoice({
        id: 'inv_sep_cancelled',
        issueDate: '2026-09-25',
        total: 9999,
        amountPaid: 0,
        status: 'cancelled',
      }),
    ];

    const allPoints = buildMonthlyRevenueTrend(invoices);
    expect(allPoints).toHaveLength(2);
    expect(allPoints[0]).toMatchObject({
      month: '2026-08',
      label: 'Aug 2026',
      invoicedRevenue: 100.1,
      collectedRevenue: 50.05,
      invoiceCount: 1,
    });
    expect(allPoints[1]).toMatchObject({
      month: '2026-09',
      label: 'Sep 2026',
      invoicedRevenue: 500.5,
      collectedRevenue: 300.3,
      invoiceCount: 2,
    });

    const recentOnly = buildMonthlyRevenueTrend(invoices, { cutoffDate: '2026-09-01' });
    expect(recentOnly).toHaveLength(1);
    expect(recentOnly[0]?.month).toBe('2026-09');
  });

  it('renders DashboardView Monthly Revenue Trend empty state and populated Recharts widget from stored invoices', async () => {
    const view = render(
      <ToastProvider>
        <WorkspaceProvider>
          <DashboardView onNavigate={() => {}} />
        </WorkspaceProvider>
      </ToastProvider>
    );

    expect(await screen.findByText('No invoice revenue trend yet')).toBeInTheDocument();
    view.unmount();

    const client = await repositories.createClient({
      name: 'Trend Studio',
      company: 'Trend Co',
      email: 'trend@example.invalid',
      phone: '',
      website: '',
      location: '',
      status: 'active',
      category: 'Design',
      tags: [],
      notes: '',
      isDemo: false,
    });

    const todayIso = new Date().toISOString().slice(0, 10);
    await repositories.createInvoice({
      number: 'INV-TREND-1',
      clientId: client.id,
      projectId: '',
      quotationId: '',
      issueDate: todayIso,
      dueDate: todayIso,
      currency: 'USD',
      lineItems: [{ id: 'li_1', description: 'Design Retainer', quantity: 1, unitPrice: 2400 }],
      discountType: 'none',
      discountValue: 0,
      taxRate: 0,
      taxInclusive: false,
      subtotal: 2400,
      discountAmount: 0,
      taxAmount: 0,
      total: 2400,
      notes: '',
      paymentInstructions: '',
      status: 'sent',
      isDemo: false,
    });

    render(
      <ToastProvider>
        <WorkspaceProvider>
          <DashboardView onNavigate={() => {}} />
        </WorkspaceProvider>
      </ToastProvider>
    );

    expect(await screen.findByTestId('monthly-revenue-trend-chart')).toBeInTheDocument();
    expect(screen.getByText(/Invoiced \$2,400\.00/i)).toBeInTheDocument();
  });
});
