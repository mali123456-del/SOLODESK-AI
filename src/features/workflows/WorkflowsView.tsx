import React, { useMemo, useState } from 'react';
import {
  Check,
  FlaskConical,
  Globe,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Webhook,
  Workflow,
  X,
} from 'lucide-react';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Tabs,
  useToast,
} from '../../components/ui';
import { repositories } from '../../database/repositories/dexieRepositories';
import { formatDisplayDate } from '../../domain/calculations/dates';
import type {
  CustomWorkflow,
  CustomWorkflowTrigger,
  WorkflowType,
} from '../../domain/schemas/entities';
import {
  executeOverdueInvoiceFollowupWithApproval,
  executeProposalWorkflowWithApproval,
  retryFailedWorkflowRun,
  simulateWorkflowDryRun,
} from '../../workflows/workflowEngine';
import type { AppRouteId } from '../../types/navigation';

interface WorkflowsViewProps {
  onNavigate?: (route: AppRouteId) => void;
}

const TRIGGER_LABELS: Array<{ value: CustomWorkflowTrigger; label: string }> = [
  { value: 'invoice_created', label: 'Invoice Created' },
  { value: 'invoice_overdue', label: 'Invoice Overdue' },
  { value: 'payment_received', label: 'Payment Received' },
  { value: 'task_completed', label: 'Task Completed' },
  { value: 'project_created', label: 'Project Created' },
  { value: 'appointment_approaching', label: 'Appointment Approaching' },
  { value: 'client_onboarded', label: 'Client Onboarded' },
  { value: 'approval_requested', label: 'Approval Requested' },
];

const ACTION_LABELS: Array<{
  value: CustomWorkflow['actionType'];
  label: string;
}> = [
  { value: 'create_task', label: 'Create Follow-Up Task' },
  { value: 'push_notification', label: 'Push Workspace Notification' },
  { value: 'log_activity', label: 'Log Workspace Activity' },
  { value: 'create_portal_approval', label: 'Queue Client Portal Approval' },
  { value: 'queue_webhook', label: 'Trigger Matching Outbound Webhook' },
];

export const WorkflowsView: React.FC<WorkflowsViewProps> = ({ onNavigate }) => {
  const {
    proposals,
    invoices,
    clients,
    workflowRuns,
    customWorkflows,
    webhooks,
    settings,
    refresh,
  } = useWorkspace();
  const { pushToast } = useToast();
  const dateFormat = settings?.dateFormat ?? 'DD MMM YYYY';

  const [tab, setTab] = useState<'approvals' | 'builder' | 'webhooks'>('approvals');
  const [dryRunType, setDryRunType] = useState<WorkflowType>('proposal_to_project_and_tasks');
  const [dryRunEntityId, setDryRunEntityId] = useState('');
  const [dryRunResult, setDryRunResult] = useState<{
    eligible: boolean;
    reason: string;
    plannedActions: string[];
  } | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  // Phase 21: Custom Workflow Builder state
  const [wfName, setWfName] = useState('');
  const [wfDescription, setWfDescription] = useState('');
  const [wfTrigger, setWfTrigger] = useState<CustomWorkflowTrigger>('invoice_overdue');
  const [wfCondField, setWfCondField] = useState('balanceDue');
  const [wfCondOp, setWfCondOp] = useState<CustomWorkflow['conditionOperator']>('greater_than');
  const [wfCondVal, setWfCondVal] = useState('0');
  const [wfAction, setWfAction] = useState<CustomWorkflow['actionType']>('create_task');
  const [wfActionTarget, setWfActionTarget] = useState('Follow up on automation trigger');
  const [wfRequireApproval, setWfRequireApproval] = useState(true);
  const [savingWorkflow, setSavingWorkflow] = useState(false);

  // Phase 21: Webhook state
  const [whName, setWhName] = useState('');
  const [whUrl, setWhUrl] = useState('');
  const [whEvent, setWhEvent] = useState<CustomWorkflowTrigger>('invoice_overdue');
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const executedProposalIds = useMemo(
    () =>
      new Set(
        workflowRuns
          .filter((r) => r.workflowType === 'proposal_to_project_and_tasks' && r.status === 'executed')
          .map((r) => r.triggerEntityId)
      ),
    [workflowRuns]
  );

  const executedInvoiceIds = useMemo(
    () =>
      new Set(
        workflowRuns
          .filter((r) => r.workflowType === 'overdue_invoice_followup_task' && r.status === 'executed')
          .map((r) => r.triggerEntityId)
      ),
    [workflowRuns]
  );

  const pendingProposals = useMemo(
    () => proposals.filter((p) => p.status === 'accepted' && !executedProposalIds.has(p.id)),
    [proposals, executedProposalIds]
  );

  const pendingOverdueInvoices = useMemo(
    () =>
      invoices.filter(
        (inv) =>
          inv.status === 'overdue' && inv.balanceDue > 0 && !executedInvoiceIds.has(inv.id)
      ),
    [invoices, executedInvoiceIds]
  );

  const dryRunCandidates = useMemo(() => {
    if (dryRunType === 'proposal_to_project_and_tasks') {
      return proposals.map((p) => ({
        value: p.id,
        label: `${p.number} — ${p.title} (${p.status})`,
      }));
    }
    if (dryRunType === 'overdue_invoice_followup_task') {
      return invoices.map((i) => ({
        value: i.id,
        label: `${i.number} — ${i.currency} ${i.balanceDue.toFixed(2)} (${i.status})`,
      }));
    }
    return [];
  }, [dryRunType, proposals, invoices]);

  const handleApproveProposal = async (proposalId: string, approved: boolean) => {
    setRunningId(proposalId);
    try {
      const res = await executeProposalWorkflowWithApproval(proposalId, approved);
      await refresh();
      pushToast({
        tone: approved ? 'success' : 'info',
        title: approved ? 'Workflow executed' : 'Workflow declined',
        description: res.run.summary,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Workflow failed',
        description: err instanceof Error ? err.message : 'Unable to execute workflow.',
      });
    } finally {
      setRunningId(null);
    }
  };

  const handleApproveInvoiceFollowup = async (invoiceId: string, approved: boolean) => {
    setRunningId(invoiceId);
    try {
      const res = await executeOverdueInvoiceFollowupWithApproval(invoiceId, approved);
      await refresh();
      pushToast({
        tone: approved ? 'success' : 'info',
        title: approved ? 'Follow-up task created' : 'Workflow declined',
        description: res.run.summary,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Workflow failed',
        description: err instanceof Error ? err.message : 'Unable to create follow-up task.',
      });
    } finally {
      setRunningId(null);
    }
  };

  const handleRetryRun = async (runId: string) => {
    setRunningId(runId);
    try {
      const res = await retryFailedWorkflowRun(runId);
      await refresh();
      pushToast({
        tone: 'success',
        title: 'Workflow retried successfully',
        description: res.run.summary,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Retry failed',
        description: err instanceof Error ? err.message : 'Unable to retry run.',
      });
    } finally {
      setRunningId(null);
    }
  };

  const handleDryRun = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetId = dryRunEntityId || dryRunCandidates[0]?.value || '';
    if (!targetId) {
      setDryRunResult({
        eligible: false,
        reason: 'No matching record exists in the workspace to simulate.',
        plannedActions: [],
      });
      return;
    }
    const sim = await simulateWorkflowDryRun(dryRunType, targetId);
    setDryRunResult(sim);
  };

  const handleCreateCustomWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wfName.trim()) return;
    setSavingWorkflow(true);
    try {
      await repositories.saveCustomWorkflow({
        name: wfName.trim(),
        description: wfDescription.trim(),
        triggerType: wfTrigger,
        conditionField: wfCondField.trim() || 'status',
        conditionOperator: wfCondOp,
        conditionValue: wfCondVal.trim(),
        actionType: wfAction,
        actionConfig: { label: wfActionTarget.trim() || wfName.trim() },
        requireApproval: wfRequireApproval,
        enabled: true,
        version: 1,
        lastExecutedAt: '',
      });
      setWfName('');
      setWfDescription('');
      await refresh();
      pushToast({
        tone: 'success',
        title: 'Custom workflow saved',
        description: 'Trigger-condition-action rule persisted locally in IndexedDB.',
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Invalid workflow configuration.',
      });
    } finally {
      setSavingWorkflow(false);
    }
  };

  const handleRunCustomWorkflow = async (wf: CustomWorkflow) => {
    setRunningId(wf.id);
    try {
      const actionLabel = wf.actionConfig.label || wf.name;
      if (wf.actionType === 'create_task') {
        await repositories.createTask({
          title: actionLabel,
          description: `Generated by workflow "${wf.name}" (v${wf.version}, trigger: ${wf.triggerType})`,
          status: 'todo',
          priority: 'medium',
          dueDate: '',
          projectId: '',
          clientId: '',
          tags: ['automation'],
          subtasks: [],
          completedAt: '',
          isDemo: false,
        });
      } else if (wf.actionType === 'push_notification') {
        await repositories.pushNotification({
          title: `Workflow: ${wf.name}`,
          message: actionLabel,
          severity: 'info',
          read: false,
          route: 'workflows',
        });
      } else {
        await repositories.logActivity({
          entityType: 'workflow',
          entityId: wf.id,
          action: 'executed_custom',
          summary: `${wf.name}: ${actionLabel}`,
        });
      }

      await repositories.saveCustomWorkflow({
        ...wf,
        version: wf.version + 1,
        lastExecutedAt: new Date().toISOString(),
      });
      await refresh();
      pushToast({
        tone: 'success',
        title: 'Custom workflow executed',
        description: `Completed ${wf.actionType} (${wf.name}).`,
      });
    } finally {
      setRunningId(null);
    }
  };

  const handleToggleWorkflow = async (wf: CustomWorkflow) => {
    await repositories.saveCustomWorkflow({ ...wf, enabled: !wf.enabled });
    await refresh();
  };

  const handleDeleteCustomWorkflow = async (id: string) => {
    await repositories.deleteCustomWorkflow(id);
    await refresh();
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whName.trim() || !whUrl.trim()) return;
    setSavingWebhook(true);
    try {
      const { validatePublicHttpUrl } = await import('../../security/urlPolicy');
      const check = validatePublicHttpUrl(whUrl.trim());
      if (!check.valid || !check.normalizedUrl) {
        await repositories.logSecurityEvent({
          eventType: 'webhook_ssrf_blocked',
          severity: 'warning',
          actor: 'local-owner',
          detail: `Blocked unsafe webhook URL "${whUrl.trim()}": ${check.reason ?? 'Policy denied'}`,
        });
        throw new Error(check.reason || 'Webhook destination violates SSRF safety policy.');
      }

      await repositories.saveWebhook({
        name: whName.trim(),
        url: check.normalizedUrl,
        eventType: whEvent,
        enabled: true,
        lastStatus: 'Not tested yet',
        lastAttemptAt: '',
      });
      setWhName('');
      setWhUrl('');
      await refresh();
      pushToast({
        tone: 'success',
        title: 'Webhook registered locally',
        description: 'Destination passed SSRF public-URL policy checks.',
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Invalid webhook',
        description: err instanceof Error ? err.message : 'Check webhook name and URL.',
      });
    } finally {
      setSavingWebhook(false);
    }
  };

  const handleTestWebhook = async (hookId: string, url: string, eventType: string) => {
    setTestingWebhookId(hookId);
    const now = new Date().toISOString();
    let statusText = '';
    try {
      const { validatePublicHttpUrl } = await import('../../security/urlPolicy');
      const check = validatePublicHttpUrl(url);
      if (!check.valid || !check.normalizedUrl) {
        await repositories.logSecurityEvent({
          eventType: 'webhook_ssrf_blocked',
          severity: 'warning',
          actor: 'local-owner',
          detail: `Blocked test dispatch to "${url}": ${check.reason ?? 'Policy denied'}`,
        });
        throw new Error(check.reason || 'Destination blocked by SSRF URL policy.');
      }
      const deliveryId = `del_${Date.now().toString(36)}`;
      const res = await fetch(check.normalizedUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Solodesk-Delivery-Id': deliveryId,
          'X-Solodesk-Event': eventType,
        },
        body: JSON.stringify({
          source: 'SOLODESK AI',
          deliveryId,
          eventType,
          test: true,
          timestamp: now,
        }),
      });
      statusText = `HTTP ${res.status} (${res.ok ? 'OK' : 'Error'})`;
      pushToast({
        tone: res.ok ? 'success' : 'warning',
        title: 'Webhook test finished',
        description: statusText,
      });
    } catch (err) {
      statusText = `Blocked / failed (${err instanceof Error ? err.message : 'CORS or offline'})`;
      pushToast({
        tone: 'warning',
        title: 'Webhook delivery failed or blocked',
        description: statusText,
      });
    } finally {
      const existing = webhooks.find((w) => w.id === hookId);
      if (existing) {
        await repositories.saveWebhook({
          ...existing,
          lastStatus: statusText,
          lastAttemptAt: now,
        });
        await refresh();
      }
      setTestingWebhookId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automation & Integration Marketplace"
        description="Deterministic, approval-gated workspace automations, visual Trigger-Condition-Action builder, webhooks, and execution history."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Tabs
              activeId={tab}
              onChange={(v) => setTab(v as 'approvals' | 'builder' | 'webhooks')}
              items={[
                { id: 'approvals', label: 'Built-In Queue', count: pendingProposals.length + pendingOverdueInvoices.length },
                { id: 'builder', label: 'Custom Rules', count: customWorkflows.length },
                { id: 'webhooks', label: 'Webhooks', count: webhooks.length },
              ]}
            />
            {onNavigate && (
              <Button variant="outline" onClick={() => onNavigate('tasks')}>
                Open Task Board
              </Button>
            )}
          </div>
        }
      />

      {tab === 'approvals' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <p className="text-xs font-semibold text-blue-600 dark:text-cyan-400">
                Rule 01 · Accepted Proposal
              </p>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                Proposal → Project & Deliverable Tasks
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                When a proposal reaches accepted status, generates one project and linked deliverable
                tasks after explicit user approval.
              </p>
            </Card>

            <Card>
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                Rule 02 · Overdue Invoice
              </p>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                Overdue Invoice → Follow-Up Task
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                Detects open overdue invoices and creates a high-priority client reminder task due
                tomorrow, once per invoice.
              </p>
            </Card>

            <Card>
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Rule 03 · Quotation Hand-off
              </p>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                Accepted Quote → Draft Invoice
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                Runs atomically in Quotation Studio with duplicate-conversion guard so totals and
                line items carry over cleanly.
              </p>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-6">
              <Card>
                <CardHeader
                  title={`Pending Approval Queue (${pendingProposals.length + pendingOverdueInvoices.length})`}
                  description="SOLODESK AI never mutates workspace records without explicit approval."
                />
                {pendingProposals.length === 0 && pendingOverdueInvoices.length === 0 ? (
                  <EmptyState
                    icon={<Workflow className="w-5 h-5" />}
                    title="No pending automation triggers"
                    description="Mark a proposal as accepted or review overdue invoices to queue deterministic follow-up actions."
                  />
                ) : (
                  <div className="space-y-3">
                    {pendingProposals.map((p) => (
                      <div
                        key={p.id}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-900 dark:text-white">
                              {p.number} · {p.title}
                            </span>
                            <Badge tone="info">Proposal → Project</Badge>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Client: {clientMap.get(p.clientId)?.name ?? 'Client'} ·{' '}
                            {p.deliverables.length || 3} tasks queued · {p.currency}{' '}
                            {p.pricingAmount.toFixed(2)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={runningId === p.id}
                            onClick={() => void handleApproveProposal(p.id, false)}
                            icon={<X className="w-3.5 h-3.5" />}
                          >
                            Decline
                          </Button>
                          <Button
                            size="sm"
                            loading={runningId === p.id}
                            onClick={() => void handleApproveProposal(p.id, true)}
                            icon={<Check className="w-3.5 h-3.5" />}
                          >
                            Approve & Run
                          </Button>
                        </div>
                      </div>
                    ))}

                    {pendingOverdueInvoices.map((inv) => (
                      <div
                        key={inv.id}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-900 dark:text-white">
                              Invoice {inv.number} ({inv.currency} {inv.balanceDue.toFixed(2)})
                            </span>
                            <Badge tone="warning">Overdue Follow-Up</Badge>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Client: {clientMap.get(inv.clientId)?.name ?? 'Client'} · Due{' '}
                            {formatDisplayDate(inv.dueDate, dateFormat)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={runningId === inv.id}
                            onClick={() => void handleApproveInvoiceFollowup(inv.id, false)}
                            icon={<X className="w-3.5 h-3.5" />}
                          >
                            Decline
                          </Button>
                          <Button
                            size="sm"
                            loading={runningId === inv.id}
                            onClick={() => void handleApproveInvoiceFollowup(inv.id, true)}
                            icon={<Check className="w-3.5 h-3.5" />}
                          >
                            Create Task
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card>
                <CardHeader
                  title={`Execution Audit Log (${workflowRuns.length})`}
                  description="Recorded outcomes stored locally in IndexedDB."
                />
                {workflowRuns.length === 0 ? (
                  <p className="text-xs text-slate-500">No workflow runs executed yet.</p>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {workflowRuns.map((run) => (
                      <div
                        key={run.id}
                        className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              tone={
                                run.status === 'executed'
                                  ? 'success'
                                  : run.status === 'failed'
                                    ? 'danger'
                                    : 'neutral'
                              }
                            >
                              {run.status}
                            </Badge>
                            <span className="text-xs font-mono text-slate-500">
                              {run.workflowType}
                            </span>
                          </div>
                          <p className="text-sm text-slate-800 dark:text-slate-100 mt-1">
                            {run.summary}
                          </p>
                          {run.errorMessage && (
                            <p className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">
                              {run.errorMessage}
                            </p>
                          )}
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Created {formatDisplayDate(run.createdAt, dateFormat)}
                          </p>
                        </div>
                        {run.status === 'failed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            loading={runningId === run.id}
                            onClick={() => void handleRetryRun(run.id)}
                            icon={<RotateCcw className="w-3.5 h-3.5" />}
                          >
                            Retry
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <div className="lg:col-span-5">
              <Card>
                <CardHeader
                  title="Workflow Rule Dry-Run Tester"
                  description="Simulate a rule condition against existing local records with zero writes."
                />
                <form onSubmit={handleDryRun} className="space-y-4">
                  <Select
                    label="Automation Rule"
                    value={dryRunType}
                    onChange={(e) => {
                      setDryRunType(e.target.value as WorkflowType);
                      setDryRunEntityId('');
                      setDryRunResult(null);
                    }}
                    options={[
                      {
                        value: 'proposal_to_project_and_tasks',
                        label: 'Accepted Proposal → Project & Tasks',
                      },
                      {
                        value: 'overdue_invoice_followup_task',
                        label: 'Overdue Invoice → Follow-Up Task',
                      },
                    ]}
                  />

                  <Select
                    label="Target Workspace Record"
                    value={dryRunEntityId || dryRunCandidates[0]?.value || ''}
                    onChange={(e) => {
                      setDryRunEntityId(e.target.value);
                      setDryRunResult(null);
                    }}
                    options={
                      dryRunCandidates.length > 0
                        ? dryRunCandidates
                        : [{ value: '', label: 'No matching records found' }]
                    }
                  />

                  <Button
                    type="submit"
                    variant="outline"
                    className="w-full"
                    icon={<FlaskConical className="w-4 h-4" />}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Play className="w-3 h-3" /> Run Dry-Run Simulation
                    </span>
                  </Button>
                </form>

                {dryRunResult && (
                  <div
                    className={`mt-4 p-3.5 rounded-xl border text-xs space-y-2 ${
                      dryRunResult.eligible
                        ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#101827] text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <p className="font-semibold">
                      {dryRunResult.eligible
                        ? 'Condition Passed (Ready to Run)'
                        : 'Condition Not Met / Blocked'}
                    </p>
                    <p>{dryRunResult.reason}</p>
                    {dryRunResult.plannedActions.length > 0 && (
                      <ul className="list-disc pl-4 space-y-1">
                        {dryRunResult.plannedActions.map((act) => (
                          <li key={act}>{act}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </>
      )}

      {tab === 'builder' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5">
            <Card>
              <CardHeader
                title="Visual Trigger-Condition-Action Builder"
                description="Compose versioned local automation rules across 8 workspace triggers."
              />
              <form onSubmit={handleCreateCustomWorkflow} className="space-y-3.5">
                <Input
                  label="Workflow Rule Name"
                  required
                  placeholder="e.g., High-Value Overdue Follow-Up"
                  value={wfName}
                  onChange={(e) => setWfName(e.target.value)}
                />
                <Input
                  label="Description (Optional)"
                  placeholder="When triggered, creates a priority task..."
                  value={wfDescription}
                  onChange={(e) => setWfDescription(e.target.value)}
                />
                <Select
                  label="1. Trigger Event"
                  value={wfTrigger}
                  onChange={(e) => setWfTrigger(e.target.value as CustomWorkflowTrigger)}
                  options={TRIGGER_LABELS}
                />
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    label="2. Field"
                    value={wfCondField}
                    onChange={(e) => setWfCondField(e.target.value)}
                  />
                  <Select
                    label="Operator"
                    value={wfCondOp}
                    onChange={(e) =>
                      setWfCondOp(e.target.value as CustomWorkflow['conditionOperator'])
                    }
                    options={[
                      { value: 'equals', label: 'equals' },
                      { value: 'not_equals', label: 'not equals' },
                      { value: 'greater_than', label: '>' },
                      { value: 'contains', label: 'contains' },
                    ]}
                  />
                  <Input
                    label="Value"
                    value={wfCondVal}
                    onChange={(e) => setWfCondVal(e.target.value)}
                  />
                </div>
                <Select
                  label="3. Action"
                  value={wfAction}
                  onChange={(e) => setWfAction(e.target.value as CustomWorkflow['actionType'])}
                  options={ACTION_LABELS}
                />
                <Input
                  label="Action Message / Task Title"
                  value={wfActionTarget}
                  onChange={(e) => setWfActionTarget(e.target.value)}
                />
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wfRequireApproval}
                    onChange={(e) => setWfRequireApproval(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Require explicit approval before execution</span>
                </label>
                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  loading={savingWorkflow}
                  icon={<Plus className="w-4 h-4" />}
                >
                  Save Custom Rule
                </Button>
              </form>
            </Card>
          </div>

          <div className="lg:col-span-7">
            <Card>
              <CardHeader
                title={`Saved Custom Workflows (${customWorkflows.length})`}
                description="Execute rules on demand or toggle active state. Protected by recursion guard (max depth 3, cycle dedup, 30/min rate cap)."
              />
              {customWorkflows.length === 0 ? (
                <EmptyState
                  icon={<Workflow className="w-6 h-6" />}
                  title="No custom workflows yet"
                  description="Use the Trigger-Condition-Action builder on the left to add your first automation rule."
                />
              ) : (
                <div className="space-y-3">
                  {customWorkflows.map((wf) => (
                    <div
                      key={wf.id}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-900 dark:text-white">
                              {wf.name}
                            </span>
                            <Badge tone={wf.enabled ? 'success' : 'neutral'}>
                              {wf.enabled ? 'Enabled' : 'Paused'}
                            </Badge>
                            <Badge tone="neutral">v{wf.version}</Badge>
                            {wf.requireApproval && <Badge tone="warning">Approval Gate</Badge>}
                          </div>
                          {wf.description && (
                            <p className="text-xs text-slate-500 mt-0.5">{wf.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleToggleWorkflow(wf)}
                          >
                            {wf.enabled ? 'Pause' : 'Enable'}
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            loading={runningId === wf.id}
                            disabled={!wf.enabled}
                            icon={<Play className="w-3.5 h-3.5" />}
                            onClick={() => void handleRunCustomWorkflow(wf)}
                          >
                            Run Now
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Delete ${wf.name}`}
                            onClick={() => void handleDeleteCustomWorkflow(wf.id)}
                          >
                            <Trash2 className="w-4 h-4 text-rose-600" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        WHEN {wf.triggerType} IF {wf.conditionField} {wf.conditionOperator}{' '}
                        {wf.conditionValue || '*'} → THEN {wf.actionType}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === 'webhooks' && (
        <div className="space-y-6">
          <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
            <Globe className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Static Browser Webhook Disclosure</p>
              <p className="mt-0.5">
                SOLODESK AI runs client-side without a server proxy. Outbound webhook calls use
                browser <code className="font-mono">fetch()</code> and require the destination
                endpoint to allow CORS requests from this origin.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5">
              <Card>
                <CardHeader
                  title="Register Outbound Webhook"
                  description="Send test JSON payloads from your browser to compatible endpoints."
                />
                <form onSubmit={handleCreateWebhook} className="space-y-3.5">
                  <Input
                    label="Integration Name"
                    required
                    placeholder="e.g., Zapier / Make / n8n Hook"
                    value={whName}
                    onChange={(e) => setWhName(e.target.value)}
                  />
                  <Input
                    label="Webhook Endpoint URL"
                    required
                    type="url"
                    placeholder="https://hooks.example.com/solodesk"
                    value={whUrl}
                    onChange={(e) => setWhUrl(e.target.value)}
                  />
                  <Select
                    label="Workspace Event"
                    value={whEvent}
                    onChange={(e) => setWhEvent(e.target.value as CustomWorkflowTrigger)}
                    options={TRIGGER_LABELS}
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full"
                    loading={savingWebhook}
                    icon={<Webhook className="w-4 h-4" />}
                  >
                    Add Webhook
                  </Button>
                </form>
              </Card>
            </div>

            <div className="lg:col-span-7">
              <Card>
                <CardHeader
                  title={`Configured Webhooks (${webhooks.length})`}
                  description="Stored locally in IndexedDB; no secret signing keys are persisted."
                />
                {webhooks.length === 0 ? (
                  <EmptyState
                    icon={<Webhook className="w-6 h-6" />}
                    title="No webhooks configured"
                    description="Register an HTTPS endpoint to test event payloads from this browser."
                  />
                ) : (
                  <div className="space-y-3">
                    {webhooks.map((hook) => (
                      <div
                        key={hook.id}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-900 dark:text-white">
                              {hook.name}
                            </span>
                            <Badge tone="info">{hook.eventType}</Badge>
                          </div>
                          <p className="text-xs font-mono text-slate-500 truncate mt-0.5">
                            {hook.url}
                          </p>
                          {hook.lastStatus && (
                            <p className="text-[11px] text-slate-500 mt-1">
                              Last attempt: {hook.lastStatus}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            loading={testingWebhookId === hook.id}
                            onClick={() =>
                              void handleTestWebhook(hook.id, hook.url, hook.eventType)
                            }
                          >
                            Test POST
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Delete ${hook.name}`}
                            onClick={() =>
                              void repositories.deleteWebhook(hook.id).then(() => refresh())
                            }
                          >
                            <Trash2 className="w-4 h-4 text-rose-600" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

