import { beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_WORKFORCE_REGISTRY,
  assertAgentToolAllowed,
  enforceDelegatedToolAllowed,
  runWorkforceAgent,
} from '../../src/ai/agents/agentRegistry';
import { runActionWithApproval } from '../../src/ai/agent/actionApproval';
import { auditDatasetRegistry, DATASET_REGISTRY_MANIFEST } from '../../src/ai/datasets/registry/datasetRegistry';
import { evaluateDatasetUsePermission } from '../../src/ai/datasets/registry/datasetLicenseChecker';
import { db } from '../../src/database/db';
import { repositories } from '../../src/database/repositories/dexieRepositories';
import { generateWeeklyDigest } from '../../src/services/businessHealthService';
import { PAKISTAN_PAYMENT_GUIDANCE, PLAN_ENTITLEMENTS } from '../../src/services/entitlementService';

describe('Phases 28–31: 15-Agent AI Workforce, Dataset Governance, Weekly Digest & Commercial Catalog', () => {
  beforeEach(async () => {
    await db.clients.clear();
    await db.projects.clear();
    await db.tasks.clear();
    await db.invoices.clear();
    await db.financeEntries.clear();
    await db.timeEntries.clear();
    await db.securityAuditLogs.clear();
  });

  it('registers all 15 agents across 3 strict autonomy tiers and blocks privilege escalation', () => {
    expect(AGENT_WORKFORCE_REGISTRY).toHaveLength(15);

    const readOnly = AGENT_WORKFORCE_REGISTRY.filter((a) => a.autonomyClass === 'read_only');
    const draftOnly = AGENT_WORKFORCE_REGISTRY.filter((a) => a.autonomyClass === 'draft_only');
    const approvalReq = AGENT_WORKFORCE_REGISTRY.filter((a) => a.autonomyClass === 'approval_required');

    expect(readOnly).toHaveLength(7);
    expect(draftOnly).toHaveLength(6);
    expect(approvalReq).toHaveLength(2);

    // Read-only and draft-only agents must reject write tools
    expect(() => assertAgentToolAllowed('workspace_analyst', 'create_task_draft')).toThrow();
    expect(() => assertAgentToolAllowed('proposal_drafter', 'create_client_draft')).toThrow();
    expect(() => assertAgentToolAllowed('knowledge_researcher', 'create_proposal_draft')).toThrow();

    // Orchestrator delegation enforces strict tool intersection and blocks autonomous writes
    expect(() =>
      enforceDelegatedToolAllowed('solodesk_orchestrator', 'workspace_analyst', 'get_workspace_summary')
    ).not.toThrow();
    expect(() =>
      enforceDelegatedToolAllowed('solodesk_orchestrator', 'workspace_analyst', 'create_task_draft')
    ).toThrow();
    expect(() =>
      enforceDelegatedToolAllowed('solodesk_orchestrator', 'proposal_drafter', 'search_knowledge')
    ).toThrow();
  });

  it('executes Class 3 approval-required agent without mutating IndexedDB until human approval, and honors AbortSignal', async () => {
    const preTasks = await repositories.listTasks();
    expect(preTasks).toHaveLength(0);

    const runOutcome = await runWorkforceAgent({
      agentId: 'workflow_action_proposer',
      goal: 'Prepare client onboarding follow-up task',
    });

    expect(runOutcome.status).toBe('completed');
    expect(runOutcome.proposedActions).toHaveLength(1);
    expect(runOutcome.proposedActions[0].tool).toBe('create_task_draft');

    // No side effects in IndexedDB before approval
    expect(await repositories.listTasks()).toHaveLength(0);

    // Explicitly approve proposed action
    const approval = await runActionWithApproval(runOutcome.proposedActions[0], true);
    expect(approval.executed).toBe(true);
    expect(await repositories.listTasks()).toHaveLength(1);

    // Pre-aborted signal returns clean cancelled state
    const controller = new AbortController();
    controller.abort();
    const cancelled = await runWorkforceAgent({
      agentId: 'workspace_analyst',
      goal: 'Run workspace audit',
      signal: controller.signal,
    });
    expect(cancelled.status).toBe('cancelled');
  });

  it('enforces dataset license verification, PII scan status, and use-case separation', () => {
    expect(DATASET_REGISTRY_MANIFEST.manifestVersion).toBe('3.0.0');
    const audit = auditDatasetRegistry();
    expect(audit.approvedEntries).toHaveLength(3);
    expect(audit.rejectedEntries).toHaveLength(3);

    const kbDataset = DATASET_REGISTRY_MANIFEST.entries.find(
      (e) => e.id === 'solodesk-freelancer-knowledge-packs-v1'
    )!;
    expect(evaluateDatasetUsePermission(kbDataset, 'rag_grounding').allowed).toBe(true);
    expect(evaluateDatasetUsePermission(kbDataset, 'fine_tuning').allowed).toBe(false);

    const kaggleCandidate = DATASET_REGISTRY_MANIFEST.entries.find(
      (e) => e.id === 'ext-kaggle-invoice-crm-dumps'
    )!;
    expect(evaluateDatasetUsePermission(kaggleCandidate, 'retrieval').allowed).toBe(false);
    expect(evaluateDatasetUsePermission(kaggleCandidate, 'fine_tuning').allowed).toBe(false);
  });

  it('computes deterministic Big.js Weekly Digest across rolling 7-day window', async () => {
    const client = await repositories.createClient({
      name: 'Digest Client',
      company: 'Digest Co',
      email: 'digest@example.com',
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
      name: 'Brand Sprint',
      description: '',
      status: 'active',
      priority: 'high',
      startDate: '2026-11-10',
      dueDate: '2026-11-25',
      budget: 2000,
      agreedValue: 2000,
      currency: 'USD',
      hourlyRate: 100,
      progress: 40,
      milestones: [],
      notes: '',
      isDemo: false,
    });

    await repositories.createFinanceEntry({
      type: 'income',
      category: 'Retainer',
      amount: 1200.55,
      currency: 'USD',
      date: '2026-11-16',
      clientId: client.id,
      projectId: project.id,
      invoiceId: '',
      paymentId: '',
      description: 'Weekly retainer payment',
      notes: 'Weekly payment',
      isDemo: false,
    });
    await repositories.createFinanceEntry({
      type: 'expense',
      category: 'Software',
      amount: 200.2,
      currency: 'USD',
      date: '2026-11-17',
      clientId: '',
      projectId: project.id,
      invoiceId: '',
      paymentId: '',
      description: 'Cloud infrastructure subscription',
      notes: 'Cloud tool',
      isDemo: false,
    });
    await repositories.createTask({
      title: 'Deliver final figma kit',
      description: '',
      status: 'todo',
      priority: 'high',
      dueDate: '2026-11-20',
      projectId: project.id,
      clientId: client.id,
      tags: [],
      subtasks: [],
      completedAt: '',
      isDemo: false,
    });

    const [projects, tasks, invoices, financeEntries, timeEntries] = await Promise.all([
      repositories.listProjects(),
      repositories.listTasks(),
      repositories.listInvoices(),
      repositories.listFinanceEntries(),
      repositories.listTimeEntries(),
    ]);

    const digest = generateWeeklyDigest({
      projects,
      tasks,
      invoices,
      financeEntries,
      timeEntries,
      today: '2026-11-18',
    });

    expect(digest.windowStart).toBe('2026-11-12');
    expect(digest.windowEnd).toBe('2026-11-18');
    expect(digest.incomeLast7Days).toBe(1200.55);
    expect(digest.expensesLast7Days).toBe(200.2);
    expect(digest.netLast7Days).toBe(1000.35);
    expect(digest.openTasksDueNext7Days).toBe(1);
    expect(digest.dataSource).toContain('IndexedDB');
  });

  it('publishes all 5 commercial tiers with honest payment blocker & Pakistan guidance', () => {
    expect(Object.keys(PLAN_ENTITLEMENTS)).toEqual([
      'free',
      'pro',
      'ultimate',
      'business',
      'enterprise',
    ]);
    expect(PLAN_ENTITLEMENTS.pro.checkoutStatus).toBe('BLOCKED_EXTERNAL_PROVIDER_REQUIRED');
    expect(PLAN_ENTITLEMENTS.pro.monthlyUsdPrice).toBe(15);
    expect(PLAN_ENTITLEMENTS.ultimate.monthlyUsdPrice).toBe(39);
    expect(PLAN_ENTITLEMENTS.business.monthlyUsdPrice).toBe(29);
    expect(PAKISTAN_PAYMENT_GUIDANCE.stripeStatus).toBe('UNSUPPORTED_IN_PAKISTAN_WITHOUT_FOREIGN_ENTITY');
    expect(PAKISTAN_PAYMENT_GUIDANCE.supportedLaunchPaths.length).toBeGreaterThanOrEqual(3);
  });
});
