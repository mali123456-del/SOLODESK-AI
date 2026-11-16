import React, { useMemo, useState } from 'react';
import { Check, FlaskConical, Play, RotateCcw, Workflow, X } from 'lucide-react';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Select,
  useToast,
} from '../../components/ui';
import { formatDisplayDate } from '../../domain/calculations/dates';
import type { WorkflowType } from '../../domain/schemas/entities';
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

export const WorkflowsView: React.FC<WorkflowsViewProps> = ({ onNavigate }) => {
  const { proposals, invoices, clients, workflowRuns, settings, refresh } = useWorkspace();
  const { pushToast } = useToast();
  const dateFormat = settings?.dateFormat ?? 'DD MMM YYYY';

  const [dryRunType, setDryRunType] = useState<WorkflowType>('proposal_to_project_and_tasks');
  const [dryRunEntityId, setDryRunEntityId] = useState('');
  const [dryRunResult, setDryRunResult] = useState<{
    eligible: boolean;
    reason: string;
    plannedActions: string[];
  } | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

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
    () =>
      proposals.filter(
        (p) => p.status === 'accepted' && !executedProposalIds.has(p.id)
      ),
    [proposals, executedProposalIds]
  );

  const pendingOverdueInvoices = useMemo(
    () =>
      invoices.filter(
        (inv) =>
          inv.status === 'overdue' &&
          inv.balanceDue > 0 &&
          !executedInvoiceIds.has(inv.id)
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automation & Workflow Engine"
        description="Deterministic, approval-gated workspace automations with duplicate-run protection, dry-run testing, and immutable execution history."
        actions={
          onNavigate && (
            <Button variant="outline" onClick={() => onNavigate('tasks')}>
              Open Task Board
            </Button>
          )
        }
      />

      {/* Supported Automation Rules */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <p className="text-xs font-semibold text-blue-600 dark:text-cyan-400">Rule 01 · Accepted Proposal</p>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-1">
            Proposal → Project & Deliverable Tasks
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
            When a proposal reaches accepted status, generates one project and linked deliverable tasks after explicit user approval.
          </p>
        </Card>

        <Card>
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Rule 02 · Overdue Invoice</p>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-1">
            Overdue Invoice → Follow-Up Task
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
            Detects open overdue invoices and creates a high-priority client reminder task due tomorrow, once per invoice.
          </p>
        </Card>

        <Card>
          <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Rule 03 · Quotation Hand-off</p>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-1">
            Accepted Quote → Draft Invoice
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
            Runs atomically in Quotation Studio with duplicate-conversion guard so totals and line items carry over cleanly.
          </p>
        </Card>
      </div>

      {/* Pending Approval Queue */}
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
                        {p.deliverables.length || 3} tasks queued · {p.currency} {p.pricingAmount.toFixed(2)}
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
                  <div key={run.id} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
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
                        <span className="text-xs font-mono text-slate-500">{run.workflowType}</span>
                      </div>
                      <p className="text-sm text-slate-800 dark:text-slate-100 mt-1">{run.summary}</p>
                      {run.errorMessage && (
                        <p className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">{run.errorMessage}</p>
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
                  { value: 'proposal_to_project_and_tasks', label: 'Accepted Proposal → Project & Tasks' },
                  { value: 'overdue_invoice_followup_task', label: 'Overdue Invoice → Follow-Up Task' },
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
                  {dryRunResult.eligible ? 'Condition Passed (Ready to Run)' : 'Condition Not Met / Blocked'}
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
    </div>
  );
};
