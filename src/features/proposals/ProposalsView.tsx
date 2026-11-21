import React, { useMemo, useState } from 'react';
import { Check, Download, Edit3, FileText, GitBranch, History, Paperclip, Plus, Search, Trash2, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Tabs,
  Textarea,
  useToast,
  type ColumnDef,
} from '../../components/ui';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import { repositories } from '../../database/repositories/dexieRepositories';
import { formatDisplayDate } from '../../domain/calculations/dates';
import { formatMoney, SUPPORTED_CURRENCIES } from '../../domain/calculations/money';
import type { Proposal, ProposalStatus } from '../../domain/schemas/entities';
import { generateProposalPdf } from '../../pdf/pdfGenerator';
import {
  executeProposalWorkflowWithApproval,
  previewProposalWorkflow,
  type WorkflowProposalPreview,
} from '../../workflows/workflowEngine';

export const ProposalsView: React.FC = () => {
  const { proposals, clients, projects, templates, vaultFiles, businessProfile, settings, refresh } =
    useWorkspace();
  const { pushToast } = useToast();

  const [statusFilter, setStatusFilter] = useState<'all' | ProposalStatus>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Proposal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Proposal | null>(null);

  const defaultCurrency = settings?.defaultCurrency ?? 'USD';
  const dateFormat = settings?.dateFormat ?? 'DD MMM YYYY';

  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [overview, setOverview] = useState('');
  const [scopeOfWork, setScopeOfWork] = useState('');
  const [deliverablesText, setDeliverablesText] = useState('');
  const [timeline, setTimeline] = useState('');
  const [pricingAmount, setPricingAmount] = useState('0');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [terms, setTerms] = useState('50% upfront, 50% upon delivery.');
  const [validUntil, setValidUntil] = useState('');
  const [status, setStatus] = useState<ProposalStatus>('draft');
  const [saving, setSaving] = useState(false);

  const [workflowPreview, setWorkflowPreview] = useState<WorkflowProposalPreview | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState(false);

  const handleOpenWorkflowPreview = async (proposal: Proposal) => {
    setWorkflowLoading(true);
    try {
      const preview = await previewProposalWorkflow(proposal.id);
      setWorkflowPreview(preview);
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Cannot preview workflow',
        description: err instanceof Error ? err.message : 'Unexpected error.',
      });
    } finally {
      setWorkflowLoading(false);
    }
  };

  const handleWorkflowDecision = async (approved: boolean) => {
    if (!workflowPreview) return;
    setWorkflowLoading(true);
    try {
      const result = await executeProposalWorkflowWithApproval(
        workflowPreview.triggerEntityId,
        approved
      );
      await refresh();
      setWorkflowPreview(null);
      if (approved && result.project) {
        pushToast({
          tone: 'success',
          title: 'Project & deliverable tasks created',
          description: `Created "${result.project.name}" with ${result.tasks.length} task(s).`,
        });
      } else {
        pushToast({
          tone: 'info',
          title: 'Workflow cancelled',
          description: 'No project or task records were created.',
        });
      }
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Workflow blocked',
        description: err instanceof Error ? err.message : 'Execution failed.',
      });
    } finally {
      setWorkflowLoading(false);
    }
  };

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const proposalTemplates = useMemo(
    () => templates.filter((t) => t.kind === 'proposal'),
    [templates]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return proposals.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (!q) return true;
      const cname = clientMap.get(p.clientId)?.name.toLowerCase() ?? '';
      return (
        p.title.toLowerCase().includes(q) ||
        p.number.toLowerCase().includes(q) ||
        cname.includes(q)
      );
    });
  }, [proposals, statusFilter, search, clientMap]);

  const selected = useMemo(
    () => proposals.find((p) => p.id === selectedId) ?? null,
    [proposals, selectedId]
  );

  const openCreate = () => {
    setEditing(null);
    setClientId(clients[0]?.id ?? '');
    setProjectId('');
    setTitle('');
    setOverview('');
    setScopeOfWork('');
    setDeliverablesText('');
    setTimeline('4 Weeks');
    setPricingAmount('0');
    setCurrency(defaultCurrency);
    setTerms('50% deposit before kickoff, 50% on final sign-off.');
    setValidUntil('');
    setStatus('draft');
    setModalOpen(true);
  };

  const openEdit = (p: Proposal) => {
    setEditing(p);
    setClientId(p.clientId);
    setProjectId(p.projectId);
    setTitle(p.title);
    setOverview(p.overview);
    setScopeOfWork(p.scopeOfWork);
    setDeliverablesText(p.deliverables.join('\n'));
    setTimeline(p.timeline);
    setPricingAmount(String(p.pricingAmount));
    setCurrency(p.currency);
    setTerms(p.terms);
    setValidUntil(p.validUntil);
    setStatus(p.status);
    setModalOpen(true);
  };

  const applyTemplate = (tplId: string) => {
    const tpl = proposalTemplates.find((t) => t.id === tplId);
    if (!tpl) return;
    if (!title.trim()) setTitle(tpl.name);
    setScopeOfWork(tpl.content);
  };

  const handleToggleProposalVaultAttachment = async (proposal: Proposal, vaultFileId: string) => {
    const current = proposal.attachmentVaultIds ?? [];
    const exists = current.includes(vaultFileId);
    const next = exists ? current.filter((id) => id !== vaultFileId) : [...current, vaultFileId];
    await repositories.updateProposal(proposal.id, { attachmentVaultIds: next });
    await refresh();
    pushToast({
      tone: 'success',
      title: exists ? 'Attachment detached' : 'Vault file attached',
      description: `Updated attachments on ${proposal.number}.`,
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !title.trim()) return;
    setSaving(true);
    try {
      const deliverables = deliverablesText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const payload = {
        clientId,
        projectId,
        title: title.trim(),
        overview,
        scopeOfWork,
        deliverables,
        timeline,
        pricingAmount: Math.max(0, Number(pricingAmount) || 0),
        currency,
        terms,
        validUntil,
        status,
      };
      if (editing) {
        const updated = await repositories.updateProposal(editing.id, payload);
        setSelectedId(updated.id);
        pushToast({ tone: 'success', title: 'Proposal updated', description: updated.number });
      } else {
        const created = await repositories.createProposal({ ...payload, isDemo: false });
        setSelectedId(created.id);
        pushToast({ tone: 'success', title: 'Proposal created', description: created.number });
      }
      await refresh();
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<Proposal>[] = [
    {
      key: 'number',
      header: 'Proposal',
      sortValue: (p) => p.number,
      render: (p) => (
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{p.title}</p>
          <p className="text-xs text-slate-500 font-mono">
            {p.number} · {clientMap.get(p.clientId)?.name ?? 'Client'}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => (
        <Badge
          tone={
            p.status === 'accepted'
              ? 'success'
              : p.status === 'sent'
                ? 'info'
                : p.status === 'rejected'
                  ? 'danger'
                  : 'neutral'
          }
        >
          {p.status}
        </Badge>
      ),
    },
    {
      key: 'amount',
      header: 'Pricing',
      align: 'right',
      sortValue: (p) => p.pricingAmount,
      render: (p) => (
        <span className="font-mono text-xs">{formatMoney(p.pricingAmount, p.currency)}</span>
      ),
    },
    {
      key: 'validUntil',
      header: 'Valid Until',
      render: (p) => (
        <span className="text-xs text-slate-500">{formatDisplayDate(p.validUntil, dateFormat)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proposals"
        description="Draft structured client proposals with scope, deliverables, timeline, and PDF export."
        actions={
          <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>
            New Proposal
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Tabs
          activeId={statusFilter}
          onChange={(id) => setStatusFilter(id as typeof statusFilter)}
          items={[
            { id: 'all', label: 'All', count: proposals.length },
            { id: 'draft', label: 'Draft', count: proposals.filter((p) => p.status === 'draft').length },
            { id: 'sent', label: 'Sent', count: proposals.filter((p) => p.status === 'sent').length },
            { id: 'accepted', label: 'Accepted', count: proposals.filter((p) => p.status === 'accepted').length },
          ]}
        />
        <div className="w-full sm:w-64">
          <Input
            placeholder="Search proposals..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
            aria-label="Search proposals"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className={selected ? 'xl:col-span-2' : 'xl:col-span-3'}>
          <DataTable
            data={filtered}
            columns={columns}
            keyExtractor={(p) => p.id}
            onRowClick={(p) => setSelectedId(p.id)}
            ariaLabel="Proposals table"
            emptyState={
              <EmptyState
                icon={<FileText className="w-5 h-5" />}
                title="No proposals yet"
                description="Create a clear scope proposal for your client and export it as a PDF."
                action={
                  clients.length > 0 ? (
                    <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>
                      Create Proposal
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        </div>

        {selected && (
          <Card className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-mono text-slate-500">{selected.number}</p>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{selected.title}</h2>
                <p className="text-xs text-slate-500">
                  {clientMap.get(selected.clientId)?.name ?? 'Client'} ·{' '}
                  {formatMoney(selected.pricingAmount, selected.currency)}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge tone="neutral">v{selected.revision ?? 1}</Badge>
                <Badge tone={selected.status === 'accepted' ? 'success' : 'info'}>
                  {selected.status}
                </Badge>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => openEdit(selected)}
                icon={<Edit3 className="w-3.5 h-3.5" />}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  void generateProposalPdf(
                    selected,
                    clientMap.get(selected.clientId),
                    businessProfile,
                    dateFormat
                  )
                }
                icon={<Download className="w-3.5 h-3.5" />}
              >
                Download PDF
              </Button>
              {selected.status === 'accepted' && (
                <Button
                  size="sm"
                  variant="primary"
                  loading={workflowLoading}
                  onClick={() => void handleOpenWorkflowPreview(selected)}
                  icon={<GitBranch className="w-3.5 h-3.5" />}
                >
                  Generate Project & Tasks
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeleteTarget(selected)}
                aria-label="Delete proposal"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-600" />
              </Button>
            </div>

            {selected.overview && (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Overview
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                  {selected.overview}
                </p>
              </div>
            )}

            {selected.deliverables.length > 0 && (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Deliverables
                </p>
                <ul className="list-disc pl-4 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  {selected.deliverables.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5" aria-hidden="true" />
                  Vault Attachments ({(selected.attachmentVaultIds ?? []).length})
                </span>
              </div>
              {(selected.attachmentVaultIds ?? []).length > 0 && (
                <ul className="space-y-1">
                  {(selected.attachmentVaultIds ?? []).map((vid) => {
                    const vf = vaultFiles.find((f) => f.id === vid);
                    return (
                      <li
                        key={vid}
                        className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#101827]"
                      >
                        <span className="truncate text-slate-700 dark:text-slate-200">
                          {vf ? vf.name : vid}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleToggleProposalVaultAttachment(selected, vid)}
                          className="text-slate-400 hover:text-red-600 cursor-pointer shrink-0 ml-2"
                          aria-label={`Detach ${vf?.name ?? vid}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {vaultFiles.length > 0 ? (
                <Select
                  label="Attach Vault Document"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      void handleToggleProposalVaultAttachment(selected, e.target.value);
                    }
                  }}
                  placeholder="Select a Vault file to attach..."
                  options={vaultFiles
                    .filter((f) => !(selected.attachmentVaultIds ?? []).includes(f.id))
                    .map((f) => ({ value: f.id, label: `${f.name} (${f.classification})` }))}
                />
              ) : (
                <p className="text-[11px] text-slate-500">
                  Upload files in Vault to attach supporting specs to proposals.
                </p>
              )}
            </div>

            {(selected.revisionHistory ?? []).length > 0 && (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-1.5">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" aria-hidden="true" />
                  Revision History
                </p>
                <ul className="space-y-1 max-h-32 overflow-y-auto">
                  {[...(selected.revisionHistory ?? [])].reverse().map((rev, i) => (
                    <li
                      key={`${rev.version}-${i}`}
                      className="text-[11px] flex items-center justify-between gap-2 text-slate-600 dark:text-slate-300"
                    >
                      <span>
                        <strong className="font-mono">v{rev.version}</strong> · {rev.summary}
                      </span>
                      <span className="font-mono tabular-nums text-slate-400 shrink-0">
                        {formatDisplayDate(rev.savedAt, dateFormat)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}
      </div>

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.number}` : 'New Proposal'}
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {!editing && proposalTemplates.length > 0 && (
            <Select
              label="Apply Template (Optional)"
              value=""
              onChange={(e) => applyTemplate(e.target.value)}
              placeholder="Choose a saved proposal template..."
              options={proposalTemplates.map((t) => ({ value: t.id, label: t.name }))}
            />
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Client"
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Select client"
              options={clients.map((c) => ({ value: c.id, label: c.name }))}
            />
            <Select
              label="Linked Project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              options={[
                { value: '', label: 'None' },
                ...projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
            <Input
              label="Proposal Title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Select
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ProposalStatus)}
              options={[
                { value: 'draft', label: 'Draft' },
                { value: 'sent', label: 'Sent' },
                { value: 'accepted', label: 'Accepted' },
                { value: 'rejected', label: 'Rejected' },
                { value: 'archived', label: 'Archived' },
              ]}
            />
            <Select
              label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              options={SUPPORTED_CURRENCIES.map((c) => ({ value: c.code, label: c.code }))}
            />
            <Input
              label="Proposed Amount"
              type="number"
              step="0.01"
              min="0"
              value={pricingAmount}
              onChange={(e) => setPricingAmount(e.target.value)}
            />
            <Input
              label="Timeline"
              value={timeline}
              onChange={(e) => setTimeline(e.target.value)}
            />
            <Input
              label="Valid Until"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>
          <Textarea
            label="Executive Overview"
            rows={2}
            value={overview}
            onChange={(e) => setOverview(e.target.value)}
          />
          <Textarea
            label="Scope of Work"
            rows={4}
            value={scopeOfWork}
            onChange={(e) => setScopeOfWork(e.target.value)}
          />
          <Textarea
            label="Deliverables (one per line)"
            rows={3}
            value={deliverablesText}
            onChange={(e) => setDeliverablesText(e.target.value)}
          />
          <Textarea
            label="Terms"
            rows={2}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? 'Save Changes' : 'Create Proposal'}
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await repositories.deleteProposal(deleteTarget.id);
          setSelectedId(null);
          setDeleteTarget(null);
          await refresh();
          pushToast({ tone: 'info', title: 'Proposal deleted' });
        }}
        title="Delete Proposal"
        description={`Delete proposal "${deleteTarget?.number}"?`}
        confirmLabel="Delete"
        danger
      />

      <Dialog
        open={Boolean(workflowPreview)}
        onClose={() => setWorkflowPreview(null)}
        title={workflowPreview?.title ?? 'Generate Project & Tasks'}
        description="Approval-gated automation: review the project and deliverable tasks before creating workspace records."
        size="md"
        footer={
          workflowPreview && (
            <>
              <Button
                variant="outline"
                disabled={workflowLoading}
                icon={<X className="w-3.5 h-3.5" />}
                onClick={() => void handleWorkflowDecision(false)}
              >
                Decline
              </Button>
              <Button
                variant="primary"
                disabled={workflowPreview.alreadyExecuted}
                loading={workflowLoading}
                icon={<Check className="w-3.5 h-3.5" />}
                onClick={() => void handleWorkflowDecision(true)}
              >
                Approve & Create
              </Button>
            </>
          )
        }
      >
        {workflowPreview && (
          <div className="space-y-4 text-sm">
            {workflowPreview.alreadyExecuted && (
              <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200">
                This proposal already generated a project and tasks (Run {workflowPreview.existingRun?.id}). Duplicate execution is prevented.
              </div>
            )}
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Draft Project
              </p>
              <p className="font-semibold text-slate-900 dark:text-white">
                {workflowPreview.draftProject.name}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Budget: {formatMoney(workflowPreview.draftProject.budget, workflowPreview.draftProject.currency)} · Due {formatDisplayDate(workflowPreview.draftProject.dueDate, dateFormat)}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Draft Deliverable Tasks ({workflowPreview.draftTasks.length})
              </p>
              <ul className="space-y-1.5">
                {workflowPreview.draftTasks.map((task, idx) => (
                  <li
                    key={`${task.title}-${idx}`}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs"
                  >
                    <span className="text-slate-800 dark:text-slate-200">{task.title}</span>
                    <Badge tone={task.priority === 'high' ? 'warning' : 'neutral'}>
                      {task.priority}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};
