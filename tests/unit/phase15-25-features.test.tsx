import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { db } from '../../src/database/db';
import { repositories } from '../../src/database/repositories/dexieRepositories';
import { AppShell } from '../../src/app/layouts/AppShell';
import { ThemeProvider } from '../../src/app/providers/ThemeProvider';
import { WorkspaceProvider } from '../../src/app/providers/WorkspaceProvider';
import { ToastProvider } from '../../src/components/ui';
import { DashboardView } from '../../src/features/dashboard/DashboardView';
import { buildDailyDigest } from '../../src/services/productivityService';
import {
  computeCriticalPath,
  wouldTaskCreateCycle,
} from '../../src/services/projectPlanningService';
import {
  buildCashflowForecast,
  convertCurrencyToBase,
  runWhatIfFinancialScenario,
} from '../../src/services/financialIntelligenceService';
import { prepareVaultFileDraft } from '../../src/services/documentVaultService';
import { buildClientPortalViewModel } from '../../src/services/clientPortalService';
import { resolveSyncConflict } from '../../src/services/cloudSyncService';
import { evaluateUsageAgainstPlan } from '../../src/services/entitlementService';
import { addKnowledgeNote, searchKnowledgeBase } from '../../src/ai/knowledge/knowledgeService';
import { runExtendedRagBenchmark } from '../../src/ai/evaluation/evaluation';
import { RAG_INDEX_VERSION } from '../../src/ai/rag/semanticVector';
import {
  createAIProvider,
  setSessionOllamaConfig,
  setSessionOpenAIConfig,
  clearSessionOpenAIConfig,
} from '../../src/ai/providers/providerFactory';
import { runBackupRecoverySelfTest } from '../../src/security/auditLogger';
import type { Task } from '../../src/domain/schemas/entities';

async function resetDb(): Promise<void> {
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
}

function makeTask(partial: Partial<Task> & { id: string; title: string }): Task {
  const now = '2026-11-17T08:00:00.000Z';
  return {
    projectId: '',
    clientId: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    dueDate: '',
    assignee: '',
    tags: [],
    subtasks: [],
    comments: [],
    attachmentVaultIds: [],
    dependsOnIds: [],
    estimatedHours: 2,
    recurrenceRule: 'none',
    autoPriorityScore: 0,
    completedAt: '',
    isDemo: false,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe('Phase 15–25 Features: Focus Mode, Daily Digest, Planning, Finance, Vault, Portal, Hybrid RAG v2, Security & Entitlements', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('hides sidebar navigation, mobile quick nav, and notifications button in Focus Mode', () => {
    const { rerender } = render(
      <ThemeProvider>
        <AppShell
          activeRoute="dashboard"
          onNavigate={() => {}}
          focusModeActive={false}
          onToggleFocusMode={() => {}}
        >
          <div>Workspace Body</div>
        </AppShell>
      </ThemeProvider>
    );

    expect(screen.getByLabelText('Primary Workspace Navigation')).toBeInTheDocument();
    expect(screen.getByLabelText('Mobile Quick Navigation')).toBeInTheDocument();
    expect(screen.getByLabelText('Open notifications')).toBeInTheDocument();

    rerender(
      <ThemeProvider>
        <AppShell
          activeRoute="focus-mode"
          onNavigate={() => {}}
          focusModeActive={true}
          onToggleFocusMode={() => {}}
        >
          <div>Focused Single Task</div>
        </AppShell>
      </ThemeProvider>
    );

    expect(screen.queryByLabelText('Primary Workspace Navigation')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Mobile Quick Navigation')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Open notifications')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit Focus Mode' })).toBeInTheDocument();
  });

  it('computes Daily Digest from live IndexedDB records and renders Daily Digest on Dashboard', async () => {
    const client = await repositories.createClient({
      name: 'Apex Studio',
      company: 'Apex Studio LLC',
      email: 'billing@apex.invalid',
      phone: '',
      website: '',
      location: '',
      status: 'active',
      category: 'Design',
      tags: [],
      notes: '',
      isDemo: false,
    });
    const project = await repositories.createProject({
      clientId: client.id,
      name: 'Design System V2',
      description: '',
      status: 'active',
      priority: 'high',
      startDate: '2026-11-01',
      dueDate: '2026-11-30',
      budget: 5000,
      agreedValue: 5000,
      currency: 'USD',
      hourlyRate: 100,
      progress: 40,
      milestones: [
        { id: 'ms_1', title: 'Token Audit', dueDate: '2026-11-20', completed: false },
      ],
      notes: '',
      isDemo: false,
    });
    await repositories.createTask({
      projectId: project.id,
      clientId: client.id,
      title: 'Finalize Button Tokens',
      description: '',
      status: 'todo',
      priority: 'urgent',
      dueDate: '2026-11-10',
      tags: [],
      subtasks: [],
      completedAt: '',
      isDemo: false,
    });
    await repositories.createInvoice({
      clientId: client.id,
      projectId: project.id,
      quotationId: '',
      status: 'overdue',
      issueDate: '2026-10-20',
      dueDate: '2026-11-01',
      currency: 'USD',
      lineItems: [{ id: 'li_1', description: 'Phase 1', quantity: 1, unitPrice: 1250 }],
      discountType: 'none',
      discountValue: 0,
      taxRate: 0,
      taxInclusive: false,
      subtotal: 1250,
      discountAmount: 0,
      taxAmount: 0,
      total: 1250,
      notes: '',
      paymentInstructions: '',
      isDemo: false,
    });

    const [clients, projects, tasks, invoices, appointments] = await Promise.all([
      repositories.listClients(),
      repositories.listProjects(),
      repositories.listTasks(),
      repositories.listInvoices(),
      repositories.listAppointments(),
    ]);

    const digest = buildDailyDigest({
      clients,
      projects,
      tasks,
      invoices,
      appointments,
      today: '2026-11-17',
    });

    expect(digest.overdueTasks).toHaveLength(1);
    expect(digest.highPriorityTasks).toHaveLength(1);
    expect(digest.pendingInvoices).toHaveLength(1);
    expect(digest.pendingInvoiceTotal).toBe(1250);
    expect(digest.upcomingMilestones).toHaveLength(1);

    await repositories.saveSettings({ onboardingCompleted: true });

    render(
      <ThemeProvider>
        <ToastProvider>
          <WorkspaceProvider>
            <DashboardView onNavigate={() => {}} />
          </WorkspaceProvider>
        </ToastProvider>
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Daily Digest/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Finalize Button Tokens/i).length).toBeGreaterThan(0);
    });
  });

  it('rejects circular task dependencies and computes critical path duration accurately', () => {
    const t1 = makeTask({ id: 't1', title: 'Discovery', estimatedHours: 4, dependsOnIds: [] });
    const t2 = makeTask({ id: 't2', title: 'Wireframes', estimatedHours: 6, dependsOnIds: ['t1'] });
    const t3 = makeTask({ id: 't3', title: 'Build', estimatedHours: 10, dependsOnIds: ['t2'] });
    const tasks = [t1, t2, t3];

    expect(wouldTaskCreateCycle(tasks, 't1', 't3')).toBe(true);
    expect(wouldTaskCreateCycle(tasks, 't2', 't2')).toBe(true);
    expect(wouldTaskCreateCycle(tasks, 't3', 't1')).toBe(false);

    const cp = computeCriticalPath(tasks);
    expect(cp.hasCycle).toBe(false);
    expect(cp.criticalTaskIds).toEqual(['t1', 't2', 't3']);
    expect(cp.criticalDurationHours).toBe(20);
    expect(cp.blockedTasks).toHaveLength(2);
  });

  it('performs exact Big.js FX conversion, cashflow forecasting, and what-if scenario modeling', () => {
    const converted = convertCurrencyToBase(27850, 'PKR', 'USD', { USD: 1, PKR: 278.5 });
    expect(converted).toBe(100);

    const forecast = buildCashflowForecast({
      financeEntries: [
        {
          id: 'fin_1',
          type: 'income',
          category: 'Consulting',
          description: 'October',
          amount: 4000,
          currency: 'USD',
          date: '2026-10-15',
          clientId: '',
          projectId: '',
          invoiceId: '',
          paymentId: '',
          receiptFileName: '',
          receiptMimeType: '',
          receiptDataUrl: '',
          taxProfileName: '',
          exchangeRateToBase: 1,
          notes: '',
          isDemo: false,
          createdAt: '2026-10-15T00:00:00.000Z',
          updatedAt: '2026-10-15T00:00:00.000Z',
        },
      ],
      invoices: [],
      retainers: [],
      monthsAhead: 3,
      today: '2026-11-17',
    });

    expect(forecast.some((p) => p.kind === 'historical')).toBe(true);
    expect(forecast.filter((p) => p.kind === 'forecast')).toHaveLength(3);

    const scenario = runWhatIfFinancialScenario({
      monthlyBaselineIncome: 4000,
      monthlyBaselineExpenses: 1000,
      rateChangePercent: 25,
      newMonthlyRetainerAmount: 1000,
      monthlyExpenseDelta: 200,
    });
    expect(scenario.monthlyRunRateAfterDelta).toBe(4800);
    expect(scenario.projectedAnnualNet).toBe(57600);
  });

  it('validates Vault uploads using magic bytes, safe filenames, and rejects executable extensions', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    const draft = await prepareVaultFileDraft({
      fileName: '../Scope & Contract?.pdf',
      bytes: pdfBytes,
      folder: 'Contracts',
    });
    expect(draft.mimeType).toBe('application/pdf');
    expect(draft.name).not.toContain('..');
    expect(draft.sha256.length).toBeGreaterThan(10);

    await expect(
      prepareVaultFileDraft({
        fileName: 'payload.exe',
        bytes: new Uint8Array([0x4d, 0x5a]),
      })
    ).rejects.toThrow(/Unsupported extension/i);
  });

  it('enforces Client Portal token validity, expiration, revocation, and hides private/internal data', () => {
    const baseInput = {
      clients: [
        {
          id: 'cli_1',
          name: 'Client Name',
          company: 'Client Corp',
          email: 'c@client.invalid',
          phone: '',
          website: '',
          location: '',
          status: 'active' as const,
          leadStage: 'qualified' as const,
          contacts: [],
          category: 'Tech',
          tags: [],
          notes: 'TOP SECRET MARGIN NOTE',
          isDemo: false,
          createdAt: '2026-11-01T00:00:00.000Z',
          updatedAt: '2026-11-01T00:00:00.000Z',
        },
      ],
      projects: [],
      invoices: [],
      vaultFiles: [
        {
          id: 'vf_shared',
          name: 'Client_Deck.pdf',
          folder: 'Deliverables',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          sha256: 'abc',
          contentDataUrl: 'data:application/pdf;base64,AA==',
          previewText: '',
          classification: 'client_shared' as const,
          approvalStatus: 'approved' as const,
          clientId: 'cli_1',
          projectId: '',
          shareToken: '',
          tags: [],
          version: 1,
          versions: [],
          createdAt: '2026-11-01T00:00:00.000Z',
          updatedAt: '2026-11-01T00:00:00.000Z',
        },
        {
          id: 'vf_secret',
          name: 'Internal_Margins.csv',
          folder: 'Finance',
          mimeType: 'text/csv',
          sizeBytes: 256,
          sha256: 'def',
          contentDataUrl: 'data:text/csv;base64,AA==',
          previewText: '',
          classification: 'confidential' as const,
          approvalStatus: 'draft' as const,
          clientId: 'cli_1',
          projectId: '',
          shareToken: '',
          tags: [],
          version: 1,
          versions: [],
          createdAt: '2026-11-01T00:00:00.000Z',
          updatedAt: '2026-11-01T00:00:00.000Z',
        },
      ],
      today: '2026-11-17',
    };

    const validVm = buildClientPortalViewModel({
      ...baseInput,
      link: {
        id: 'cpl_1',
        clientId: 'cli_1',
        projectId: '',
        token: 'tok_12345678',
        label: 'Portal',
        status: 'active',
        expiresAt: '2026-12-01',
        permissions: {
          showMilestones: true,
          showInvoices: true,
          showSharedFiles: true,
          allowApprovals: true,
          allowFeedback: true,
        },
        onboardingChecklist: [],
        approvals: [],
        feedbackNotes: [],
        surveyComment: '',
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
    });

    expect(validVm.valid).toBe(true);
    expect(validVm.scopedFiles.map((f) => f.id)).toEqual(['vf_shared']);
    expect(JSON.stringify(validVm)).not.toContain('TOP SECRET MARGIN NOTE');

    const expiredVm = buildClientPortalViewModel({
      ...baseInput,
      link: {
        id: 'cpl_2',
        clientId: 'cli_1',
        projectId: '',
        token: 'tok_expired1',
        label: 'Expired',
        status: 'active',
        expiresAt: '2026-11-01',
        permissions: {
          showMilestones: true,
          showInvoices: true,
          showSharedFiles: true,
          allowApprovals: true,
          allowFeedback: true,
        },
        onboardingChecklist: [],
        approvals: [],
        feedbackNotes: [],
        surveyComment: '',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    });
    expect(expiredVm.valid).toBe(false);
    expect(expiredVm.reason).toMatch(/expired/i);
  });

  it('enforces RAG permission scoping, runs 25-case Hybrid RAG v2 benchmark, and resolves AI providers cleanly', async () => {
    expect(RAG_INDEX_VERSION).toBe(3);

    await addKnowledgeNote({
      title: 'Private Pricing Playbook',
      content: 'Internal wholesale margin target is 62 percent.',
      accessScope: 'internal_only',
    });
    await addKnowledgeNote({
      title: 'Client Onboarding FAQ',
      content: 'Clients upload brand assets inside the portal onboarding checklist.',
      accessScope: 'client_portal',
    });

    const portalScoped = await searchKnowledgeBase('wholesale margin 62', 4, {
      accessScope: 'client_portal',
    });
    expect(portalScoped.matches).toHaveLength(0);
    expect(portalScoped.insufficientEvidence).toBe(true);

    const bench = runExtendedRagBenchmark();
    expect(bench.totalCases).toBe(25);
    expect(bench.passedCases).toBe(25);
    expect(bench.duplicateChunkCount).toBe(0);

    setSessionOpenAIConfig({
      baseUrl: 'https://api.example.invalid/v1',
      apiKey: 'sk-test-memory',
      modelId: 'gpt-4o-mini',
    });
    expect(createAIProvider('openai_compatible').isConfigured()).toBe(true);
    clearSessionOpenAIConfig();
    expect(createAIProvider('openai_compatible').isConfigured()).toBe(false);

    setSessionOllamaConfig({ baseUrl: 'http://localhost:11434', modelId: 'llama3.2', enabled: true });
    expect(createAIProvider('ollama').isConfigured()).toBe(true);
    setSessionOllamaConfig({ enabled: false });
  });

  it('runs non-destructive backup AES-GCM recovery self-test, conflict resolution, and RTL / plan checks', async () => {
    await repositories.createClient({
      name: 'Verification Client',
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

    const report = await runBackupRecoverySelfTest();
    expect(report.ok).toBe(true);
    expect(report.encryptedRoundtripOk).toBe(true);
    expect(report.schemaVersion).toBe(6);
    expect(report.recordCount).toBeGreaterThanOrEqual(1);

    const conflictWinner = resolveSyncConflict({
      strategy: 'latest_timestamp',
      localUpdatedAt: '2026-11-17T10:00:00.000Z',
      remoteUpdatedAt: '2026-11-17T11:00:00.000Z',
    });
    expect(conflictWinner.winner).toBe('remote');

    const freeCheck = evaluateUsageAgainstPlan({
      tier: 'free',
      clientCount: 16,
      activeProjectCount: 2,
      vaultFileCount: 1,
    });
    expect(freeCheck.clientsWithinLimit).toBe(false);
    expect(freeCheck.projectsWithinLimit).toBe(true);
  });
});
