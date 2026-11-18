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
  fetchBackendSession,
  loginBackendAccount,
  logoutBackendAccount,
  pullWorkspaceChangesFromServer,
  registerBackendAccount,
  type BackendWorkspaceMembership,
} from '../../services/backendAuthClient';
import {
  ROLE_PERMISSION_MATRIX,
  resolveSyncConflict,
  summarizeSyncQueue,
  type WorkspaceMemberRole,
} from '../../services/cloudSyncService';

export const CloudSyncView: React.FC = () => {
  const {
    syncQueue,
    clients,
    projects,
    invoices,
    autoSyncEnabled,
    setAutoSyncEnabled,
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

  const summary = useMemo(() => summarizeSyncQueue(syncQueue), [syncQueue]);

  useEffect(() => {
    let mounted = true;
    void fetchBackendSession(endpointUrl.trim() || '/api/v1').then((res) => {
      if (!mounted) return;
      if (res.ok && res.user) {
        setAuthUser(res.user);
        setBackendWorkspaces(res.workspaces ?? []);
        if (res.workspaces?.[0]) {
          setWorkspaceSlug(res.workspaces[0].id);
        }
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

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
    const decision = resolveSyncConflict({
      localUpdatedAt: new Date().toISOString(),
      remoteUpdatedAt: new Date(Date.now() - 60_000).toISOString(),
      strategy: conflictStrategy,
    });
    const pendingPatch = {
      status: 'pending' as const,
      conflictReason: `Resolved locally (${decision.winner}: ${decision.reason}) — awaiting server ACK.`,
    };
    await repositories.updateSyncQueueItem(itemId, pendingPatch);
    pushToast({
      title: `Conflict resolved locally (${decision.winner})`,
      description: 'Marked pending until backend sync confirms delivery.',
      tone: 'info',
    });
    await refresh();
  };

  const handlePushSync = async () => {
    setSyncingNow(true);
    try {
      const { pushSyncQueueToServer } = await import('../../services/cloudSyncService');
      const result = await pushSyncQueueToServer({
        endpointUrl: endpointUrl.trim() || '/api/v1',
        workspaceId: workspaceSlug.trim() || 'solo-studio',
        items: syncQueue,
      });

      for (const ackedId of result.ackedIds) {
        await repositories.updateSyncQueueItem(ackedId, {
          status: 'acked',
          conflictReason: `Server ACK received at ${result.serverTimestamp}`,
        });
      }
      for (const conflict of result.conflicts) {
        await repositories.updateSyncQueueItem(conflict.id, {
          status: 'conflict',
          conflictReason: conflict.reason,
        });
      }
      if (!result.ok) {
        for (const failedId of result.failedIds) {
          await repositories.updateSyncQueueItem(failedId, {
            status: 'failed',
            conflictReason: result.errorMessage ?? 'Server rejected sync batch',
          });
        }
        pushToast({
          title: 'Remote sync did not complete',
          description: result.errorMessage || 'Sign in to workspace sync server or check endpoint.',
          tone: 'warning',
        });
      } else {
        pushToast({
          title: `Server ACKed ${result.ackedIds.length} item(s)`,
          tone: 'success',
        });
      }
      await refresh();
    } finally {
      setSyncingNow(false);
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
        pushToast({
          title: 'Sync pull failed',
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
                <span className="font-semibold">Remote Sync Endpoint Status:</span>
                {authUser ? (
                  <Badge tone="success">Connected ({authUser.email})</Badge>
                ) : (
                  <Badge tone="warning">NOT CONFIGURED / LOCAL-ONLY</Badge>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                SOLODESK AI persists all business records locally in IndexedDB with zero mandatory paid backend.
                When running the optional Node SaaS server (`/api/v1`), sign in on the right to enable cookie-authenticated push/pull sync.
              </p>
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
                              : item.status === 'conflict'
                                ? 'danger'
                                : 'warning'
                          }
                        >
                          {item.status}
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
    </div>
  );
};
