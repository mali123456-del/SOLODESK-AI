import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Download,
  Edit3,
  FileCheck2,
  History,
  Paperclip,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
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
import { formatDisplayDate, todayDateStr } from '../../domain/calculations/dates';
import {
  createId,
  type Contract,
  type ContractStatus,
} from '../../domain/schemas/entities';
import { generateContractPdf } from '../../pdf/pdfGenerator';

interface SectionDraft {
  id: string;
  heading: string;
  body: string;
}

const DEFAULT_SECTIONS: SectionDraft[] = [
  {
    id: 'sec_1',
    heading: '1. Scope of Services',
    body: 'Provider agrees to deliver the agreed milestones professionally and within reasonable timelines.',
  },
  {
    id: 'sec_2',
    heading: '2. Compensation & Payment Terms',
    body: 'Invoices are due within 14 calendar days of issue unless otherwise specified in the quotation.',
  },
  {
    id: 'sec_3',
    heading: '3. Intellectual Property',
    body: 'Upon receipt of full payment, ownership of final approved deliverables transfers to the Client.',
  },
  {
    id: 'sec_4',
    heading: '4. Confidentiality & Termination',
    body: 'Both parties agree to keep proprietary materials confidential. Either party may terminate with 7 days written notice.',
  },
];

export const ContractsView: React.FC = () => {
  const { contracts, clients, projects, templates, vaultFiles, businessProfile, settings, refresh } =
    useWorkspace();
  const { pushToast } = useToast();

  const [statusFilter, setStatusFilter] = useState<'all' | ContractStatus>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Contract | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contract | null>(null);

  const dateFormat = settings?.dateFormat ?? 'DD MMM YYYY';

  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [templateName, setTemplateName] = useState('Standard Freelance Agreement');
  const [effectiveDate, setEffectiveDate] = useState(todayDateStr());
  const [status, setStatus] = useState<ContractStatus>('draft');
  const [sections, setSections] = useState<SectionDraft[]>(DEFAULT_SECTIONS);
  const [saving, setSaving] = useState(false);

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const contractTemplates = useMemo(
    () => templates.filter((t) => t.kind === 'contract'),
    [templates]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contracts.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        c.number.toLowerCase().includes(q) ||
        (clientMap.get(c.clientId)?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [contracts, statusFilter, search, clientMap]);

  const selected = useMemo(
    () => contracts.find((c) => c.id === selectedId) ?? null,
    [contracts, selectedId]
  );

  const openCreate = () => {
    setEditing(null);
    setClientId(clients[0]?.id ?? '');
    setProjectId('');
    setTitle('Freelance Services Agreement');
    setTemplateName('Standard Freelance Agreement');
    setEffectiveDate(todayDateStr());
    setStatus('draft');
    setSections(DEFAULT_SECTIONS.map((s) => ({ ...s, id: createId('sec') })));
    setModalOpen(true);
  };

  const openEdit = (c: Contract) => {
    setEditing(c);
    setClientId(c.clientId);
    setProjectId(c.projectId);
    setTitle(c.title);
    setTemplateName(c.templateName);
    setEffectiveDate(c.effectiveDate);
    setStatus(c.status);
    setSections(c.sections.map((s) => ({ ...s })));
    setModalOpen(true);
  };

  const applyTemplate = (tplId: string) => {
    const tpl = contractTemplates.find((t) => t.id === tplId);
    if (!tpl) return;
    setTemplateName(tpl.name);
    const clientName = clientMap.get(clientId)?.name ?? '[Client Name]';
    const projName = projects.find((p) => p.id === projectId)?.name ?? '[Project Name]';
    const filled = tpl.content
      .replace(/\{\{client_name\}\}/gi, clientName)
      .replace(/\{\{project_name\}\}/gi, projName)
      .replace(/\{\{business_name\}\}/gi, businessProfile?.businessName ?? 'Service Provider');

    setSections([
      {
        id: createId('sec'),
        heading: tpl.name,
        body: filled,
      },
    ]);
  };

  const handleToggleContractVaultAttachment = async (contract: Contract, vaultFileId: string) => {
    const current = contract.attachmentVaultIds ?? [];
    const exists = current.includes(vaultFileId);
    const next = exists ? current.filter((id) => id !== vaultFileId) : [...current, vaultFileId];
    await repositories.updateContract(contract.id, { attachmentVaultIds: next });
    await refresh();
    pushToast({
      tone: 'success',
      title: exists ? 'Attachment detached' : 'Vault file attached',
      description: `Updated attachments on ${contract.number}.`,
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const validSections = sections.filter((s) => s.heading.trim());
    if (!clientId || !title.trim() || validSections.length === 0) return;
    setSaving(true);
    try {
      const payload = {
        clientId,
        projectId,
        title: title.trim(),
        templateName,
        effectiveDate,
        sections: validSections,
        status,
        acceptedAt: editing?.acceptedAt ?? '',
      };
      if (editing) {
        const updated = await repositories.updateContract(editing.id, payload);
        setSelectedId(updated.id);
        pushToast({ tone: 'success', title: 'Contract updated', description: updated.number });
      } else {
        const created = await repositories.createContract({ ...payload, isDemo: false });
        setSelectedId(created.id);
        pushToast({ tone: 'success', title: 'Contract created', description: created.number });
      }
      await refresh();
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<Contract>[] = [
    {
      key: 'title',
      header: 'Contract',
      sortValue: (c) => c.number,
      render: (c) => (
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{c.title}</p>
          <p className="text-xs font-mono text-slate-500">
            {c.number} · {clientMap.get(c.clientId)?.name ?? 'Client'}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (
        <Badge
          tone={
            c.status === 'accepted'
              ? 'success'
              : c.status === 'sent'
                ? 'info'
                : 'neutral'
          }
        >
          {c.status}
        </Badge>
      ),
    },
    {
      key: 'effectiveDate',
      header: 'Effective Date',
      render: (c) => (
        <span className="text-xs text-slate-500">{formatDisplayDate(c.effectiveDate, dateFormat)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contracts"
        description="Prepare service agreements from customizable sections, track acceptance, and export PDFs."
        actions={
          <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>
            New Contract
          </Button>
        }
      />

      <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          Contract templates are commercial productivity aids and do not constitute legal advice.
          Review important agreements with a qualified legal professional in your jurisdiction.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Tabs
          activeId={statusFilter}
          onChange={(id) => setStatusFilter(id as typeof statusFilter)}
          items={[
            { id: 'all', label: 'All', count: contracts.length },
            { id: 'draft', label: 'Draft', count: contracts.filter((c) => c.status === 'draft').length },
            { id: 'sent', label: 'Sent', count: contracts.filter((c) => c.status === 'sent').length },
            { id: 'accepted', label: 'Accepted', count: contracts.filter((c) => c.status === 'accepted').length },
          ]}
        />
        <div className="w-full sm:w-64">
          <Input
            placeholder="Search contracts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
            aria-label="Search contracts"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className={selected ? 'xl:col-span-2' : 'xl:col-span-3'}>
          <DataTable
            data={filtered}
            columns={columns}
            keyExtractor={(c) => c.id}
            onRowClick={(c) => setSelectedId(c.id)}
            ariaLabel="Contracts table"
            emptyState={
              <EmptyState
                icon={<FileCheck2 className="w-5 h-5" />}
                title="No contracts yet"
                description="Create an editable agreement template linked to your client and project."
                action={
                  clients.length > 0 ? (
                    <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>
                      Create Contract
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
              <div>
                <p className="text-xs font-mono text-slate-500">{selected.number}</p>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{selected.title}</h2>
                <p className="text-xs text-slate-500">
                  {clientMap.get(selected.clientId)?.name ?? 'Client'} · Effective{' '}
                  {formatDisplayDate(selected.effectiveDate, dateFormat)}
                </p>
                {selected.acceptedAt && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                    Accepted on {formatDisplayDate(selected.acceptedAt, dateFormat)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge tone="neutral">v{selected.revision ?? 1}</Badge>
                <Badge tone={selected.status === 'accepted' ? 'success' : 'info'}>
                  {selected.status}
                </Badge>
              </div>
            </div>

            <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#101827]/70 text-[11px] text-slate-600 dark:text-slate-300">
              Internal workflow confirmation only: marking a contract accepted records an internal
              workspace timestamp (<code className="font-mono">acceptedAt</code>) and does not replace
              qualified cryptographic or legal e-signatures.
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
                  void generateContractPdf(
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
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeleteTarget(selected)}
                aria-label="Delete contract"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-600" />
              </Button>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-3">
              {selected.sections.map((sec) => (
                <div key={sec.id}>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                    {sec.heading}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap mt-0.5">
                    {sec.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5" aria-hidden="true" />
                Vault Attachments ({(selected.attachmentVaultIds ?? []).length})
              </p>
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
                          onClick={() => void handleToggleContractVaultAttachment(selected, vid)}
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
                      void handleToggleContractVaultAttachment(selected, e.target.value);
                    }
                  }}
                  placeholder="Select a Vault file to attach..."
                  options={vaultFiles
                    .filter((f) => !(selected.attachmentVaultIds ?? []).includes(f.id))
                    .map((f) => ({ value: f.id, label: `${f.name} (${f.classification})` }))}
                />
              ) : (
                <p className="text-[11px] text-slate-500">
                  Upload files in Vault to link appendices or schedules.
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
        title={editing ? `Edit ${editing.number}` : 'Create Contract'}
        size="xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {!editing && contractTemplates.length > 0 && (
            <Select
              label="Apply Saved Template (Optional)"
              value=""
              onChange={(e) => applyTemplate(e.target.value)}
              placeholder="Choose a contract template..."
              options={contractTemplates.map((t) => ({ value: t.id, label: t.name }))}
            />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Select
              label="Client"
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Select client"
              options={clients.map((c) => ({ value: c.id, label: c.name }))}
            />
            <Select
              label="Project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              options={[
                { value: '', label: 'None' },
                ...projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
            <Input
              label="Contract Title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Input
              label="Effective Date"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
            <Select
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ContractStatus)}
              options={[
                { value: 'draft', label: 'Draft' },
                { value: 'sent', label: 'Sent' },
                { value: 'accepted', label: 'Accepted' },
                { value: 'archived', label: 'Archived' },
              ]}
            />
          </div>

          <div className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Agreement Clauses
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setSections((prev) => [
                    ...prev,
                    { id: createId('sec'), heading: `${prev.length + 1}. Additional Clause`, body: '' },
                  ])
                }
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                Add Section
              </Button>
            </div>
            {sections.map((sec) => (
              <div
                key={sec.id}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <Input
                    value={sec.heading}
                    onChange={(e) =>
                      setSections((prev) =>
                        prev.map((x) => (x.id === sec.id ? { ...x, heading: e.target.value } : x))
                      )
                    }
                    placeholder="Section heading"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={sections.length <= 1}
                    onClick={() => setSections((prev) => prev.filter((x) => x.id !== sec.id))}
                    aria-label="Remove section"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </div>
                <Textarea
                  rows={3}
                  value={sec.body}
                  onChange={(e) =>
                    setSections((prev) =>
                      prev.map((x) => (x.id === sec.id ? { ...x, body: e.target.value } : x))
                    )
                  }
                  placeholder="Clause text..."
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? 'Save Changes' : 'Create Contract'}
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await repositories.deleteContract(deleteTarget.id);
          setSelectedId(null);
          setDeleteTarget(null);
          await refresh();
          pushToast({ tone: 'info', title: 'Contract deleted' });
        }}
        title="Delete Contract"
        description={`Delete contract "${deleteTarget?.number}"?`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
};
