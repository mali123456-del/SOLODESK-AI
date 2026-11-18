import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  getSyncSnapshot,
  subscribeSyncEvents,
  trackSyncOperation,
  type LocalSyncStatus,
} from '../../core/syncEvents';
import {
  getStorageHealth,
  requestPersistentBrowserStorage,
  type StorageHealth,
} from '../../database/db';
import { repositories } from '../../database/repositories/dexieRepositories';
import { runWorkspaceBackgroundJobs } from '../../services/backgroundJobRunner';
import {
  clearDemoWorkspaceData,
  ensureBuiltInTemplates,
  seedDemoWorkspace,
} from '../../database/seeds/demoWorkspace';
import type {
  ActivityEvent,
  Appointment,
  AppSettings,
  BusinessProfile,
  Client,
  ClientPortalLink,
  Contract,
  CustomWorkflow,
  FinanceEntry,
  Invoice,
  KnowledgeDocument,
  NotificationItem,
  Payment,
  Project,
  Proposal,
  Quotation,
  RecentWorkspaceItem,
  Retainer,
  ReusableTemplate,
  SavedView,
  SecurityAuditLog,
  ServiceCatalogItem,
  SyncQueueItem,
  Task,
  TimeEntry,
  VaultFile,
  WebhookConfig,
  WorkflowRun,
  WorkspaceGoal,
} from '../../domain/schemas/entities';

export interface GlobalTimerStartInput {
  projectId?: string;
  taskId?: string;
  description: string;
  hourlyRate: number;
  billable: boolean;
}

export interface WorkspaceState {
  loading: boolean;
  error: string | null;
  isOnline: boolean;
  syncStatus: LocalSyncStatus;
  pendingSyncCount: number;
  lastSyncedAt: string | null;
  syncError: string | null;
  autoSyncEnabled: boolean;
  syncPaused: boolean;
  runningTimer: TimeEntry | null;
  timerElapsedSeconds: number;
  businessProfile: BusinessProfile | null;
  settings: AppSettings | null;
  clients: Client[];
  projects: Project[];
  tasks: Task[];
  proposals: Proposal[];
  quotations: Quotation[];
  contracts: Contract[];
  invoices: Invoice[];
  payments: Payment[];
  financeEntries: FinanceEntry[];
  timeEntries: TimeEntry[];
  templates: ReusableTemplate[];
  knowledgeDocs: KnowledgeDocument[];
  workflowRuns: WorkflowRun[];
  serviceCatalog: ServiceCatalogItem[];
  appointments: Appointment[];
  workspaceGoals: WorkspaceGoal[];
  activities: ActivityEvent[];
  notifications: NotificationItem[];
  vaultFiles: VaultFile[];
  clientPortalLinks: ClientPortalLink[];
  retainers: Retainer[];
  customWorkflows: CustomWorkflow[];
  webhooks: WebhookConfig[];
  syncQueue: SyncQueueItem[];
  securityAuditLogs: SecurityAuditLog[];
  savedViews: SavedView[];
  storageHealth: StorageHealth;
}

interface WorkspaceContextValue extends WorkspaceState {
  refresh: () => Promise<void>;
  retrySync: () => Promise<void>;
  setAutoSyncEnabled: (enabled: boolean) => Promise<void>;
  setSyncPaused: (paused: boolean) => Promise<void>;
  startGlobalTimer: (input: GlobalTimerStartInput) => Promise<TimeEntry>;
  stopGlobalTimer: (timerId?: string) => Promise<void>;
  loadDemoWorkspace: () => Promise<void>;
  removeDemoWorkspace: () => Promise<void>;
  togglePinnedId: (id: string) => Promise<void>;
  toggleFavoriteId: (id: string) => Promise<void>;
  recordRecentItem: (item: Omit<RecentWorkspaceItem, 'viewedAt'>) => Promise<void>;
}

const initialStorage: StorageHealth = {
  supported: false,
  persisted: false,
  usageBytes: null,
  quotaBytes: null,
};

const initialOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

const WorkspaceContext = createContext<WorkspaceContextValue>({
  loading: true,
  error: null,
  isOnline: initialOnline,
  syncStatus: 'idle',
  pendingSyncCount: 0,
  lastSyncedAt: null,
  syncError: null,
  autoSyncEnabled: true,
  syncPaused: false,
  runningTimer: null,
  timerElapsedSeconds: 0,
  businessProfile: null,
  settings: null,
  clients: [],
  projects: [],
  tasks: [],
  proposals: [],
  quotations: [],
  contracts: [],
  invoices: [],
  payments: [],
  financeEntries: [],
  timeEntries: [],
  templates: [],
  knowledgeDocs: [],
  workflowRuns: [],
  serviceCatalog: [],
  appointments: [],
  workspaceGoals: [],
  activities: [],
  notifications: [],
  vaultFiles: [],
  clientPortalLinks: [],
  retainers: [],
  customWorkflows: [],
  webhooks: [],
  syncQueue: [],
  securityAuditLogs: [],
  savedViews: [],
  storageHealth: initialStorage,
  refresh: async () => {},
  retrySync: async () => {},
  setAutoSyncEnabled: async () => {},
  setSyncPaused: async () => {},
  startGlobalTimer: async () => {
    throw new Error('WorkspaceProvider not mounted');
  },
  stopGlobalTimer: async () => {},
  loadDemoWorkspace: async () => {},
  removeDemoWorkspace: async () => {},
  togglePinnedId: async () => {},
  toggleFavoriteId: async () => {},
  recordRecentItem: async () => {},
});

function computeElapsedSeconds(timer: TimeEntry | null, nowMs: number): number {
  if (!timer) return 0;
  const started = Date.parse(timer.startTime);
  if (Number.isNaN(started)) return 0;
  return Math.max(0, Math.floor((nowMs - started) / 1000));
}

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialSync = getSyncSnapshot();
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [syncTelemetry, setSyncTelemetry] = useState(initialSync);
  const [timerNowMs, setTimerNowMs] = useState(() => Date.now());

  const [state, setState] = useState<
    Omit<
      WorkspaceState,
      | 'isOnline'
      | 'syncStatus'
      | 'pendingSyncCount'
      | 'lastSyncedAt'
      | 'syncError'
      | 'autoSyncEnabled'
      | 'syncPaused'
      | 'runningTimer'
      | 'timerElapsedSeconds'
    >
  >({
    loading: true,
    error: null,
    businessProfile: null,
    settings: null,
    clients: [],
    projects: [],
    tasks: [],
    proposals: [],
    quotations: [],
    contracts: [],
    invoices: [],
    payments: [],
    financeEntries: [],
    timeEntries: [],
    templates: [],
    knowledgeDocs: [],
    workflowRuns: [],
    serviceCatalog: [],
    appointments: [],
    workspaceGoals: [],
    activities: [],
    notifications: [],
    vaultFiles: [],
    clientPortalLinks: [],
    retainers: [],
    customWorkflows: [],
    webhooks: [],
    syncQueue: [],
    securityAuditLogs: [],
    savedViews: [],
    storageHealth: initialStorage,
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const unsubscribeSync = subscribeSyncEvents((snapshot) => {
      setSyncTelemetry(snapshot);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribeSync();
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined' || !state.settings) return;
    const lang = state.settings.language ?? 'en';
    const isRtl = Boolean(state.settings.rtl) || lang === 'ar' || lang === 'ur';
    document.documentElement.lang = lang;
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
  }, [state.settings]);

  const runningTimer = useMemo(
    () => state.timeEntries.find((entry) => entry.isRunning) ?? null,
    [state.timeEntries]
  );

  // Persistent global ticker: updates once per second regardless of active route
  useEffect(() => {
    if (!runningTimer) return;
    setTimerNowMs(Date.now());
    const id = window.setInterval(() => {
      setTimerNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [runningTimer]);

  const timerElapsedSeconds = useMemo(
    () => computeElapsedSeconds(runningTimer, timerNowMs),
    [runningTimer, timerNowMs]
  );

  const autoSyncEnabled = state.settings?.autoSyncEnabled ?? true;
  const syncPaused = state.settings?.syncPaused ?? false;

  const refresh = useCallback(async () => {
    try {
      await trackSyncOperation('Sync local IndexedDB workspace', async () => {
        await ensureBuiltInTemplates();
        await runWorkspaceBackgroundJobs();

        const [
          businessProfile,
          settings,
          clients,
          projects,
          tasks,
          proposals,
          quotations,
          contracts,
          invoices,
          payments,
          financeEntries,
          timeEntries,
          templates,
          knowledgeDocs,
          workflowRuns,
          serviceCatalog,
          appointments,
          workspaceGoals,
          activities,
          notifications,
          vaultFiles,
          clientPortalLinks,
          retainers,
          customWorkflows,
          webhooks,
          syncQueue,
          securityAuditLogs,
          savedViews,
          storageHealth,
        ] = await Promise.all([
          repositories.getBusinessProfile(),
          repositories.getSettings(),
          repositories.listClients(),
          repositories.listProjects(),
          repositories.listTasks(),
          repositories.listProposals(),
          repositories.listQuotations(),
          repositories.listContracts(),
          repositories.listInvoices(),
          repositories.listPayments(),
          repositories.listFinanceEntries(),
          repositories.listTimeEntries(),
          repositories.listTemplates(),
          repositories.listKnowledgeDocs(),
          repositories.listWorkflowRuns(),
          repositories.listServiceCatalog(),
          repositories.listAppointments(),
          repositories.listWorkspaceGoals(),
          repositories.listActivities(120),
          repositories.listNotifications(),
          repositories.listVaultFiles(),
          repositories.listClientPortalLinks(),
          repositories.listRetainers(),
          repositories.listCustomWorkflows(),
          repositories.listWebhooks(),
          repositories.listSyncQueue(),
          repositories.listSecurityAuditLogs(200),
          repositories.listSavedViews(),
          getStorageHealth(),
        ]);

        setState({
          loading: false,
          error: null,
          businessProfile,
          settings,
          clients,
          projects,
          tasks,
          proposals,
          quotations,
          contracts,
          invoices,
          payments,
          financeEntries,
          timeEntries,
          templates,
          knowledgeDocs,
          workflowRuns,
          serviceCatalog,
          appointments,
          workspaceGoals,
          activities,
          notifications,
          vaultFiles,
          clientPortalLinks,
          retainers,
          customWorkflows,
          webhooks,
          syncQueue,
          securityAuditLogs,
          savedViews,
          storageHealth,
        });
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load local workspace database.',
      }));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await requestPersistentBrowserStorage();
      await refresh();
    })();
  }, [refresh]);

  // Automatic background refresh when returning online with Auto-sync enabled
  useEffect(() => {
    if (!isOnline || !autoSyncEnabled || syncPaused) return;
    if (state.loading) return;
    const pendingRemote = state.syncQueue.some((i) => i.status === 'pending');
    if (!pendingRemote) return;

    const timerId = window.setTimeout(() => {
      void trackSyncOperation('Background Auto-sync check', async () => {
        // Local IndexedDB queue remains intact; remote push requires explicit SaaS authentication
      });
    }, 400);
    return () => window.clearTimeout(timerId);
  }, [isOnline, autoSyncEnabled, syncPaused, state.loading, state.syncQueue]);

  const retrySync = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const setAutoSyncEnabled = useCallback(
    async (enabled: boolean) => {
      await repositories.saveSettings({ autoSyncEnabled: enabled });
      await repositories.logSecurityEvent({
        eventType: 'auto_sync_toggled',
        severity: 'info',
        actor: 'user',
        detail: `Background Auto-sync ${enabled ? 'enabled' : 'disabled'} by user.`,
      });
      await refresh();
    },
    [refresh]
  );

  const setSyncPaused = useCallback(
    async (paused: boolean) => {
      await repositories.saveSettings({ syncPaused: paused });
      await refresh();
    },
    [refresh]
  );

  const startGlobalTimer = useCallback(
    async (input: GlobalTimerStartInput): Promise<TimeEntry> => {
      const created = await repositories.startTimer({
        projectId: input.projectId ?? '',
        taskId: input.taskId ?? '',
        description: input.description,
        hourlyRate: Math.max(0, Number(input.hourlyRate) || 0),
        billable: input.billable,
      });
      await refresh();
      return created;
    },
    [refresh]
  );

  const stopGlobalTimer = useCallback(
    async (timerId?: string) => {
      const targetId = timerId ?? runningTimer?.id;
      if (!targetId) return;
      await repositories.stopTimer(targetId);
      await refresh();
    },
    [runningTimer, refresh]
  );

  const loadDemoWorkspace = useCallback(async () => {
    await seedDemoWorkspace();
    await refresh();
  }, [refresh]);

  const removeDemoWorkspace = useCallback(async () => {
    await clearDemoWorkspaceData();
    await refresh();
  }, [refresh]);

  const togglePinnedId = useCallback(
    async (id: string) => {
      const current = await repositories.getSettings();
      const set = new Set(current.pinnedIds ?? []);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      await repositories.saveSettings({ pinnedIds: Array.from(set) });
      await refresh();
    },
    [refresh]
  );

  const toggleFavoriteId = useCallback(
    async (id: string) => {
      const current = await repositories.getSettings();
      const set = new Set(current.favoriteIds ?? []);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      await repositories.saveSettings({ favoriteIds: Array.from(set) });
      await refresh();
    },
    [refresh]
  );

  const recordRecentItem = useCallback(
    async (item: Omit<RecentWorkspaceItem, 'viewedAt'>) => {
      const current = await repositories.getSettings();
      const filtered = (current.recentItems ?? []).filter((r) => r.id !== item.id);
      const next = [{ ...item, viewedAt: new Date().toISOString() }, ...filtered].slice(0, 10);
      await repositories.saveSettings({ recentItems: next });
      await refresh();
    },
    [refresh]
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      ...state,
      isOnline,
      syncStatus: syncTelemetry.status,
      pendingSyncCount: syncTelemetry.pendingCount,
      lastSyncedAt: syncTelemetry.lastSyncedAt,
      syncError: syncTelemetry.lastError,
      autoSyncEnabled,
      syncPaused,
      runningTimer,
      timerElapsedSeconds,
      refresh,
      retrySync,
      setAutoSyncEnabled,
      setSyncPaused,
      startGlobalTimer,
      stopGlobalTimer,
      loadDemoWorkspace,
      removeDemoWorkspace,
      togglePinnedId,
      toggleFavoriteId,
      recordRecentItem,
    }),
    [
      state,
      isOnline,
      syncTelemetry,
      autoSyncEnabled,
      syncPaused,
      runningTimer,
      timerElapsedSeconds,
      refresh,
      retrySync,
      setAutoSyncEnabled,
      setSyncPaused,
      startGlobalTimer,
      stopGlobalTimer,
      loadDemoWorkspace,
      removeDemoWorkspace,
      togglePinnedId,
      toggleFavoriteId,
      recordRecentItem,
    ]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
