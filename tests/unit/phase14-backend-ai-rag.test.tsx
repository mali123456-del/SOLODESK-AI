import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppShell } from '../../src/app/layouts/AppShell';
import { ThemeProvider } from '../../src/app/providers/ThemeProvider';
import { useWorkspace, WorkspaceProvider } from '../../src/app/providers/WorkspaceProvider';
import { auditDatasetRegistry } from '../../src/ai/datasets/registry/datasetRegistry';
import { deduplicateTextAssets } from '../../src/ai/datasets/processors/deduplication';
import { runExtendedRagBenchmark } from '../../src/ai/evaluation/evaluation';
import {
  getKnowledgeCollectionStats,
  rebuildKnowledgeIndex,
  searchKnowledgeBase,
} from '../../src/ai/knowledge/knowledgeService';
import { MockProvider } from '../../src/ai/providers/MockProvider';
import { executeAllowlistedTool } from '../../src/ai/agent/tools';
import { ConflictError, ReferentialIntegrityError } from '../../src/core/errors';
import {
  getSyncSnapshot,
  notifySyncFailed,
  notifySyncStarted,
  notifySyncSucceeded,
  resetSyncStateForTest,
} from '../../src/core/syncEvents';
import { db, SOLODESK_SCHEMA_VERSION, SolodeskDatabase } from '../../src/database/db';
import { DexieSolodeskRepositories, repositories } from '../../src/database/repositories/dexieRepositories';
import { fetchAndPreviewUrlForKnowledge } from '../../src/integrations/crawler/urlImporter';
import {
  BUILT_IN_KNOWLEDGE_PACKS,
  installBuiltInKnowledgePacks,
} from '../../src/knowledge/packLoader';
import { runDatabaseHealthCheck } from '../../src/observability/healthCheck';
import { createBackupPayload, inspectBackupText, restoreBackupPayload } from '../../src/services/backupService';
import {
  calculateEstimatesVsActuals,
  calculateInvoiceAging,
  evaluateMonthlyBusinessHealth,
} from '../../src/services/businessHealthService';
import { buildFollowUpQueue } from '../../src/services/communicationService';
import {
  executeOverdueInvoiceFollowupWithApproval,
  retryFailedWorkflowRun,
  simulateWorkflowDryRun,
} from '../../src/workflows/workflowEngine';

async function clearMainDb() {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}

const TelemetryHarness: React.FC = () => {
  const { isOnline, syncStatus, pendingSyncCount, syncError, lastSyncedAt, retrySync } =
    useWorkspace();
  return (
    <AppShell
      activeRoute="dashboard"
      onNavigate={() => {}}
      isOnline={isOnline}
      syncStatus={syncStatus}
      pendingSyncCount={pendingSyncCount}
      syncError={syncError}
      lastSyncedAt={lastSyncedAt}
      onRetrySync={() => void retrySync()}
    >
      <div data-testid="online-state">{isOnline ? 'online' : 'offline'}</div>
      <div data-testid="sync-status">{syncStatus}</div>
    </AppShell>
  );
};

describe('Phase 14 — Offline/Sync Telemetry, Dexie v4, Analytics, Workflows, 14 Packs & RAG Benchmark', () => {
  let isolatedDb: SolodeskDatabase;
  let repo: DexieSolodeskRepositories;

  beforeEach(async () => {
    await clearMainDb();
    resetSyncStateForTest();
    isolatedDb = new SolodeskDatabase(`solodesk_p14_${Math.random().toString(36).slice(2)}`);
    repo = new DexieSolodeskRepositories(isolatedDb);
  });

  afterEach(async () => {
    resetSyncStateForTest();
    await isolatedDb.delete();
  });

  it('monitors online/offline state and local DB pending/error/retry indicators in WorkspaceProvider & AppShell', async () => {
    render(
      <ThemeProvider>
        <WorkspaceProvider>
          <TelemetryHarness />
        </WorkspaceProvider>
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('sync-status').textContent).toBe('synced');
    });

    // Offline indicator transitions cleanly on window offline/online events
    fireEvent(window, new Event('offline'));
    expect(await screen.findByText('Offline · Local DB')).toBeInTheDocument();
    expect(screen.getByTestId('online-state').textContent).toBe('offline');

    fireEvent(window, new Event('online'));
    await waitFor(() => {
      expect(screen.queryByText('Offline · Local DB')).not.toBeInTheDocument();
    });

    // Pending sync indicator
    notifySyncStarted('Write client');
    notifySyncStarted('Write project');
    expect(await screen.findByText('Syncing DB (2)')).toBeInTheDocument();
    notifySyncSucceeded('Write client');
    expect(await screen.findByText('Syncing DB…')).toBeInTheDocument();
    notifySyncSucceeded('Write project');
    await waitFor(() => {
      expect(screen.queryByText(/Syncing DB/i)).not.toBeInTheDocument();
    });

    // Failure & Retry recovery
    notifySyncFailed(new Error('IndexedDB write blocked'));
    expect(await screen.findByText('Local DB Sync Failed')).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.queryByText('Local DB Sync Failed')).not.toBeInTheDocument();
      expect(getSyncSnapshot().status).toBe('synced');
    });
  });

  it('migrates v1/v3 schemas to Dexie v6, enforces foreign keys on serviceCatalog/appointments/goals, and supports v3 backup restore', async () => {
    expect(SOLODESK_SCHEMA_VERSION).toBe(6);

    // Upgrade test from v3 -> v5
    const dbName = `solodesk_mig_v3_${Math.random().toString(36).slice(2)}`;
    const legacy = new Dexie(dbName);
    legacy.version(3).stores({
      businessProfile: 'id',
      appSettings: 'id',
      clients: 'id, status, category, email, name, updatedAt',
      projects: 'id, clientId, status, dueDate, updatedAt',
      tasks: 'id, projectId, clientId, status, priority, dueDate, updatedAt',
      proposals: 'id, number, clientId, projectId, status, updatedAt',
      quotations: 'id, number, clientId, projectId, status, issueDate, updatedAt',
      contracts: 'id, number, clientId, projectId, status, updatedAt',
      invoices: 'id, &number, clientId, projectId, quotationId, status, dueDate, updatedAt',
      payments: 'id, invoiceId, clientId, paymentDate, updatedAt',
      financeEntries: 'id, type, category, date, clientId, projectId, invoiceId, paymentId',
      timeEntries: 'id, projectId, taskId, isRunning, startTime',
      knowledgeDocs: 'id, title, collection, sourceType, contentHash, updatedAt',
      documentChunks: 'id, documentId, chunkIndex',
      templates: 'id, kind, name',
      workflowRuns: 'id, workflowType, triggerEntityId, status, createdAt',
      activities: 'id, entityType, entityId, createdAt',
      notifications: 'id, read, createdAt',
    });
    await legacy.open();
    await legacy.table('clients').put({
      id: 'cli_legacy',
      name: 'V3 Client',
      company: '',
      email: 'v3@example.invalid',
      phone: '',
      website: '',
      location: '',
      status: 'active',
      category: 'Consulting',
      tags: [],
      notes: '',
      isDemo: false,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    });
    legacy.close();

    const upgraded = new SolodeskDatabase(dbName);
    await upgraded.open();
    expect(upgraded.verno).toBe(6);
    expect((await upgraded.clients.get('cli_legacy'))?.name).toBe('V3 Client');
    expect(await upgraded.serviceCatalog.count()).toBe(0);
    expect(await upgraded.appointments.count()).toBe(0);
    expect(await upgraded.workspaceGoals.count()).toBe(0);
    await upgraded.delete();

    // CRUD + FK checks on v4 tables
    const svc = await repo.createServiceItem({
      name: 'Architecture Review',
      description: 'System audit and scaling plan',
      category: 'Engineering',
      defaultUnitPrice: 1200,
      currency: 'USD',
      billingUnit: 'fixed',
      estimatedHours: 10,
      defaultTaxable: true,
      active: true,
      isDemo: false,
    });
    expect(svc.id).toBeTruthy();

    await expect(
      repo.createAppointment({
        clientId: 'cli_missing',
        projectId: '',
        title: 'Invalid Kickoff',
        date: '2026-11-20',
        startTime: '11:00',
        durationMinutes: 45,
        locationOrLink: 'Zoom',
        status: 'scheduled',
        meetingNotes: '',
        followUpRequired: true,
        isDemo: false,
      })
    ).rejects.toThrow(ReferentialIntegrityError);

    const client = await repo.createClient({
      name: 'V4 Studio Client',
      company: 'Studio Inc',
      email: 'studio@example.invalid',
      phone: '',
      website: '',
      location: '',
      status: 'active',
      category: 'Design',
      tags: [],
      notes: '',
      isDemo: false,
    });
    const apt = await repo.createAppointment({
      clientId: client.id,
      projectId: '',
      title: 'Roadmap Alignment',
      date: '2026-11-20',
      startTime: '14:30',
      durationMinutes: 30,
      locationOrLink: 'Meet',
      status: 'scheduled',
      meetingNotes: 'Review Q4 backlog',
      followUpRequired: true,
      isDemo: false,
    });
    expect(apt.clientId).toBe(client.id);

    const goal = await repo.saveWorkspaceGoal({
      monthPrefix: '2026-11',
      targetRevenue: 8000,
      targetBillableHours: 100,
      maxExpenseBudget: 1500,
      currency: 'USD',
      notes: 'Prioritize recurring retainers',
    });
    expect(goal.monthPrefix).toBe('2026-11');

    const health = await runDatabaseHealthCheck(isolatedDb);
    expect(health.schemaVersion).toBe(6);
    expect(health.status).toBe('healthy');

    // v4 Backup roundtrip + v3 backward compatible restore
    const cMain = await repositories.createClient({
      name: 'Roundtrip V4',
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
    await repositories.createServiceItem({
      name: 'QA Audit',
      description: '',
      category: 'QA',
      defaultUnitPrice: 400,
      currency: 'USD',
      billingUnit: 'fixed',
      estimatedHours: 4,
      defaultTaxable: true,
      active: true,
      isDemo: false,
    });
    const v6Payload = await createBackupPayload();
    expect(v6Payload.schemaVersion).toBe(6);
    expect(v6Payload.recordCounts.serviceCatalog).toBe(1);

    // Strip v4/v5/v6 arrays & downgrade schemaVersion to 3 to simulate restoring older v3 backup
    const v3Json = JSON.stringify({
      ...v6Payload,
      schemaVersion: 3,
      data: {
        ...v6Payload.data,
        serviceCatalog: undefined,
        appointments: undefined,
        workspaceGoals: undefined,
        voiceNotes: undefined,
        auditEvents: undefined,
        integrationConnections: undefined,
        privacyConsents: undefined,
      },
    });
    const inspectedV3 = await inspectBackupText(v3Json);
    expect(inspectedV3.payload?.schemaVersion).toBe(3);
    await clearMainDb();
    await restoreBackupPayload(inspectedV3.payload!, 'replace');
    const restoredClients = await repositories.listClients();
    expect(restoredClients.some((c) => c.id === cMain.id)).toBe(true);
  });

  it('computes invoice aging buckets, estimates vs actuals, monthly health, and follow-up queues accurately', async () => {
    const cli = await repo.createClient({
      name: 'Northwind Holdings',
      company: 'Northwind',
      email: 'ar@northwind.invalid',
      phone: '',
      website: '',
      location: '',
      status: 'lead',
      category: 'SaaS',
      tags: [],
      notes: 'Interested in Q1 retainer',
      isDemo: false,
    });
    const prj = await repo.createProject({
      clientId: cli.id,
      name: 'Billing Engine',
      description: '',
      status: 'active',
      priority: 'high',
      startDate: '2026-11-01',
      dueDate: '2026-12-05',
      budget: 2000,
      agreedValue: 2000,
      currency: 'USD',
      hourlyRate: 100, // Estimated 20h
      progress: 50,
      milestones: [],
      notes: '',
      isDemo: false,
    });
    await repo.createManualTimeEntry({
      projectId: prj.id,
      taskId: '',
      description: 'Core parser implementation',
      startTime: '2026-11-10T09:00:00.000Z',
      endTime: '2026-11-11T10:00:00.000Z',
      durationSeconds: 25 * 3600, // 25 actual hours -> over 20h budget
      hourlyRate: 100,
      billable: true,
      isDemo: false,
    });
    await repo.createFinanceEntry({
      type: 'income',
      category: 'Milestone Payment',
      amount: 3000,
      currency: 'USD',
      date: '2026-11-12',
      clientId: cli.id,
      projectId: prj.id,
      invoiceId: '',
      paymentId: '',
      description: 'Milestone 1',
      notes: '',
      isDemo: false,
    });

    const invCurrent = await repo.createInvoice({
      number: 'INV-CUR-1',
      clientId: cli.id,
      projectId: prj.id,
      quotationId: '',
      issueDate: '2026-11-15',
      dueDate: '2026-11-30',
      currency: 'USD',
      lineItems: [{ id: '1', description: 'Phase 1', quantity: 1, unitPrice: 500 }],
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
    const inv15 = await repo.createInvoice({
      number: 'INV-15D',
      clientId: cli.id,
      projectId: prj.id,
      quotationId: '',
      issueDate: '2026-10-01',
      dueDate: '2026-11-01',
      currency: 'USD',
      lineItems: [{ id: '1', description: 'Phase 2', quantity: 1, unitPrice: 300 }],
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
      status: 'overdue',
      isDemo: false,
    });
    const inv70 = await repo.createInvoice({
      number: 'INV-70D',
      clientId: cli.id,
      projectId: prj.id,
      quotationId: '',
      issueDate: '2026-08-01',
      dueDate: '2026-09-01',
      currency: 'USD',
      lineItems: [{ id: '1', description: 'Legacy', quantity: 1, unitPrice: 700 }],
      discountType: 'none',
      discountValue: 0,
      taxRate: 0,
      taxInclusive: false,
      subtotal: 700,
      discountAmount: 0,
      taxAmount: 0,
      total: 700,
      notes: '',
      paymentInstructions: '',
      status: 'overdue',
      isDemo: false,
    });

    const aging = calculateInvoiceAging([invCurrent, inv15, inv70], '2026-11-16');
    expect(aging.openInvoiceCount).toBe(3);
    expect(aging.totalOpenBalance).toBe(1500);
    expect(aging.buckets.find((b) => b.key === 'current')?.totalBalance).toBe(500);
    expect(aging.buckets.find((b) => b.key === '1_30')?.totalBalance).toBe(300);
    expect(aging.buckets.find((b) => b.key === '61_plus')?.totalBalance).toBe(700);

    const eva = calculateEstimatesVsActuals(
      await repo.listProjects(),
      await repo.listTimeEntries(),
      await repo.listFinanceEntries()
    );
    expect(eva[0].estimatedHours).toBe(20);
    expect(eva[0].actualHours).toBe(25);
    expect(eva[0].overBudgetHours).toBe(true);
    expect(eva[0].hourVariance).toBe(-5);

    const goal = await repo.saveWorkspaceGoal({
      monthPrefix: '2026-11',
      targetRevenue: 6000,
      targetBillableHours: 50,
      maxExpenseBudget: 1000,
      currency: 'USD',
      notes: '',
    });

    const health = evaluateMonthlyBusinessHealth({
      monthPrefix: '2026-11',
      goals: [goal],
      financeEntries: await repo.listFinanceEntries(),
      timeEntries: await repo.listTimeEntries(),
      invoices: [invCurrent, inv15, inv70],
      tasks: [],
      today: '2026-11-16',
    });
    expect(health.revenueProgressPercent).toBe(50);
    expect(health.hoursProgressPercent).toBe(50);
    expect(health.overdueInvoiceCount).toBe(2);

    const queue = buildFollowUpQueue({
      clients: [cli],
      invoices: [invCurrent, inv15, inv70],
      proposals: [],
      appointments: [],
      businessName: 'Northwind Digital',
      referenceDate: '2026-11-16',
    });
    expect(queue[0].kind).toBe('overdue_invoice');
    expect(queue[0].priority).toBe('high');
    expect(queue.some((q) => q.kind === 'lead_outreach')).toBe(true);
  });

  it('executes overdue-invoice workflow, retries failed runs, and simulates dry-runs with zero writes', async () => {
    const cli = await repo.createClient({
      name: 'WF Client',
      company: '',
      email: 'wf@example.invalid',
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
      number: 'INV-WF-1',
      clientId: cli.id,
      projectId: '',
      quotationId: '',
      issueDate: '2026-10-01',
      dueDate: '2026-10-15',
      currency: 'USD',
      lineItems: [{ id: '1', description: 'API Sprint', quantity: 1, unitPrice: 950 }],
      discountType: 'none',
      discountValue: 0,
      taxRate: 0,
      taxInclusive: false,
      subtotal: 950,
      discountAmount: 0,
      taxAmount: 0,
      total: 950,
      notes: '',
      paymentInstructions: '',
      status: 'overdue',
      isDemo: false,
    });

    const sim = await simulateWorkflowDryRun('overdue_invoice_followup_task', inv.id, repo);
    expect(sim.eligible).toBe(true);
    expect(await repo.listTasks()).toHaveLength(0);

    const execRes = await executeOverdueInvoiceFollowupWithApproval(inv.id, true, {
      repo,
      database: isolatedDb,
    });
    expect(execRes.run.status).toBe('executed');
    expect(execRes.tasks).toHaveLength(1);
    expect(execRes.tasks[0].priority).toBe('high');

    // Duplicate prevention
    await expect(
      executeOverdueInvoiceFollowupWithApproval(inv.id, true, { repo, database: isolatedDb })
    ).rejects.toThrow(ConflictError);
    const simAfter = await simulateWorkflowDryRun('overdue_invoice_followup_task', inv.id, repo);
    expect(simAfter.eligible).toBe(false);

    // Retry failed workflow run
    const invRetry = await repo.createInvoice({
      number: 'INV-WF-2',
      clientId: cli.id,
      projectId: '',
      quotationId: '',
      issueDate: '2026-10-01',
      dueDate: '2026-10-15',
      currency: 'USD',
      lineItems: [{ id: '1', description: 'Retry Sprint', quantity: 1, unitPrice: 400 }],
      discountType: 'none',
      discountValue: 0,
      taxRate: 0,
      taxInclusive: false,
      subtotal: 400,
      discountAmount: 0,
      taxAmount: 0,
      total: 400,
      notes: '',
      paymentInstructions: '',
      status: 'overdue',
      isDemo: false,
    });
    const failedRun = await repo.saveWorkflowRun({
      id: 'wfr_failed_sample',
      workflowType: 'overdue_invoice_followup_task',
      triggerEntityType: 'invoice',
      triggerEntityId: invRetry.id,
      status: 'failed',
      summary: 'Transient failure before retry',
      createdEntityIds: [],
      errorMessage: 'Simulated interruption',
      createdAt: '2026-11-16T00:00:00.000Z',
      executedAt: '',
    });
    const retried = await retryFailedWorkflowRun(failedRun.id, { repo, database: isolatedDb });
    expect(retried.run.status).toBe('executed');
    expect(retried.tasks[0].title).toContain('INV-WF-2');
  });

  it('installs 14 first-party MIT knowledge packs, rebuilds index, audits dataset registry, and runs 14-case RAG benchmark', async () => {
    expect(BUILT_IN_KNOWLEDGE_PACKS).toHaveLength(14);

    const firstInstall = await installBuiltInKnowledgePacks();
    expect(firstInstall.installedCount).toBe(14);
    expect(firstInstall.skippedDuplicates).toBe(0);

    const secondInstall = await installBuiltInKnowledgePacks();
    expect(secondInstall.installedCount).toBe(0);
    expect(secondInstall.skippedDuplicates).toBe(14);

    const stats = await getKnowledgeCollectionStats();
    expect(stats.totalDocuments).toBe(14);
    expect(stats.totalChunks).toBeGreaterThanOrEqual(14);

    const rebuilt = await rebuildKnowledgeIndex();
    expect(rebuilt.reindexedDocuments).toBe(14);
    expect(rebuilt.totalChunks).toBeGreaterThanOrEqual(14);

    const search = await searchKnowledgeBase('invoice aging overdue balance', 3);
    expect(search.citations.length).toBeGreaterThan(0);

    // Dataset registry & license audit + deduplication utility
    const audit = auditDatasetRegistry();
    expect(audit.approvedEntries.length).toBeGreaterThanOrEqual(3);
    expect(audit.rejectedEntries.length).toBeGreaterThanOrEqual(3);
    for (const approved of audit.approvedEntries) {
      const check = audit.complianceChecks.find((c) => c.datasetId === approved.id);
      expect(check?.compliantForInclusion).toBe(true);
    }

    const dedup = await deduplicateTextAssets([
      { id: 'a1', content: 'Net-14 invoice policy text.  \r\nSecond line.' },
      { id: 'a2', content: 'Net-14 invoice policy text.\nSecond line.' },
    ]);
    expect(dedup.unique).toHaveLength(1);
    expect(dedup.duplicateIds).toEqual(['a2']);

    // Duplicate detection + concurrency guard in modular crawler
    const firstPageFetch = (async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /\n', { status: 200 });
      return new Response('<html><title>Pack Doc</title><p>Duplicate Check Content</p></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }) as typeof fetch;

    const urlPrev = await fetchAndPreviewUrlForKnowledge('https://example.com/dup-check', {
      fetchImpl: firstPageFetch,
    });
    expect(urlPrev.duplicateOfTitle).toBeNull();

    // MockProvider Facts vs Recommendations structure & new tools
    const mock = new MockProvider();
    const draft = await mock.generateText({
      prompt: 'Analyze overdue invoice aging',
      context: 'Workspace has 2 clients and 1 overdue invoice.\n[C1] Invoice Management Guide',
    });
    expect(draft.text).toContain('1. Verified Workspace Facts');
    expect(draft.text).toContain('2. Recommended Follow-Up Email Draft');

    const agingTool = await executeAllowlistedTool('analyze_invoice_aging', {});
    expect(agingTool.ok).toBe(true);

    // 25-case Extended RAG Benchmark
    const bench = runExtendedRagBenchmark();
    expect(bench.totalCases).toBe(25);
    expect(bench.passedCases).toBe(25);
    expect(bench.passRatePercent).toBe(100);
    expect(bench.recallAtK).toBe(1);
    expect(bench.citationAccuracy).toBe(1);
    expect(bench.unsupportedFalsePositiveCount).toBe(0);
    expect(bench.duplicateChunkCount).toBe(0);
  });
});
