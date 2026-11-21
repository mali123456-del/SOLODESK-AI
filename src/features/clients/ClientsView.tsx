import React, { useMemo, useState } from 'react';
import {
  Archive,
  Building2,
  Calendar,
  Download,
  Edit3,
  Globe,
  Mail,
  MapPin,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
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
import { repositories } from '../../database/repositories/dexieRepositories';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import { addDaysToDateStr, formatDisplayDate, todayDateStr } from '../../domain/calculations/dates';
import { formatMoney } from '../../domain/calculations/money';
import {
  createId,
  type Client,
  type ClientContact,
  type ClientStatus,
  type LeadStage,
} from '../../domain/schemas/entities';
import { buildCsvContent, downloadTextFile } from '../../export/csvUtils';
import { importClientsFromCsvText } from '../../services/importService';

const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  new: 'New Lead',
  contacted: 'Contacted',
  qualified: 'Qualified',
  proposal_sent: 'Proposal Sent',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
};

const LEAD_STAGE_OPTIONS: Array<{ value: LeadStage; label: string }> = [
  { value: 'new', label: 'New Lead' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'proposal_sent', label: 'Proposal Sent' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

interface ClientFormState {
  name: string;
  company: string;
  email: string;
  phone: string;
  website: string;
  location: string;
  status: ClientStatus;
  leadStage: LeadStage;
  contacts: ClientContact[];
  category: string;
  tagsText: string;
  notes: string;
}

const emptyForm: ClientFormState = {
  name: '',
  company: '',
  email: '',
  phone: '',
  website: '',
  location: '',
  status: 'active',
  leadStage: 'qualified',
  contacts: [],
  category: 'General',
  tagsText: '',
  notes: '',
};

export const ClientsView: React.FC = () => {
  const {
    clients,
    projects,
    proposals,
    contracts,
    appointments,
    invoices,
    payments,
    activities,
    settings,
    refresh,
  } = useWorkspace();
  const { pushToast } = useToast();

  const [statusFilter, setStatusFilter] = useState<'all' | ClientStatus>('all');
  const [leadStageFilter, setLeadStageFilter] = useState<'all' | LeadStage>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientFormState>(emptyForm);
  const [newContactName, setNewContactName] = useState('');
  const [newContactRole, setNewContactRole] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpTitle, setFollowUpTitle] = useState('');
  const [followUpDate, setFollowUpDate] = useState(() => addDaysToDateStr(todayDateStr(), 2));
  const [followUpTime, setFollowUpTime] = useState('10:00');
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<Client[]>([]);
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Client | null>(null);

  const dateFormat = settings?.dateFormat ?? 'DD MMM YYYY';
  const defaultCurrency = settings?.defaultCurrency ?? 'USD';

  const counts = useMemo(() => {
    return {
      all: clients.length,
      active: clients.filter((c) => c.status === 'active').length,
      lead: clients.filter((c) => c.status === 'lead').length,
      archived: clients.filter((c) => c.status === 'archived').length,
    };
  }, [clients]);

  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return clients.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (leadStageFilter !== 'all' && (c.leadStage ?? 'qualified') !== leadStageFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.location.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [clients, statusFilter, leadStageFilter, searchQuery]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) ?? null,
    [clients, selectedClientId]
  );

  const checkDuplicates = async (name: string, email: string, excludeId?: string) => {
    const dups = await repositories.findDuplicateClients({ name, email, excludeId });
    setDuplicateWarning(dups);
  };

  const openCreate = () => {
    setEditingClient(null);
    setForm(emptyForm);
    setNewContactName('');
    setNewContactRole('');
    setNewContactEmail('');
    setNewContactPhone('');
    setFormError(null);
    setDuplicateWarning([]);
    setModalOpen(true);
  };

  const openEdit = (client: Client) => {
    setEditingClient(client);
    setForm({
      name: client.name,
      company: client.company,
      email: client.email,
      phone: client.phone,
      website: client.website,
      location: client.location,
      status: client.status,
      leadStage: client.leadStage ?? 'qualified',
      contacts: (client.contacts ?? []).map((ct) => ({ ...ct })),
      category: client.category,
      tagsText: client.tags.join(', '),
      notes: client.notes,
    });
    setNewContactName('');
    setNewContactRole('');
    setNewContactEmail('');
    setNewContactPhone('');
    setFormError(null);
    setDuplicateWarning([]);
    setModalOpen(true);
  };

  const handleAddSecondaryContact = () => {
    if (!newContactName.trim()) return;
    const entry: ClientContact = {
      id: createId('ct'),
      name: newContactName.trim(),
      role: newContactRole.trim(),
      email: newContactEmail.trim(),
      phone: newContactPhone.trim(),
      isPrimary: form.contacts.length === 0,
    };
    setForm((f) => ({ ...f, contacts: [...f.contacts, entry] }));
    setNewContactName('');
    setNewContactRole('');
    setNewContactEmail('');
    setNewContactPhone('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError('Client name is required.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const tags = form.tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      if (editingClient) {
        const updated = await repositories.updateClient(editingClient.id, {
          name: form.name.trim(),
          company: form.company.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          website: form.website.trim(),
          location: form.location.trim(),
          status: form.status,
          leadStage: form.leadStage,
          contacts: form.contacts,
          category: form.category.trim() || 'General',
          tags,
          notes: form.notes,
        });
        setSelectedClientId(updated.id);
        pushToast({ tone: 'success', title: 'Client updated', description: updated.name });
      } else {
        const created = await repositories.createClient({
          name: form.name.trim(),
          company: form.company.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          website: form.website.trim(),
          location: form.location.trim(),
          status: form.status,
          leadStage: form.leadStage,
          contacts: form.contacts,
          category: form.category.trim() || 'General',
          tags,
          notes: form.notes,
          isDemo: false,
        });
        setSelectedClientId(created.id);
        pushToast({ tone: 'success', title: 'Client added', description: created.name });
      }
      await refresh();
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save client.');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickLeadStage = async (client: Client, nextStage: LeadStage) => {
    await repositories.updateClient(client.id, { leadStage: nextStage });
    await refresh();
    pushToast({
      tone: 'success',
      title: 'Lead stage updated',
      description: `${client.name} → ${LEAD_STAGE_LABELS[nextStage]}`,
    });
  };

  const handleScheduleFollowUp = async (client: Client) => {
    const title = followUpTitle.trim() || `Follow up with ${client.name}`;
    await repositories.createAppointment({
      title,
      clientId: client.id,
      projectId: '',
      date: followUpDate || todayDateStr(),
      startTime: followUpTime || '10:00',
      durationMinutes: 30,
      locationOrLink: client.email ? `Email / Call (${client.email})` : 'Phone / Video Call',
      meetingNotes: `Scheduled from CRM client record (${LEAD_STAGE_LABELS[client.leadStage ?? 'qualified']}).`,
      status: 'scheduled',
      followUpRequired: true,
      isDemo: false,
    });
    setFollowUpOpen(false);
    setFollowUpTitle('');
    await refresh();
    pushToast({
      tone: 'success',
      title: 'Follow-up scheduled',
      description: `${title} on ${followUpDate}`,
    });
  };

  const handleArchiveToggle = async (client: Client) => {
    const nextStatus: ClientStatus = client.status === 'archived' ? 'active' : 'archived';
    await repositories.updateClient(client.id, { status: nextStatus });
    await refresh();
    setArchiveTarget(null);
    pushToast({
      tone: 'info',
      title: nextStatus === 'archived' ? 'Client archived' : 'Client restored',
      description: client.name,
    });
  };

  const handleExportCsv = () => {
    const csv = buildCsvContent(
      ['Name', 'Company', 'Email', 'Phone', 'Location', 'Status', 'Category', 'Tags'],
      filteredClients.map((c) => [
        c.name,
        c.company,
        c.email,
        c.phone,
        c.location,
        c.status,
        c.category,
        c.tags.join('; '),
      ])
    );
    downloadTextFile(`solodesk-clients-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    pushToast({ tone: 'success', title: 'Clients exported', description: `${filteredClients.length} records exported to CSV.` });
  };

  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      pushToast({ tone: 'error', title: 'File too large', description: 'CSV import limit is 2 MB.' });
      return;
    }
    try {
      const text = await file.text();
      const result = await importClientsFromCsvText(text);
      await refresh();
      pushToast({
        tone: 'success',
        title: 'CSV import complete',
        description: `Imported ${result.importedCount} client(s). Skipped ${result.skippedDuplicateCount} duplicate(s) and ${result.skippedInvalidCount} invalid row(s).`,
      });
    } catch (err) {
      pushToast({
        tone: 'warning',
        title: 'CSV import stopped',
        description: err instanceof Error ? err.message : 'Unable to parse CSV file.',
      });
    }
  };

  const columns: ColumnDef<Client>[] = [
    {
      key: 'name',
      header: 'Client',
      sortValue: (c) => c.name.toLowerCase(),
      render: (c) => (
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{c.name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {c.company || 'Independent'} {c.location ? `· ${c.location}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (c) => (
        <div className="text-xs space-y-0.5">
          <p className="text-slate-700 dark:text-slate-300">{c.email || '—'}</p>
          <p className="text-slate-500 dark:text-slate-400 font-mono">{c.phone || '—'}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status & Stage',
      sortValue: (c) => `${c.status}:${c.leadStage ?? 'qualified'}`,
      render: (c) => (
        <div className="flex flex-col items-start gap-1">
          <Badge
            tone={c.status === 'active' ? 'success' : c.status === 'lead' ? 'info' : 'neutral'}
          >
            {c.status}
          </Badge>
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {LEAD_STAGE_LABELS[c.leadStage ?? 'qualified']}
          </span>
        </div>
      ),
    },
    {
      key: 'projects',
      header: 'Projects',
      align: 'right',
      sortValue: (c) => projects.filter((p) => p.clientId === c.id).length,
      render: (c) => (
        <span className="font-mono text-xs">
          {projects.filter((p) => p.clientId === c.id).length}
        </span>
      ),
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      sortValue: (c) => c.updatedAt,
      render: (c) => <span className="text-xs text-slate-500">{formatDisplayDate(c.updatedAt, dateFormat)}</span>,
    },
  ];

  const clientProjects = selectedClient
    ? projects.filter((p) => p.clientId === selectedClient.id)
    : [];
  const clientProposals = selectedClient
    ? proposals.filter((p) => p.clientId === selectedClient.id)
    : [];
  const clientContracts = selectedClient
    ? contracts.filter((c) => c.clientId === selectedClient.id)
    : [];
  const clientAppointments = selectedClient
    ? appointments.filter((a) => a.clientId === selectedClient.id)
    : [];
  const clientInvoices = selectedClient
    ? invoices.filter((i) => i.clientId === selectedClient.id)
    : [];
  const clientPayments = selectedClient
    ? payments.filter((p) => p.clientId === selectedClient.id)
    : [];
  const clientTimeline = selectedClient
    ? activities.filter((a) => a.entityId === selectedClient.id).slice(0, 8)
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        description="Manage client contacts, companies, tags, duplicate checks, and connected billing history."
        actions={
          <>
            <label className="inline-flex items-center gap-2 h-10 px-3.5 rounded-[10px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#172338] text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
              <Upload className="w-4 h-4" aria-hidden="true" />
              <span>Import CSV</span>
              <input type="file" accept=".csv,text/csv" onChange={handleImportCsv} className="sr-only" />
            </label>
            <Button
              variant="outline"
              onClick={handleExportCsv}
              disabled={filteredClients.length === 0}
              icon={<Download className="w-4 h-4" />}
            >
              Export CSV
            </Button>
            <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>
              Add Client
            </Button>
          </>
        }
      />

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <Tabs
          activeId={statusFilter}
          onChange={(id) => setStatusFilter(id as 'all' | ClientStatus)}
          items={[
            { id: 'all', label: 'All', count: counts.all },
            { id: 'active', label: 'Active', count: counts.active },
            { id: 'lead', label: 'Leads', count: counts.lead },
            { id: 'archived', label: 'Archived', count: counts.archived },
          ]}
        />
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="w-full sm:w-44">
            <Select
              aria-label="Filter by lead stage"
              value={leadStageFilter}
              onChange={(e) => setLeadStageFilter(e.target.value as 'all' | LeadStage)}
              options={[
                { value: 'all', label: 'All Pipeline Stages' },
                ...LEAD_STAGE_OPTIONS,
              ]}
            />
          </div>
          <div className="w-full sm:w-72">
            <Input
              placeholder="Search name, company, email, tag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
              aria-label="Search clients"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className={selectedClient ? 'xl:col-span-2' : 'xl:col-span-3'}>
          <DataTable
            data={filteredClients}
            columns={columns}
            keyExtractor={(c) => c.id}
            onRowClick={(c) => setSelectedClientId(c.id)}
            ariaLabel="Clients table"
            emptyState={
              <EmptyState
                icon={<Users className="w-5 h-5" />}
                title={clients.length === 0 ? 'No clients yet' : 'No matching clients'}
                description={
                  clients.length === 0
                    ? 'Add your first client to start linking projects, proposals, quotations, and invoices.'
                    : 'Try adjusting your search query or status tab.'
                }
                action={
                  clients.length === 0 ? (
                    <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>
                      Add First Client
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        </div>

        {selectedClient && (
          <Card className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">
                    {selectedClient.name}
                  </h2>
                  <Badge tone={selectedClient.status === 'active' ? 'success' : 'neutral'}>
                    {selectedClient.status}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {selectedClient.company || 'Independent'} · {selectedClient.category}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openEdit(selectedClient)}
                  icon={<Edit3 className="w-3.5 h-3.5" />}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setArchiveTarget(selectedClient)}
                  aria-label={selectedClient.status === 'archived' ? 'Restore client' : 'Archive client'}
                >
                  {selectedClient.status === 'archived' ? (
                    <RotateCcw className="w-3.5 h-3.5" />
                  ) : (
                    <Archive className="w-3.5 h-3.5" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800 pt-3">
              {selectedClient.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                  <span>{selectedClient.email}</span>
                </div>
              )}
              {selectedClient.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                  <span className="font-mono">{selectedClient.phone}</span>
                </div>
              )}
              {selectedClient.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                  <span>{selectedClient.location}</span>
                </div>
              )}
              {selectedClient.website && (
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                  <span className="truncate">{selectedClient.website}</span>
                </div>
              )}
              {selectedClient.tags.length > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400 pt-1">
                  Tags: {selectedClient.tags.join(' · ')}
                </p>
              )}
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <Select
                    label="CRM Pipeline Stage"
                    aria-label="CRM Pipeline Stage"
                    value={selectedClient.leadStage ?? 'qualified'}
                    onChange={(e) =>
                      void handleQuickLeadStage(selectedClient, e.target.value as LeadStage)
                    }
                    options={LEAD_STAGE_OPTIONS}
                  />
                </div>
                <div className="pt-5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setFollowUpTitle(`Follow up with ${selectedClient.name}`);
                      setFollowUpOpen((prev) => !prev);
                    }}
                    icon={<Calendar className="w-3.5 h-3.5" />}
                  >
                    Follow-Up
                  </Button>
                </div>
              </div>

              {followUpOpen && (
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#101827] space-y-2 text-xs">
                  <Input
                    label="Follow-up Title"
                    value={followUpTitle}
                    onChange={(e) => setFollowUpTitle(e.target.value)}
                    placeholder={`Follow up with ${selectedClient.name}`}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label="Date"
                      type="date"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                    />
                    <Input
                      label="Time"
                      type="time"
                      value={followUpTime}
                      onChange={(e) => setFollowUpTime(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setFollowUpOpen(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={() => void handleScheduleFollowUp(selectedClient)}>
                      Schedule
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {selectedClient.notes && (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Notes</p>
                <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {selectedClient.notes}
                </p>
              </div>
            )}

            {(selectedClient.contacts ?? []).length > 0 && (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Additional Contacts ({(selectedClient.contacts ?? []).length})
                </p>
                <ul className="space-y-1.5">
                  {(selectedClient.contacts ?? []).map((ct) => (
                    <li
                      key={ct.id}
                      className="p-2 rounded-lg bg-slate-50 dark:bg-[#101827] text-xs flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
                          {ct.name} {ct.role ? `· ${ct.role}` : ''}
                        </p>
                        <p className="text-slate-500 dark:text-slate-400 truncate font-mono text-[11px]">
                          {[ct.email, ct.phone].filter(Boolean).join(' · ') || 'No email/phone'}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5 border-t border-slate-100 dark:border-slate-800 pt-3 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#101827]">
                <p className="text-slate-500">Projects / Contracts</p>
                <p className="text-base font-bold font-mono tabular-nums mt-0.5">
                  {clientProjects.length} / {clientContracts.length}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#101827]">
                <p className="text-slate-500">Proposals / Meetings</p>
                <p className="text-base font-bold font-mono tabular-nums mt-0.5">
                  {clientProposals.length} / {clientAppointments.length}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#101827]">
                <p className="text-slate-500">Invoices</p>
                <p className="text-base font-bold font-mono tabular-nums mt-0.5">
                  {clientInvoices.length}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#101827]">
                <p className="text-slate-500">Collected</p>
                <p className="text-sm font-bold font-mono tabular-nums mt-0.5">
                  {formatMoney(
                    clientPayments.reduce((s, p) => s + p.amount, 0),
                    clientPayments[0]?.currency ?? defaultCurrency
                  )}
                </p>
              </div>
            </div>

            {clientTimeline.length > 0 && (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                <CardHeader title="Recent Client History" className="mb-2" />
                <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  {clientTimeline.map((evt) => (
                    <li key={evt.id} className="flex justify-between gap-2">
                      <span className="truncate">{evt.summary}</span>
                      <span className="text-slate-400 shrink-0">
                        {formatDisplayDate(evt.createdAt, dateFormat)}
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
        title={editingClient ? `Edit ${editingClient.name}` : 'Add New Client'}
        description="Store client contact details, category, tags, and internal notes."
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <div role="alert" className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-xs">
              {formError}
            </div>
          )}

          {duplicateWarning.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs">
              Potential duplicate detected: {duplicateWarning.map((d) => `${d.name} (${d.email || 'no email'})`).join(', ')}.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Client Name"
              required
              value={form.name}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) => ({ ...f, name: v }));
                void checkDuplicates(v, form.email, editingClient?.id);
              }}
            />
            <Input
              label="Company"
              leftIcon={<Building2 className="w-4 h-4" />}
              value={form.company}
              onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) => ({ ...f, email: v }));
                void checkDuplicates(form.name, v, editingClient?.id);
              }}
            />
            <Input
              label="Phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <Input
              label="Website"
              placeholder="https://"
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
            />
            <Input
              label="Location"
              placeholder="City, Country"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            />
            <Select
              label="Status"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ClientStatus }))}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'lead', label: 'Lead' },
                { value: 'archived', label: 'Archived' },
              ]}
            />
            <Select
              label="Lead Pipeline Stage"
              value={form.leadStage}
              onChange={(e) => setForm((f) => ({ ...f, leadStage: e.target.value as LeadStage }))}
              options={LEAD_STAGE_OPTIONS}
            />
            <Input
              label="Category"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            />
          </div>

          <Input
            label="Tags"
            hint="Comma-separated labels (e.g. Retainer, SaaS, Priority)"
            value={form.tagsText}
            onChange={(e) => setForm((f) => ({ ...f, tagsText: e.target.value }))}
          />

          <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-3">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Additional Stakeholders / Contacts ({form.contacts.length})
            </p>
            {form.contacts.map((ct) => (
              <div
                key={ct.id}
                className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-[#101827] text-xs"
              >
                <div className="min-w-0">
                  <span className="font-medium">{ct.name}</span>
                  {ct.role && <span className="text-slate-500"> · {ct.role}</span>}
                  {(ct.email || ct.phone) && (
                    <span className="text-slate-500 font-mono">
                      {' '}
                      · {[ct.email, ct.phone].filter(Boolean).join(' / ')}
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove contact ${ct.name}`}
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      contacts: f.contacts.filter((x) => x.id !== ct.id),
                    }))
                  }
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                </Button>
              </div>
            ))}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
              <Input
                placeholder="Contact name"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                aria-label="Additional contact name"
              />
              <Input
                placeholder="Role (e.g. Finance)"
                value={newContactRole}
                onChange={(e) => setNewContactRole(e.target.value)}
                aria-label="Additional contact role"
              />
              <Input
                placeholder="Email"
                value={newContactEmail}
                onChange={(e) => setNewContactEmail(e.target.value)}
                aria-label="Additional contact email"
              />
              <div className="flex gap-1.5">
                <Input
                  placeholder="Phone"
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value)}
                  aria-label="Additional contact phone"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!newContactName.trim()}
                  onClick={handleAddSecondaryContact}
                  icon={<UserPlus className="w-3.5 h-3.5" />}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>

          <Textarea
            label="Internal Notes"
            rows={3}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editingClient ? 'Save Changes' : 'Create Client'}
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => (archiveTarget ? handleArchiveToggle(archiveTarget) : undefined)}
        title={archiveTarget?.status === 'archived' ? 'Restore Client' : 'Archive Client'}
        description={
          archiveTarget?.status === 'archived'
            ? `Restore "${archiveTarget.name}" back to active clients?`
            : `Archive "${archiveTarget?.name}"? Existing projects and invoices will remain preserved.`
        }
        confirmLabel={archiveTarget?.status === 'archived' ? 'Restore' : 'Archive'}
      />
    </div>
  );
};
