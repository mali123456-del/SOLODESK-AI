import React, { useEffect, useMemo, useState } from 'react';
import { Cloud, GitMerge, Info, Layers, LogOut, RefreshCw, Trash2, UserCheck } from 'lucide-react';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  PageHeader,
  Select,
  useToast,
} from '../../components/ui';
import { repositories } from '../../database/repositories/dexieRepositories';
import {
  acceptWorkspaceInviteOnServer,
  fetchBackendSession,
  inviteWorkspaceMemberOnServer,
  listWorkspaceMembersFromServer,
  loginBackendAccount,
  logoutBackendAccount,
  pullWorkspaceChangesFromServer,
  registerBackendAccount,
  type BackendWorkspaceMembership,
} from '../../services/backendAuthClient';
import {
  buildResolvedPendingPatch,
  pushSyncQueueWithRetry,
  ROLE_PERMISSION_MATRIX,
  resolveSyncConflict,
  summarizeSyncQueue,
  SYNC_LIFECYCLE_LABELS,
  type WorkspaceMemberRole,
} from '../../services/cloudSyncService';

export const CloudSyncView: React.FC = () => {
  const {
    activeWorkspace,
    activeWorkspaceId,
    syncQueue,
    syncLifecycleStatus,
    clients,
    projects,
    invoices,
    autoSyncEnabled,
    setAutoSyncEnabled,
    setRemoteSyncStatus,
    isOnline,
    refresh,
  } = useWorkspace();
  const { pushToast } = useToast();

  const [endpointUrl, setEndpointUrl] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('solo-studio');
  const [activeRole, setActiveRole] = useState<WorkspaceMemberRole>('owner');
  const [conflictStrategy, setConflictStrategy] = useState<
    'latest_timestamp' | 'local_wins' | 'remote_wins'
  >('latest_timestamp');

  const [syncingNow, setSyncingNow] = useState(false);
  const [pullingNow, setPullingNow] = useState(false);

  // Optional SaaS Backend Auth (HttpOnly cookie session, zero browser-storage secrets)
  const [authUser, setAuthUser] = useState<{ id: string; email: string; displayName: string } | null>(null);
  const [backendWorkspaces, setBackendWorkspaces] = useState<BackendWorkspaceMembership[]>([]);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [lastPulledSummary, setLastPulledSummary] = useState<string>('');
  const [lastRetrySummary, setLastRetrySummary] = useState<string>('');
  const [conflictServerRevisions, setConflictServerRevisions] = useState<Record<string, number>>({});
  const [serverMembers, setServerMembers] = useState<
    Array<{
      id: string;
      userId: string;
      email: string;
      displayName: string;
      role: WorkspaceMemberRole;
      status: string;
      createdAt: string;
    }>
  >([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'manager' | 'collaborator' | 'client_viewer'>('collaborator');
  const [inviteTokenInput, setInviteTokenInput] = useState('');
  const [lastCreatedInviteInfo, setLastCreatedInviteInfo] = useState<string>('');
  const [memberBusy, setMemberBusy] = useState(false);

  const summary = useMemo(() => summarizeSyncQueue(syncQueue), [syncQueue]);

  useEffect(() => {
    let mounted = true;
    void fetchBackendSession(endpointUrl.trim() || '/api/v1').then((res) => {
      if (!mounted) return;
      if (res.ok && res.user) {
        setAuthUser(res.user);
        setBackendWorkspaces(res.workspaces ?? []);
        setRemoteSyncStatus({ remoteConfigured: true });
        if (res.workspaces?.[0]) {
          setWorkspaceSlug(res.workspaces[0].id);
        }
      } else {
        setRemoteSyncStatus({ remoteConfigured: Boolean(endpointUrl.trim()) });
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const loadServerMembers = async (targetWorkspaceId: string) => {
    if (!authUser || !targetWorkspaceId) return;
    setMemberBusy(true);
    try {
      const res = await listWorkspaceMembersFromServer(targetWorkspaceId);
      if (res.ok) {
        setServerMembers(res.members);
      }
    } finally {
      setMemberBusy(false);
    }
  };

  useEffect(() => {
    if (authUser && workspaceSlug) {
      void loadServerMembers(workspaceSlug);
    } else {
      setServerMembers([]);
    }
  }, [authUser, workspaceSlug]);

  const handleEnqueueSnapshot = async () => {
    const sampleClient = clients[0];
    const entityType = sampleClient ? 'client' : projects[0] ? 'project' : 'workspace_snapshot';
    const entityId = sampleClient?.id ?? projects[0]?.id ?? 'workspace';
    await repositories.enqueueSyncItem({
      entityType,
      entityId,
      operation: 'upsert',
      revision: 1,
      status: 'pending',
      conflictReason: '',
      payloadJson: JSON.stringify({
        clients: clients.length,
        projects: projects.length,
        invoices: invoices.length,
        capturedAt: new Date().toISOString(),
      }),
    });
    pushToast({ title: 'Queued local change into sync outbox', tone: 'info' });
    await refresh();
  };

  const handleSimulateConflict = async () => {
    await repositories.enqueueSyncItem({
      entityType: 'project',
      entityId: projects[0]?.id ?? 'sample_proj',
      operation: 'upsert',
      revision: 2,
      status: 'conflict',
      conflictReason: 'Simulated remote revision mismatch for conflict resolver verification.',
      payloadJson: JSON.stringify({ localNote: 'Updated locally' }),
    });
    pushToast({ title: 'Simulated conflict queued for resolution', tone: 'warning' });
    await refresh();
  };

  const handleResolveItem = async (itemId: string) => {
    const item = syncQueue.find((q) => q.id === itemId);
    const knownServerRev = conflictServerRevisions[itemId];
    const nextRevision = item
      ? Math.max(item.revision + 1, (knownServerRev ?? item.revision) + 1)
      : undefined;
    const decision = resolveSyncConflict({
      localUpdatedAt: new Date().toISOString(),
      remoteUpdatedAt: new Date(Date.now() - 60_000).toISOString(),
      strategy: conflictStrategy,
    });
    const pendingPatch = buildResolvedPendingPatch(decision, nextRevision);
    await repositories.updateSyncQueueItem(itemId, pendingPatch);
    pushToast({
      title: `Conflict resolved locally (${decision.winner})`,
      description: 'Marked Pending until remote sync server confirms delivery.',
      tone: 'info',
    });
    await refresh();
  };

  const handlePushSync = async () => {
    setSyncingNow(true);
    setRemoteSyncStatus({
      remoteConfigured: Boolean(authUser || endpointUrl.trim()),
      isSyncingRemote: true,
    });
    try {
      const result = await pushSyncQueueWithRetry({
        endpointUrl: endpointUrl.trim() || '/api/v1',
        workspaceId: workspaceSlug.trim() || 'solo-studio',
        items: syncQueue,
        maxAttempts: 3,
        baseDelayMs: 400,
        maxDelayMs: 4000,
      });

      setLastRetrySummary(
        `Attempts: ${result.attempts}${result.delaysMs.length > 0 ? ` (backoff: ${result.delaysMs.join('ms, ')}ms)` : ''}`
      );

      for (const ackedId of result.ackedIds) {
        await repositories.updateSyncQueueItem(ackedId, {
          status: 'acked',
          conflictReason: `Server ACK received at ${result.serverTimestamp}`,
        });
      }
      for (const conflict of result.conflicts) {
        if (typeof conflict.serverRevision === 'number') {
          setConflictServerRevisions((prev) => ({
            ...prev,
            [conflict.id]: conflict.serverRevision!,
          }));
        }
        await repositories.updateSyncQueueItem(conflict.id, {
          status: 'conflict',
          conflictReason: conflict.reason,
        });
      }
      if (!result.ok) {
        if (result.httpStatus === 401) {
          setAuthUser(null);
          setBackendWorkspaces([]);
        }
        for (const failedId of result.failedIds) {
          await repositories.updateSyncQueueItem(failedId, {
            status: 'failed',
            conflictReason: result.errorMessage ?? 'Server rejected sync batch',
          });
        }
        pushToast({
          title: result.httpStatus === 401 ? 'Sync session expired — sign in again' : 'Remote sync did not complete',
          description: result.errorMessage || 'Sign in to workspace sync server or check endpoint.',
          tone: 'warning',
        });
      } else {
        setRemoteSyncStatus({
          remoteConfigured: true,
          lastRemoteSyncedAt: result.serverTimestamp,
        });
        pushToast({
          title: `Server ACKed ${result.ackedIds.length} item(s)`,
          tone: 'success',
        });
      }
      await refresh();
    } finally {
      setSyncingNow(false);
      setRemoteSyncStatus({ isSyncingRemote: false });
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthBusy(true);
    try {
      const base = endpointUrl.trim() || '/api/v1';
      const outcome =
        authMode === 'register'
          ? await registerBackendAccount({
              endpointUrl: base,
              email: authEmail,
              password: authPassword,
              displayName: authDisplayName || authEmail.split('@')[0],
            })
          : await loginBackendAccount({
              endpointUrl: base,
              email: authEmail,
              password: authPassword,
            });
      if (!outcome.ok || !outcome.user) {
        pushToast({
          title: authMode === 'register' ? 'Registration failed' : 'Sign in failed',
          description: outcome.errorMessage ?? 'Verify server availability and credentials.',
          tone: 'error',
        });
        return;
      }
      setAuthPassword('');
      const me = await fetchBackendSession(base);
      setAuthUser(me.user ?? outcome.user);
      setBackendWorkspaces(me.workspaces ?? []);
      const wsId = me.workspaces?.[0]?.id ?? outcome.defaultWorkspaceId;
      if (wsId) setWorkspaceSlug(wsId);
      pushToast({
        title: `Signed in as ${outcome.user.email}`,
        description: 'HttpOnly cookie session established with SaaS sync server.',
        tone: 'success',
      });
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    await logoutBackendAccount(endpointUrl.trim() || '/api/v1');
    setAuthUser(null);
    setBackendWorkspaces([]);
    pushToast({ title: 'Signed out of cloud sync session', tone: 'info' });
  };

  const handlePullSync = async () => {
    setPullingNow(true);
    try {
      const res = await pullWorkspaceChangesFromServer({
        endpointUrl: endpointUrl.trim() || '/api/v1',
        workspaceId: workspaceSlug.trim() || 'solo-studio',
      });
      if (!res.ok) {
        if (res.httpStatus === 401) {
          setAuthUser(null);
          setBackendWorkspaces([]);
        }
        pushToast({
          title: res.httpStatus === 401 ? 'Sync session expired — sign in again' : 'Sync pull failed',
          description: res.errorMessage ?? 'Sign in first or check workspace membership.',
          tone: 'warning',
        });
        return;
      }
      setLastPulledSummary(
        `Pulled ${res.records.length} revision(s) and ${res.tombstones.length} tombstone(s) at ${res.serverTimestamp}.`
      );
      pushToast({
        title: `Pulled ${res.records.length} remote change(s)`,
        tone: 'success',
      });
    } finally {
      setPullingNow(false);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setMemberBusy(true);
    try {
      const res = await inviteWorkspaceMemberOnServer({
        workspaceId: workspaceSlug,
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      if (!res.ok) {
        pushToast({ title: 'Invite failed', description: res.message, tone: 'warning' });
        return;
      }
      setInviteEmail('');
      setLastCreatedInviteInfo(res.message);
      pushToast({ title: 'Invitation created', description: res.message, tone: 'success' });
      await loadServerMembers(workspaceSlug);
    } finally {
      setMemberBusy(false);
    }
  };

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteTokenInput.trim()) return;
    setMemberBusy(true);
    try {
      const res = await acceptWorkspaceInviteOnServer(inviteTokenInput.trim());
      if (!res.ok) {
        pushToast({ title: 'Accept invite failed', description: res.message, tone: 'warning' });
        return;
      }
      setInviteTokenInput('');
      pushToast({ title: 'Joined workspace', description: res.message, tone: 'success' });
      const me = await fetchBackendSession(endpointUrl.trim() || '/api/v1');
      if (me.ok) setBackendWorkspaces(me.workspaces ?? []);
      if (res.workspaceId) setWorkspaceSlug(res.workspaceId);
    } finally {
      setMemberBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cloud Sync Architecture & Multi-Role Matrix"
        description="Local-first IndexedDB outbox queue, optional SaaS account sync, deterministic conflict resolver, and RBAC boundaries."
      />

      {/* Honest Architecture Disclosure + Optional SaaS Session */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-5">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-[#2563EB] shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">Sync State:</span>
                <Badge
                  tone={
                    syncLifecycleStatus === 'synced'
                      ? 'success'
                      : syncLifecycleStatus === 'conflict' || syncLifecycleStatus === 'failed'
                        ? 'danger'
                        : syncLifecycleStatus === 'pending' || syncLifecycleStatus === 'syncing'
                          ? 'warning'
                          : 'neutral'
                  }
                >
                  {SYNC_LIFECYCLE_LABELS[syncLifecycleStatus]}
                </Badge>
                {authUser ? (
                  <Badge tone="success">Connected ({authUser.email})</Badge>
                ) : (
                  <Badge tone="warning">Remote Server Optional / Unverified Externally</Badge>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                <strong>Active Workspace:</strong> {activeWorkspace?.name ?? activeWorkspaceId}. All business records persist locally in isolated IndexedDB. Outbox items stay <em>Pending</em> locally until an authenticated sync server confirms delivery (<em>Synced</em>).
              </p>
              {lastRetrySummary && (
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  Last push telemetry · {lastRetrySummary}
                </p>
              )}
              {lastPulledSummary && (
                <p className="text-xs font-mono text-emerald-700 dark:text-emerald-300 pt-1">
                  {lastPulledSummary}
                </p>
              )}
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader
            title="Optional Cloud Sync Account"
            description="Uses HttpOnly session cookies — credentials and tokens are never saved in localStorage or IndexedDB."
            action={
              authUser && (
                <Button size="sm" variant="outline" icon={<LogOut className="w-3.5 h-3.5" />} onClick={() => void handleLogout()}>
                  Sign Out
                </Button>
              )
            }
          />
          {authUser ? (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  <span>
                    Signed in as <strong>{authUser.displayName}</strong> ({authUser.email})
                  </span>
                </div>
                <Badge tone="success">Session Active</Badge>
              </div>
              {backendWorkspaces.length > 0 && (
                <Select
                  label="Target Cloud Workspace"
                  value={workspaceSlug}
                  onChange={(e) => setWorkspaceSlug(e.target.value)}
                  options={backendWorkspaces.map((w) => ({
                    value: w.id,
                    label: `${w.name} (${w.role} · ${w.planTier})`,
                  }))}
                />
              )}
            </div>
          ) : (
            <form onSubmit={handleAuthSubmit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {authMode === 'register' && (
                  <Input
                    label="Display Name"
                    required
                    value={authDisplayName}
                    onChange={(e) => setAuthDisplayName(e.target.value)}
                    placeholder="Solo Studio"
                  />
                )}
                <Input
                  label="Email"
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="you@studio.com"
                />
                <Input
                  label="Password (min 8 chars)"
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setAuthMode((m) => (m === 'login' ? 'register' : 'login'))}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  {authMode === 'login'
                    ? 'Need an account? Register workspace owner'
                    : 'Already registered? Sign in instead'}
                </button>
                <Button type="submit" size="sm" variant="primary" loading={authBusy}>
                  {authMode === 'register' ? 'Create Sync Account' : 'Sign In to Sync'}
                </Button>
              </div>
            </form>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sync Outbox & Adapter Config */}
        <Card>
          <CardHeader
            title="Sync Outbox Queue"
            description={`Pending: ${summary.pending} · Conflicts: ${summary.conflicts} · Acked: ${summary.acked}`}
            action={
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => void handleEnqueueSnapshot()}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  Queue Diff
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void handleSimulateConflict()}>
                  Test Conflict
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  loading={pullingNow}
                  onClick={() => void handlePullSync()}
                >
                  Pull Sync
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  loading={syncingNow}
                  onClick={() => void handlePushSync()}
                >
                  <Cloud className="w-3.5 h-3.5 mr-1" />
                  Push Sync
                </Button>
              </div>
            }
          />
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
              <span>
                <strong>Auto-sync</strong> · {isOnline ? 'Online' : 'Offline (Queued Locally)'}
              </span>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="Auto-sync"
                  aria-checked={autoSyncEnabled}
                  checked={autoSyncEnabled}
                  onChange={(e) => void setAutoSyncEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                <span>{autoSyncEnabled ? 'Enabled' : 'Disabled'}</span>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Optional Self-Hosted Sync Endpoint"
                placeholder="https://sync.example.com/v1"
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
              />
              <Input
                label="Tenant / Workspace Slug"
                value={workspaceSlug}
                onChange={(e) => setWorkspaceSlug(e.target.value)}
              />
            </div>

            <Select
              label="Deterministic Conflict Resolution Policy"
              value={conflictStrategy}
              onChange={(e) =>
                setConflictStrategy(e.target.value as 'latest_timestamp' | 'local_wins' | 'remote_wins')
              }
              options={[
                { value: 'latest_timestamp', label: 'Latest Timestamp Wins' },
                { value: 'local_wins', label: 'Local Workspace Always Wins' },
                { value: 'remote_wins', label: 'Remote Revision Always Wins' },
              ]}
            />

            <div className="space-y-2 max-h-64 overflow-y-auto pt-2">
              {syncQueue.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  Sync outbox is clean. Queue a snapshot diff or conflict test above.
                </p>
              ) : (
                syncQueue.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">
                          {item.entityType}:{item.entityId}
                        </span>
                        <Badge
                          tone={
                            item.status === 'acked'
                              ? 'success'
                              : item.status === 'conflict' || item.status === 'failed'
                                ? 'danger'
                                : 'warning'
                          }
                        >
                          {item.status === 'acked'
                            ? 'Synced'
                            : item.status === 'conflict'
                              ? 'Conflict'
                              : item.status === 'failed'
                                ? 'Failed'
                                : 'Pending'}
                        </Badge>
                      </div>
                      {item.conflictReason && (
                        <p className="text-slate-500 mt-0.5 truncate">{item.conflictReason}</p>
                      )}
                    </div>
                    {item.status !== 'acked' && (
                      <Button size="sm" variant="outline" onClick={() => void handleResolveItem(item.id)}>
                        <GitMerge className="w-3.5 h-3.5 mr-1" />
                        Resolve
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>

            {summary.acked > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await repositories.clearAckedSyncItems();
                  await refresh();
                }}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Clear Acked Items ({summary.acked})
              </Button>
            )}
          </div>
        </Card>

        {/* RBAC Matrix */}
        <Card>
          <CardHeader
            title="Multi-Tenant & Role Permission Matrix"
            description="Permission contract enforced across workspace roles and scoped client portal links."
          />
          <div className="space-y-4">
            <Select
              label="Inspect Role Profile"
              value={activeRole}
              onChange={(e) => setActiveRole(e.target.value as WorkspaceMemberRole)}
              options={(Object.keys(ROLE_PERMISSION_MATRIX) as WorkspaceMemberRole[]).map((r) => ({
                value: r,
                label: ROLE_PERMISSION_MATRIX[r].label,
              }))}
            />

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-2 pr-3">Role</th>
                    <th className="py-2 px-2">Clients</th>
                    <th className="py-2 px-2">Invoices</th>
                    <th className="py-2 px-2">Approvals</th>
                    <th className="py-2 px-2">Security</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(ROLE_PERMISSION_MATRIX) as WorkspaceMemberRole[]).map((role) => {
                    const spec = ROLE_PERMISSION_MATRIX[role];
                    const selected = role === activeRole;
                    return (
                      <tr
                        key={role}
                        className={`border-b border-slate-100 dark:border-slate-800/60 ${
                          selected ? 'bg-blue-50/60 dark:bg-blue-950/30 font-medium' : ''
                        }`}
                      >
                        <td className="py-2 pr-3">{spec.label}</td>
                        <td className="py-2 px-2">{spec.canEditClients ? 'Write' : 'Read/None'}</td>
                        <td className="py-2 px-2">{spec.canEditInvoices ? 'Write' : 'Scoped'}</td>
                        <td className="py-2 px-2">{spec.canApproveWorkflows ? 'Yes' : 'No'}</td>
                        <td className="py-2 px-2">{spec.canManageSecurity ? 'Full' : 'Denied'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#101827] border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#2563EB] shrink-0" />
              <span>
                Active profile: <strong>{ROLE_PERMISSION_MATRIX[activeRole].label}</strong>
              </span>
            </div>
          </div>
        </Card>
      </div>

      {authUser && (
        <Card>
          <CardHeader
            title={`Team Members & Invitations (${serverMembers.length})`}
            description="Manage workspace team memberships via authenticated backend endpoints. Email delivery is not configured in local mode."
            action={
              <Button
                size="sm"
                variant="outline"
                loading={memberBusy}
                onClick={() => void loadServerMembers(workspaceSlug)}
              >
                Refresh Members
              </Button>
            }
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
            <div className="space-y-3">
              <form onSubmit={handleInviteMember} className="space-y-2.5">
                <p className="font-semibold text-slate-900 dark:text-white">Invite Teammate</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input
                    label="Email"
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="teammate@studio.com"
                  />
                  <Select
                    label="Role"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}
                    options={[
                      { value: 'admin', label: 'Admin' },
                      { value: 'manager', label: 'Manager' },
                      { value: 'collaborator', label: 'Collaborator' },
                      { value: 'client_viewer', label: 'Client Viewer' },
                    ]}
                  />
                </div>
                <Button type="submit" size="sm" loading={memberBusy}>
                  Create Invitation
                </Button>
              </form>
              {lastCreatedInviteInfo && (
                <p className="p-2.5 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/30 text-slate-700 dark:text-slate-200">
                  {lastCreatedInviteInfo}
                </p>
              )}
              <form onSubmit={handleAcceptInvite} className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <p className="font-semibold text-slate-900 dark:text-white">Accept Invitation Token</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Paste invite token..."
                    value={inviteTokenInput}
                    onChange={(e) => setInviteTokenInput(e.target.value)}
                  />
                  <Button type="submit" size="sm" variant="outline" loading={memberBusy}>
                    Join
                  </Button>
                </div>
              </form>
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-slate-900 dark:text-white">Current Workspace Members</p>
              {serverMembers.length === 0 ? (
                <p className="text-slate-500">No members returned yet for workspace {workspaceSlug}.</p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                  {serverMembers.map((member) => (
                    <div key={member.id} className="p-2.5 flex items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{member.displayName}</p>
                        <p className="text-slate-500">{member.email}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge tone="info">{member.role}</Badge>
                        <Badge tone={member.status === 'active' ? 'success' : 'neutral'}>{member.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
