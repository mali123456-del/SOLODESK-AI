import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Link2,
  Lock,
  Plus,
  ShieldAlert,
  Star,
  Trash2,
  UserPlus,
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
  Textarea,
  useToast,
} from '../../components/ui';
import { repositories } from '../../database/repositories/dexieRepositories';
import { addDaysToDateStr, formatDisplayDate, todayDateStr } from '../../domain/calculations/dates';
import { formatMoney } from '../../domain/calculations/money';
import { createId } from '../../domain/schemas/entities';
import { buildClientPortalViewModel } from '../../services/clientPortalService';

interface ClientPortalViewProps {
  initialToken?: string;
  standaloneTokenMode?: boolean;
}

export const ClientPortalView: React.FC<ClientPortalViewProps> = ({
  initialToken = '',
  standaloneTokenMode = false,
}) => {
  const { clients, projects, invoices, vaultFiles, clientPortalLinks, refresh } = useWorkspace();
  const { pushToast } = useToast();

  const [activeTab, setActiveTab] = useState<'manage' | 'preview' | 'lead-capture'>(
    initialToken || standaloneTokenMode ? 'preview' : 'manage'
  );
  const [selectedToken, setSelectedToken] = useState<string>(
    standaloneTokenMode ? initialToken : initialToken || clientPortalLinks[0]?.token || ''
  );

  // Create portal link form
  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [projectId, setProjectId] = useState('');
  const [label, setLabel] = useState('Client Delivery Portal');
  const [expiresAt, setExpiresAt] = useState(() => addDaysToDateStr(todayDateStr(), 30));
  const [showMilestones, setShowMilestones] = useState(true);
  const [showInvoices, setShowInvoices] = useState(true);
  const [showSharedFiles, setShowSharedFiles] = useState(true);
  const [allowApprovals, setAllowApprovals] = useState(true);
  const [allowFeedback, setAllowFeedback] = useState(true);

  // Portal interaction states
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [newApprovalTitle, setNewApprovalTitle] = useState('');
  const [newApprovalDesc, setNewApprovalDesc] = useState('');
  const [feedbackAuthor, setFeedbackAuthor] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [surveyRating, setSurveyRating] = useState<number>(5);
  const [surveyComment, setSurveyComment] = useState('');

  // Public Lead Capture Form
  const [leadName, setLeadName] = useState('');
  const [leadCompany, setLeadCompany] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadScope, setLeadScope] = useState('');

  useEffect(() => {
    if (initialToken) {
      setSelectedToken(initialToken);
      setActiveTab('preview');
    } else if (!selectedToken && clientPortalLinks[0]?.token) {
      setSelectedToken(clientPortalLinks[0].token);
    }
  }, [initialToken, selectedToken, clientPortalLinks]);

  useEffect(() => {
    if (!clientId && clients[0]) {
      setClientId(clients[0].id);
    }
  }, [clientId, clients]);

  const activeLink = useMemo(
    () =>
      standaloneTokenMode
        ? clientPortalLinks.find((l) => l.token === initialToken)
        : clientPortalLinks.find((l) => l.token === selectedToken) ?? clientPortalLinks[0],
    [clientPortalLinks, selectedToken, standaloneTokenMode, initialToken]
  );

  const scopedView = useMemo(
    () =>
      buildClientPortalViewModel({
        link: activeLink,
        clients,
        projects,
        invoices,
        vaultFiles,
      }),
    [activeLink, clients, projects, invoices, vaultFiles]
  );

  useEffect(() => {
    if (!standaloneTokenMode || !initialToken || clientPortalLinks.length === 0) return;
    void repositories.logSecurityEvent({
      eventType: scopedView.valid ? 'portal_access' : 'portal_denied',
      severity: scopedView.valid ? 'info' : 'warning',
      actor: 'external-portal-visitor',
      detail: scopedView.valid
        ? `Scoped portal access granted for token ${initialToken.slice(0, 12)}...`
        : `Portal access denied (${scopedView.reason ?? 'invalid token'})`,
    });
  }, [standaloneTokenMode, initialToken, scopedView.valid, scopedView.reason, clientPortalLinks.length]);

  const clientProjects = useMemo(
    () => projects.filter((p) => p.clientId === clientId && !p.isTemplate),
    [projects, clientId]
  );

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) {
      pushToast({ title: 'Create a client first before generating a portal link.', tone: 'warning' });
      return;
    }
    const token = createId('portal');
    const created = await repositories.saveClientPortalLink({
      clientId,
      projectId,
      token,
      label: label.trim() || 'Client Portal',
      status: 'active',
      expiresAt,
      permissions: {
        showMilestones,
        showInvoices,
        showSharedFiles,
        allowApprovals,
        allowFeedback,
      },
      onboardingChecklist: [
        { id: createId('chk'), title: 'Confirm brand guidelines & contact', completed: false },
        { id: createId('chk'), title: 'Provide repository / asset access', completed: false },
      ],
      approvals: [],
      feedbackNotes: [],
      surveyComment: '',
    });
    await repositories.logActivity({
      entityType: 'portal',
      entityId: created.id,
      action: 'created',
      summary: `Generated scoped client portal token (${created.label}) expiring ${created.expiresAt}`,
    });
    setSelectedToken(created.token);
    pushToast({ title: 'Scoped client portal link generated', tone: 'success' });
    await refresh();
  };

  const handleCopyShareUrl = async (token: string) => {
    const url = `${window.location.origin}${window.location.pathname}#/client-portal?token=${encodeURIComponent(token)}`;
    try {
      await navigator.clipboard.writeText(url);
      pushToast({ title: 'Portal URL copied to clipboard', tone: 'info' });
    } catch {
      pushToast({ title: 'Share token: ' + token, tone: 'info' });
    }
  };

  const handleToggleChecklist = async (itemId: string) => {
    if (!activeLink) return;
    const next = activeLink.onboardingChecklist.map((c) =>
      c.id === itemId ? { ...c, completed: !c.completed } : c
    );
    await repositories.saveClientPortalLink({ ...activeLink, onboardingChecklist: next });
    await refresh();
  };

  const handleAddChecklist = async () => {
    if (!activeLink || !newChecklistTitle.trim()) return;
    await repositories.saveClientPortalLink({
      ...activeLink,
      onboardingChecklist: [
        ...activeLink.onboardingChecklist,
        { id: createId('chk'), title: newChecklistTitle.trim(), completed: false },
      ],
    });
    setNewChecklistTitle('');
    await refresh();
  };

  const handleAddApproval = async () => {
    if (!activeLink || !newApprovalTitle.trim()) return;
    await repositories.saveClientPortalLink({
      ...activeLink,
      approvals: [
        ...activeLink.approvals,
        {
          id: createId('apr'),
          title: newApprovalTitle.trim(),
          description: newApprovalDesc.trim(),
          status: 'pending',
          clientComment: '',
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    setNewApprovalTitle('');
    setNewApprovalDesc('');
    await refresh();
  };

  const handleSetApprovalStatus = async (
    approvalId: string,
    status: 'approved' | 'changes_requested'
  ) => {
    if (!activeLink) return;
    await repositories.saveClientPortalLink({
      ...activeLink,
      approvals: activeLink.approvals.map((a) =>
        a.id === approvalId ? { ...a, status, updatedAt: new Date().toISOString() } : a
      ),
    });
    pushToast({ title: `Deliverable marked ${status.replace('_', ' ')}`, tone: 'success' });
    await refresh();
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLink || !feedbackMsg.trim()) return;
    await repositories.saveClientPortalLink({
      ...activeLink,
      feedbackNotes: [
        ...activeLink.feedbackNotes,
        {
          id: createId('fbk'),
          author: feedbackAuthor.trim() || scopedView.clientPublicProfile?.name || 'Client',
          message: feedbackMsg.trim(),
          createdAt: new Date().toISOString(),
        },
      ],
    });
    setFeedbackMsg('');
    pushToast({ title: 'Client feedback saved', tone: 'success' });
    await refresh();
  };

  const handleSubmitSurvey = async () => {
    if (!activeLink) return;
    await repositories.saveClientPortalLink({
      ...activeLink,
      surveyRating,
      surveyComment: surveyComment.trim(),
    });
    pushToast({ title: `Recorded ${surveyRating}/5 client satisfaction score`, tone: 'success' });
    await refresh();
  };

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadName.trim() || !leadEmail.trim()) {
      pushToast({ title: 'Lead name and email are required.', tone: 'warning' });
      return;
    }
    const created = await repositories.createClient({
      name: leadName.trim(),
      company: leadCompany.trim(),
      email: leadEmail.trim(),
      phone: '',
      website: '',
      location: '',
      category: 'Lead',
      status: 'lead',
      tags: ['portal-lead'],
      notes: leadScope.trim() ? `Lead intake scope:\n${leadScope.trim()}` : 'Captured via Lead Form.',
      isDemo: false,
    });
    await repositories.pushNotification({
      title: 'New Lead Captured',
      message: `${created.name} submitted the intake form.`,
      severity: 'success',
      read: false,
      route: 'clients',
    });
    setLeadName('');
    setLeadCompany('');
    setLeadEmail('');
    setLeadScope('');
    pushToast({ title: `Created lead client "${created.name}"`, tone: 'success' });
    await refresh();
  };

  return (
    <div className="space-y-6">
      {!standaloneTokenMode && (
        <>
          <PageHeader
            title="Client Experience & Scoped Portal"
            description="Generate expiring client-scoped share views, track onboarding & deliverable approvals, and capture incoming leads."
          />

          <Tabs
            activeId={activeTab}
            onChange={(id) => setActiveTab(id as typeof activeTab)}
            items={[
              { id: 'manage', label: 'Portal Links & Permissions', count: clientPortalLinks.length },
              { id: 'preview', label: 'Scoped Portal View' },
              { id: 'lead-capture', label: 'Lead Capture Form' },
            ]}
          />
        </>
      )}

      {!standaloneTokenMode && activeTab === 'manage' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader
              title="Create Scoped Portal Link"
              description="Tokens expose only permitted client records; internal notes & margins stay hidden."
            />
            <form onSubmit={(e) => void handleCreateLink(e)} className="space-y-3">
              <Select
                label="Client"
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setProjectId('');
                }}
                options={
                  clients.length > 0
                    ? clients.map((c) => ({ value: c.id, label: c.name }))
                    : [{ value: '', label: 'No clients available' }]
                }
              />
              <Select
                label="Project Scope (optional)"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                options={[
                  { value: '', label: 'All active projects for client' },
                  ...clientProjects.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
              <Input label="Portal Title" value={label} onChange={(e) => setLabel(e.target.value)} />
              <Input
                label="Expiration Date"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
              <div className="space-y-1.5 pt-1 text-xs text-slate-700 dark:text-slate-300">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showMilestones}
                    onChange={(e) => setShowMilestones(e.target.checked)}
                  />
                  Show project milestones & progress
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showInvoices}
                    onChange={(e) => setShowInvoices(e.target.checked)}
                  />
                  Show sent/pending invoices (excludes drafts)
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSharedFiles}
                    onChange={(e) => setShowSharedFiles(e.target.checked)}
                  />
                  Show client_shared Vault files only
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowApprovals}
                    onChange={(e) => setAllowApprovals(e.target.checked)}
                  />
                  Allow deliverable approvals
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowFeedback}
                    onChange={(e) => setAllowFeedback(e.target.checked)}
                  />
                  Allow feedback & satisfaction survey
                </label>
              </div>
              <Button type="submit" className="w-full" disabled={clients.length === 0}>
                <Link2 className="w-4 h-4 mr-1.5" aria-hidden="true" />
                Generate Scoped Token
              </Button>
            </form>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader
              title="Issued Client Portal Tokens"
              description="Local browser portal tokens. Revoke anytime to immediately block access."
            />
            {clientPortalLinks.length === 0 ? (
              <EmptyState
                icon={<Lock className="w-6 h-6" />}
                title="No portal tokens issued"
                description="Generate a scoped client portal token on the left to inspect onboarding checklists, approvals, and strict client-safe filtering."
              />
            ) : (
              <div className="space-y-3">
                {clientPortalLinks.map((link) => {
                  const client = clients.find((c) => c.id === link.clientId);
                  return (
                    <div
                      key={link.id}
                      className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-slate-900 dark:text-white">
                            {link.label}
                          </span>
                          <Badge
                            tone={
                              link.status === 'active' && link.expiresAt >= todayDateStr()
                                ? 'success'
                                : 'danger'
                            }
                          >
                            {link.status === 'active' && link.expiresAt < todayDateStr()
                              ? 'expired'
                              : link.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Client: {client?.name ?? 'Unknown'} · Expires {formatDisplayDate(link.expiresAt)} · Token{' '}
                          <span className="font-mono">{link.token}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedToken(link.token);
                            setActiveTab('preview');
                          }}
                        >
                          Open Preview
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleCopyShareUrl(link.token)}
                        >
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        </Button>
                        {link.status === 'active' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              await repositories.saveClientPortalLink({ ...link, status: 'revoked' });
                              await refresh();
                            }}
                          >
                            Revoke
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await repositories.deleteClientPortalLink(link.id);
                            await refresh();
                          }}
                          aria-label="Delete portal link"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {(standaloneTokenMode || activeTab === 'preview') && (
        <div className="space-y-6">
          {!standaloneTokenMode && (
            <Card padding="sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="w-full sm:max-w-sm">
                  <Select
                    label="Inspect Portal Token"
                    value={activeLink?.token ?? ''}
                    onChange={(e) => setSelectedToken(e.target.value)}
                    options={
                      clientPortalLinks.length > 0
                        ? clientPortalLinks.map((l) => ({
                            value: l.token,
                            label: `${l.label} (${l.token})`,
                          }))
                        : [{ value: '', label: 'No tokens issued' }]
                    }
                  />
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <ShieldAlert className="w-4 h-4 text-[#2563EB]" aria-hidden="true" />
                  <span>
                    Isolation check: Internal client notes, expense records, and private/confidential files are never rendered.
                  </span>
                </div>
              </div>
            </Card>
          )}

          {!scopedView.valid || !activeLink ? (
            <Card>
              <EmptyState
                icon={<Lock className="w-6 h-6" />}
                title="Portal Access Blocked"
                description={scopedView.reason ?? 'Select or generate an active portal link to preview.'}
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Project Summary & Milestones */}
              <Card>
                <CardHeader
                  title={scopedView.clientPublicProfile?.name ?? 'Client Portal'}
                  description={scopedView.clientPublicProfile?.company || 'Verified Scoped Portal Session'}
                  action={<Badge tone="success">Active Token</Badge>}
                />
                {scopedView.projectSummary ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{scopedView.projectSummary.name}</span>
                      <span className="font-mono tabular-nums font-semibold">
                        {scopedView.projectSummary.progress}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-[#2563EB]"
                        style={{ width: `${scopedView.projectSummary.progress}%` }}
                      />
                    </div>
                    <div className="space-y-1.5 pt-2">
                      {scopedView.projectSummary.milestones.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800"
                        >
                          <span className={m.completed ? 'line-through text-slate-400' : ''}>
                            {m.title}
                          </span>
                          <span className="font-mono">{formatDisplayDate(m.dueDate)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Milestones hidden or no project linked.</p>
                )}

                {/* Onboarding Checklist */}
                <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                  <h3 className="text-sm font-semibold">Client Onboarding Checklist</h3>
                  {activeLink.onboardingChecklist.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-center gap-2.5 text-sm cursor-pointer px-2.5 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-[#101827]"
                    >
                      <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={() => void handleToggleChecklist(item.id)}
                      />
                      <span className={item.completed ? 'line-through text-slate-400' : ''}>
                        {item.title}
                      </span>
                    </label>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <Input
                      placeholder="Add onboarding step..."
                      value={newChecklistTitle}
                      onChange={(e) => setNewChecklistTitle(e.target.value)}
                    />
                    <Button size="sm" variant="outline" onClick={() => void handleAddChecklist()}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Deliverables & Approvals */}
              <Card>
                <CardHeader
                  title="Deliverable Approvals"
                  description="Review milestones/deliverables and record approval or revision feedback."
                />
                <div className="space-y-3">
                  {activeLink.approvals.length === 0 && (
                    <p className="text-xs text-slate-500">No approval requests added yet.</p>
                  )}
                  {activeLink.approvals.map((apr) => (
                    <div
                      key={apr.id}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{apr.title}</span>
                        <Badge
                          tone={
                            apr.status === 'approved'
                              ? 'success'
                              : apr.status === 'changes_requested'
                                ? 'warning'
                                : 'neutral'
                          }
                        >
                          {apr.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      {apr.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">{apr.description}</p>
                      )}
                      {activeLink.permissions.allowApprovals && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleSetApprovalStatus(apr.id, 'approved')}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void handleSetApprovalStatus(apr.id, 'changes_requested')}
                          >
                            Request Changes
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                    <Input
                      placeholder="New deliverable approval title..."
                      value={newApprovalTitle}
                      onChange={(e) => setNewApprovalTitle(e.target.value)}
                    />
                    <Input
                      placeholder="Description / link note (optional)"
                      value={newApprovalDesc}
                      onChange={(e) => setNewApprovalDesc(e.target.value)}
                    />
                    <Button size="sm" variant="outline" onClick={() => void handleAddApproval()}>
                      Request Client Approval
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Scoped Invoices & Shared Files */}
              <Card>
                <CardHeader
                  title="Shared Invoices & Files"
                  description="Only sent invoices and client_shared Vault documents are visible."
                />
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-slate-500 mb-2">
                      Invoices ({scopedView.scopedInvoices.length})
                    </h4>
                    {scopedView.scopedInvoices.length === 0 ? (
                      <p className="text-xs text-slate-500">No shared invoices.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {scopedView.scopedInvoices.map((inv) => (
                          <div
                            key={inv.id}
                            className="flex items-center justify-between text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800"
                          >
                            <span className="font-mono font-medium">{inv.number}</span>
                            <span className="font-mono tabular-nums">
                              {formatMoney(inv.total, inv.currency)} (Due {formatMoney(inv.balanceDue, inv.currency)})
                            </span>
                            <Badge tone={inv.status === 'paid' ? 'success' : 'warning'}>
                              {inv.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold uppercase text-slate-500 mb-2">
                      Client-Shared Files ({scopedView.scopedFiles.length})
                    </h4>
                    {scopedView.scopedFiles.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No Vault files marked "client_shared" for this client yet.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {scopedView.scopedFiles.map((file) => (
                          <div
                            key={file.id}
                            className="flex items-center justify-between text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800"
                          >
                            <span className="truncate">{file.name}</span>
                            <span className="font-mono text-slate-500">v{file.version}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* Feedback & Satisfaction Survey */}
              <Card>
                <CardHeader
                  title="Client Feedback & Satisfaction Survey"
                  description="Structured feedback loop persisted on this portal record."
                />
                {activeLink.permissions.allowFeedback ? (
                  <div className="space-y-4">
                    <form onSubmit={(e) => void handleSubmitFeedback(e)} className="space-y-2">
                      <Input
                        placeholder="Author name"
                        value={feedbackAuthor}
                        onChange={(e) => setFeedbackAuthor(e.target.value)}
                      />
                      <Textarea
                        rows={2}
                        placeholder="Leave review comment or deliverable feedback..."
                        value={feedbackMsg}
                        onChange={(e) => setFeedbackMsg(e.target.value)}
                      />
                      <Button size="sm" type="submit">
                        Submit Feedback
                      </Button>
                    </form>

                    {activeLink.feedbackNotes.length > 0 && (
                      <div className="space-y-1.5 max-h-36 overflow-y-auto">
                        {activeLink.feedbackNotes.map((f) => (
                          <div
                            key={f.id}
                            className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#101827] text-xs"
                          >
                            <p className="font-semibold">{f.author}</p>
                            <p className="text-slate-600 dark:text-slate-300 mt-0.5">{f.message}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                      <p className="text-xs font-semibold">Project Satisfaction Rating</p>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setSurveyRating(star)}
                            aria-label={`Rate ${star} stars`}
                            className="p-1 cursor-pointer"
                          >
                            <Star
                              className={`w-5 h-5 ${
                                star <= surveyRating
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-slate-300 dark:text-slate-600'
                              }`}
                            />
                          </button>
                        ))}
                        {activeLink.surveyRating && (
                          <span className="ml-2 text-xs font-mono text-slate-500">
                            Saved: {activeLink.surveyRating}/5
                          </span>
                        )}
                      </div>
                      <Input
                        placeholder="Optional satisfaction comment..."
                        value={surveyComment}
                        onChange={(e) => setSurveyComment(e.target.value)}
                      />
                      <Button size="sm" variant="outline" onClick={() => void handleSubmitSurvey()}>
                        Save Survey Response
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Feedback is disabled for this portal link.</p>
                )}
              </Card>
            </div>
          )}
        </div>
      )}

      {activeTab === 'lead-capture' && (
        <Card className="max-w-xl">
          <CardHeader
            title="Public Lead Capture Intake Form"
            description="Validates new prospect inquiries and creates a CRM Client record with status 'lead'."
          />
          <form onSubmit={(e) => void handleLeadSubmit(e)} className="space-y-3">
            <Input
              label="Full Name *"
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              placeholder="e.g. Nadia Mansoor"
              required
            />
            <Input
              label="Company"
              value={leadCompany}
              onChange={(e) => setLeadCompany(e.target.value)}
              placeholder="e.g. Horizon Studio"
            />
            <Input
              label="Email *"
              type="email"
              value={leadEmail}
              onChange={(e) => setLeadEmail(e.target.value)}
              placeholder="nadia@example.com"
              required
            />
            <Textarea
              label="Project Scope & Timeline"
              rows={4}
              value={leadScope}
              onChange={(e) => setLeadScope(e.target.value)}
              placeholder="Briefly describe goals, budget range, and target launch window..."
            />
            <Button type="submit">
              <UserPlus className="w-4 h-4 mr-1.5" aria-hidden="true" />
              Save Lead to CRM
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
};
