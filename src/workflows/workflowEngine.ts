import { ConflictError, NotFoundError, ValidationError } from '../core/errors';
import { db as defaultDb, type SolodeskDatabase } from '../database/db';
import { DexieSolodeskRepositories, repositories as defaultRepos } from '../database/repositories/dexieRepositories';
import { addDaysToDateStr, todayDateStr } from '../domain/calculations/dates';
import { createId, type Project, type Task, type WorkflowRun, type WorkflowType } from '../domain/schemas/entities';

export interface WorkflowProposalPreview {
  workflowType: WorkflowType;
  triggerEntityType: 'proposal' | 'quotation';
  triggerEntityId: string;
  alreadyExecuted: boolean;
  existingRun?: WorkflowRun;
  title: string;
  plannedActions: string[];
  draftProject: {
    name: string;
    budget: number;
    currency: string;
    dueDate: string;
  };
  draftTasks: Array<{ title: string; priority: 'medium' | 'high' }>;
}

export interface WorkflowExecutionResult {
  run: WorkflowRun;
  project?: Project;
  tasks: Task[];
}

export async function previewProposalWorkflow(
  proposalId: string,
  repo: DexieSolodeskRepositories = defaultRepos
): Promise<WorkflowProposalPreview> {
  const proposals = await repo.listProposals();
  const proposal = proposals.find((p) => p.id === proposalId);
  if (!proposal) throw new NotFoundError('Proposal', proposalId);

  const existingRun = await repo.findExecutedWorkflowRun(
    'proposal_to_project_and_tasks',
    proposal.id
  );

  const deliverables =
    proposal.deliverables.length > 0
      ? proposal.deliverables
      : ['Kickoff & Requirements Confirmation', 'Core Delivery Milestone', 'Final Review & Sign-off'];

  const startDate = todayDateStr();
  const dueDate = proposal.validUntil && proposal.validUntil >= startDate
    ? proposal.validUntil
    : addDaysToDateStr(startDate, 21);

  return {
    workflowType: 'proposal_to_project_and_tasks',
    triggerEntityType: 'proposal',
    triggerEntityId: proposal.id,
    alreadyExecuted: Boolean(existingRun),
    existingRun,
    title: `Convert Accepted Proposal "${proposal.number}" into Project & Deliverable Tasks`,
    plannedActions: [
      `Create Project "${proposal.title}" (${proposal.currency} ${proposal.pricingAmount})`,
      `Create ${deliverables.length} linked Task(s) from proposal deliverables`,
      'Record immutable workflow execution audit entry',
    ],
    draftProject: {
      name: proposal.title,
      budget: proposal.pricingAmount,
      currency: proposal.currency,
      dueDate,
    },
    draftTasks: deliverables.map((d, i) => ({
      title: d,
      priority: i === 0 ? 'high' : 'medium',
    })),
  };
}

export async function executeProposalWorkflowWithApproval(
  proposalId: string,
  approved: boolean,
  options: {
    repo?: DexieSolodeskRepositories;
    database?: SolodeskDatabase;
  } = {}
): Promise<WorkflowExecutionResult> {
  const database = options.database ?? defaultDb;
  const repo = options.repo ?? new DexieSolodeskRepositories(database);
  const proposals = await repo.listProposals();
  const proposal = proposals.find((p) => p.id === proposalId);
  if (!proposal) throw new NotFoundError('Proposal', proposalId);

  if (proposal.status !== 'accepted') {
    throw new ValidationError(
      `Proposal "${proposal.number}" must be marked "accepted" before generating project & tasks.`
    );
  }

  const existingExecuted = await repo.findExecutedWorkflowRun(
    'proposal_to_project_and_tasks',
    proposal.id
  );
  if (existingExecuted) {
    throw new ConflictError(
      `Workflow already executed for proposal ${proposal.number} (Run ${existingExecuted.id}). Duplicate execution blocked.`
    );
  }

  const now = new Date().toISOString();
  if (!approved) {
    const rejectedRun = await repo.saveWorkflowRun({
      id: createId('wfr'),
      workflowType: 'proposal_to_project_and_tasks',
      triggerEntityType: 'proposal',
      triggerEntityId: proposal.id,
      status: 'rejected',
      summary: `User declined project generation for proposal ${proposal.number}`,
      createdEntityIds: [],
      errorMessage: '',
      createdAt: now,
      executedAt: '',
    });
    return { run: rejectedRun, tasks: [] };
  }

  const preview = await previewProposalWorkflow(proposal.id, repo);
  const startDate = todayDateStr();

  try {
    const project = await repo.createProject({
      clientId: proposal.clientId,
      name: preview.draftProject.name,
      description: proposal.overview || proposal.scopeOfWork || `Generated from proposal ${proposal.number}`,
      status: 'active',
      priority: 'medium',
      startDate,
      dueDate: preview.draftProject.dueDate,
      budget: preview.draftProject.budget,
      agreedValue: preview.draftProject.budget,
      currency: preview.draftProject.currency,
      hourlyRate: (await repo.getSettings()).defaultHourlyRate,
      progress: 0,
      milestones: [],
      notes: `Source proposal: ${proposal.number}`,
      isDemo: proposal.isDemo,
    });

    const createdTasks: Task[] = [];
    for (const draftTask of preview.draftTasks) {
      const task = await repo.createTask({
        projectId: project.id,
        clientId: proposal.clientId,
        title: draftTask.title,
        description: `Deliverable from proposal ${proposal.number}`,
        status: 'todo',
        priority: draftTask.priority,
        dueDate: preview.draftProject.dueDate,
        tags: ['from-proposal'],
        subtasks: [],
        completedAt: '',
        isDemo: proposal.isDemo,
      });
      createdTasks.push(task);
    }

    await repo.updateProposal(proposal.id, { projectId: project.id });

    const run = await repo.saveWorkflowRun({
      id: createId('wfr'),
      workflowType: 'proposal_to_project_and_tasks',
      triggerEntityType: 'proposal',
      triggerEntityId: proposal.id,
      status: 'executed',
      summary: `Created project "${project.name}" and ${createdTasks.length} task(s) from ${proposal.number}`,
      createdEntityIds: [project.id, ...createdTasks.map((t) => t.id)],
      errorMessage: '',
      createdAt: now,
      executedAt: new Date().toISOString(),
    });

    await repo.logActivity({
      entityType: 'workflow',
      entityId: run.id,
      action: 'executed',
      summary: run.summary,
    });

    return { run, project, tasks: createdTasks };
  } catch (err) {
    const failedRun = await repo.saveWorkflowRun({
      id: createId('wfr'),
      workflowType: 'proposal_to_project_and_tasks',
      triggerEntityType: 'proposal',
      triggerEntityId: proposal.id,
      status: 'failed',
      summary: `Failed generating project from proposal ${proposal.number}`,
      createdEntityIds: [],
      errorMessage: err instanceof Error ? err.message : 'Unknown workflow error',
      createdAt: now,
      executedAt: '',
    });
    throw Object.assign(err instanceof Error ? err : new Error('Workflow failed'), { run: failedRun });
  }
}

export interface OverdueInvoiceWorkflowPreview {
  workflowType: 'overdue_invoice_followup_task';
  triggerEntityType: 'invoice';
  triggerEntityId: string;
  alreadyExecuted: boolean;
  existingRun?: WorkflowRun;
  title: string;
  plannedActions: string[];
  draftTask: {
    title: string;
    priority: 'high';
    dueDate: string;
  };
}

export async function previewOverdueInvoiceFollowupWorkflow(
  invoiceId: string,
  repo: DexieSolodeskRepositories = defaultRepos
): Promise<OverdueInvoiceWorkflowPreview> {
  const invoice = await repo.getInvoice(invoiceId);
  if (!invoice) throw new NotFoundError('Invoice', invoiceId);
  const existingRun = await repo.findExecutedWorkflowRun(
    'overdue_invoice_followup_task',
    invoice.id
  );
  const client = await repo.getClient(invoice.clientId);
  const dueDate = addDaysToDateStr(todayDateStr(), 1);
  return {
    workflowType: 'overdue_invoice_followup_task',
    triggerEntityType: 'invoice',
    triggerEntityId: invoice.id,
    alreadyExecuted: Boolean(existingRun),
    existingRun,
    title: `Create Follow-Up Reminder Task for Overdue Invoice ${invoice.number}`,
    plannedActions: [
      `Create high-priority task referencing ${invoice.number} (${invoice.currency} ${invoice.balanceDue.toFixed(2)} balance)`,
      `Link task to client ${client?.name ?? invoice.clientId}`,
      'Record workflow run audit entry',
    ],
    draftTask: {
      title: `Follow up on overdue invoice ${invoice.number} (${client?.name ?? 'Client'})`,
      priority: 'high',
      dueDate,
    },
  };
}

export async function executeOverdueInvoiceFollowupWithApproval(
  invoiceId: string,
  approved: boolean,
  options: { repo?: DexieSolodeskRepositories; database?: SolodeskDatabase } = {}
): Promise<WorkflowExecutionResult> {
  const database = options.database ?? defaultDb;
  const repo = options.repo ?? new DexieSolodeskRepositories(database);
  const invoice = await repo.getInvoice(invoiceId);
  if (!invoice) throw new NotFoundError('Invoice', invoiceId);
  if (invoice.balanceDue <= 0 || invoice.status === 'paid' || invoice.status === 'cancelled') {
    throw new ValidationError(`Invoice ${invoice.number} has no open balance to follow up on.`);
  }
  const existingExecuted = await repo.findExecutedWorkflowRun(
    'overdue_invoice_followup_task',
    invoice.id
  );
  if (existingExecuted) {
    throw new ConflictError(
      `Follow-up workflow already executed for invoice ${invoice.number} (Run ${existingExecuted.id}).`
    );
  }
  const now = new Date().toISOString();
  if (!approved) {
    const rejectedRun = await repo.saveWorkflowRun({
      id: createId('wfr'),
      workflowType: 'overdue_invoice_followup_task',
      triggerEntityType: 'invoice',
      triggerEntityId: invoice.id,
      status: 'rejected',
      summary: `User declined follow-up task generation for invoice ${invoice.number}`,
      createdEntityIds: [],
      errorMessage: '',
      createdAt: now,
      executedAt: '',
    });
    return { run: rejectedRun, tasks: [] };
  }

  const preview = await previewOverdueInvoiceFollowupWorkflow(invoice.id, repo);
  try {
    const task = await repo.createTask({
      projectId: invoice.projectId,
      clientId: invoice.clientId,
      title: preview.draftTask.title,
      description: `Automated reminder for invoice ${invoice.number}. Due date was ${invoice.dueDate}; remaining balance ${invoice.currency} ${invoice.balanceDue.toFixed(2)}.`,
      status: 'todo',
      priority: 'high',
      dueDate: preview.draftTask.dueDate,
      tags: ['invoice-followup', 'workflow'],
      subtasks: [],
      completedAt: '',
      isDemo: invoice.isDemo,
    });
    const run = await repo.saveWorkflowRun({
      id: createId('wfr'),
      workflowType: 'overdue_invoice_followup_task',
      triggerEntityType: 'invoice',
      triggerEntityId: invoice.id,
      status: 'executed',
      summary: `Created follow-up task "${task.title}" for invoice ${invoice.number}`,
      createdEntityIds: [task.id],
      errorMessage: '',
      createdAt: now,
      executedAt: new Date().toISOString(),
    });
    await repo.logActivity({
      entityType: 'workflow',
      entityId: run.id,
      action: 'executed',
      summary: run.summary,
    });
    return { run, tasks: [task] };
  } catch (err) {
    const failedRun = await repo.saveWorkflowRun({
      id: createId('wfr'),
      workflowType: 'overdue_invoice_followup_task',
      triggerEntityType: 'invoice',
      triggerEntityId: invoice.id,
      status: 'failed',
      summary: `Failed follow-up workflow for invoice ${invoice.number}`,
      createdEntityIds: [],
      errorMessage: err instanceof Error ? err.message : 'Unknown workflow error',
      createdAt: now,
      executedAt: '',
    });
    throw Object.assign(err instanceof Error ? err : new Error('Workflow failed'), { run: failedRun });
  }
}

export async function retryFailedWorkflowRun(
  runId: string,
  options: { repo?: DexieSolodeskRepositories; database?: SolodeskDatabase } = {}
): Promise<WorkflowExecutionResult> {
  const database = options.database ?? defaultDb;
  const repo = options.repo ?? new DexieSolodeskRepositories(database);
  const runs = await repo.listWorkflowRuns();
  const run = runs.find((r) => r.id === runId);
  if (!run) throw new NotFoundError('WorkflowRun', runId);
  if (run.status !== 'failed') {
    throw new ValidationError('Only failed workflow runs can be retried.');
  }
  if (run.workflowType === 'proposal_to_project_and_tasks') {
    return executeProposalWorkflowWithApproval(run.triggerEntityId, true, { repo, database });
  }
  if (run.workflowType === 'overdue_invoice_followup_task') {
    return executeOverdueInvoiceFollowupWithApproval(run.triggerEntityId, true, { repo, database });
  }
  throw new ValidationError(`Retry is not supported for workflow type "${run.workflowType}".`);
}

export async function simulateWorkflowDryRun(
  workflowType: WorkflowType,
  triggerEntityId: string,
  repo: DexieSolodeskRepositories = defaultRepos
): Promise<{
  eligible: boolean;
  reason: string;
  plannedActions: string[];
}> {
  if (workflowType === 'proposal_to_project_and_tasks') {
    const proposals = await repo.listProposals();
    const prp = proposals.find((p) => p.id === triggerEntityId);
    if (!prp) return { eligible: false, reason: 'Selected proposal not found.', plannedActions: [] };
    const existing = await repo.findExecutedWorkflowRun(workflowType, prp.id);
    if (existing) {
      return {
        eligible: false,
        reason: `Already executed in run ${existing.id}. Duplicate prevention blocks re-run.`,
        plannedActions: [],
      };
    }
    if (prp.status !== 'accepted') {
      return {
        eligible: false,
        reason: `Proposal ${prp.number} is "${prp.status}". Must be "accepted" to pass rule condition.`,
        plannedActions: [],
      };
    }
    const preview = await previewProposalWorkflow(prp.id, repo);
    return {
      eligible: true,
      reason: `Condition met: Proposal ${prp.number} is accepted and has no prior executed run.`,
      plannedActions: preview.plannedActions,
    };
  }

  if (workflowType === 'overdue_invoice_followup_task') {
    const inv = await repo.getInvoice(triggerEntityId);
    if (!inv) return { eligible: false, reason: 'Selected invoice not found.', plannedActions: [] };
    const existing = await repo.findExecutedWorkflowRun(workflowType, inv.id);
    if (existing) {
      return {
        eligible: false,
        reason: `Already executed in run ${existing.id}. Duplicate prevention blocks re-run.`,
        plannedActions: [],
      };
    }
    if (inv.balanceDue <= 0 || inv.status === 'paid' || inv.status === 'cancelled') {
      return {
        eligible: false,
        reason: `Invoice ${inv.number} is ${inv.status} with zero open balance.`,
        plannedActions: [],
      };
    }
    const preview = await previewOverdueInvoiceFollowupWorkflow(inv.id, repo);
    return {
      eligible: true,
      reason: `Condition met: Invoice ${inv.number} has open balance ${inv.currency} ${inv.balanceDue.toFixed(2)}.`,
      plannedActions: preview.plannedActions,
    };
  }

  return {
    eligible: false,
    reason: 'Quotation conversion runs directly from the Quotation Studio atomic action.',
    plannedActions: [],
  };
}

export async function signWebhookPayload(secret: string, bodyJson: string): Promise<string> {
  if (!secret || typeof crypto === 'undefined' || !crypto.subtle) return '';
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(bodyJson));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function registerValidatedWebhook(
  input: {
    name: string;
    url: string;
    eventType: 'invoice_created' | 'invoice_overdue' | 'payment_received' | 'task_completed' | 'project_created' | 'appointment_approaching' | 'client_onboarded' | 'approval_requested';
  },
  repo: DexieSolodeskRepositories = defaultRepos
) {
  const { validatePublicHttpUrl } = await import('../security/urlPolicy');
  const check = validatePublicHttpUrl(input.url);
  if (!check.valid || !check.normalizedUrl) {
    await repo.logSecurityEvent({
      eventType: 'webhook_ssrf_blocked',
      severity: 'warning',
      actor: 'local-owner',
      detail: `Blocked unsafe webhook URL "${input.url}": ${check.reason ?? 'Policy denied'}`,
    });
    throw new ValidationError(check.reason || 'Webhook destination violates SSRF policy.');
  }
  return repo.saveWebhook({
    name: input.name.trim(),
    url: check.normalizedUrl,
    eventType: input.eventType,
    enabled: true,
    lastStatus: 'Not tested yet',
    lastAttemptAt: '',
  });
}

