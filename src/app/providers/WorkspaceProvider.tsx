import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
import { runTaskCompletionTimestampMigration } from '../../database/migrations/taskCompletionMigration';
import { repositories } from '../../database/repositories/dexieRepositories';
import {
  createWorkspaceRecord,
  DEFAULT_WORKSPACE_ID,
  deleteWorkspaceRecord,
  getActiveWorkspaceDatabase,
  getActiveWorkspaceIdSync,
  getDatabaseForWorkspace,
  initializeWorkspaceManager,
  listWorkspaces,
  renameWorkspaceRecord,
  switchActiveWorkspace,
  trackWorkspaceOperation,
  type WorkspaceMetadata,
} from '../../database/workspaceManager';
import {
  deriveRemoteSyncLifecycleStatus,
  type SyncLifecycleStatus,
} from '../../services/cloudSyncService';
import { runWorkspaceBackgroundJobs } from '../../services/backgroundJobRunner';
import {
  computeElapsedSecondsFromIso,
  createBackgroundTimerController,
  type BackgroundTimerController,
  type BackgroundTimerMode,
} from '../../services/backgroundTimerService';
import { validateDailyTaskGoalTarget } from '../../services/productivityService';
import {
  clearDemoWorkspaceData,
  ensureBuiltInTemplates,
  seedDemoWorkspace,
} from '../../database/seeds/demoWorkspace';
import type {
  ActivityEvent,
  Appointment,
  AppSettings,
  AuditEvent,
  BusinessProfile,
  Client,
  ClientPortalLink,
  Contract,
  CustomWorkflow,
  FinanceEntry,
  IntegrationConnection,
  Invoice,
  KnowledgeDocument,
  NotificationItem,
  Payment,
  PrivacyConsent,
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
  VoiceNote,
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
  syncLifecycleStatus: SyncLifecycleStatus;
  pendingSyncCount: number;
  lastSyncedAt: string | null;
  lastRemoteSyncedAt: string | null;
  remoteConfigured: boolean;
  syncError: string | null;
  autoSyncEnabled: boolean;
  syncPaused: boolean;
  workspaces: WorkspaceMetadata[];
  activeWorkspace: WorkspaceMetadata | null;
  activeWorkspaceId: string;
  hasUnsavedQuickNotes: boolean;
  quickNote: string;
  quickNoteUpdatedAt: string;
  dailyTaskGoalTarget: number;
  dailyTaskGoalUpdatedAt: string;
  runningTimer: TimeEntry | null;
  timerElapsedSeconds: number;
  backgroundTimerMode: BackgroundTimerMode;
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
  voiceNotes: VoiceNote[];
  auditEvents: AuditEvent[];
  integrationConnections: IntegrationConnection[];
  privacyConsents: PrivacyConsent[];
  storageHealth: StorageHealth;
}

interface WorkspaceContextValue extends WorkspaceState {
  refresh: () => Promise<void>;
  retrySync: () => Promise<void>;
  setAutoSyncEnabled: (enabled: boolean) => Promise<void>;
  setSyncPaused: (paused: boolean) => Promise<void>;
  setActiveWorkspaceId: (workspaceId: string) => Promise<void>;
  createWorkspace: (name: string, switchToNew?: boolean) => Promise<WorkspaceMetadata>;
  renameWorkspace: (workspaceId: string, name: string) => Promise<WorkspaceMetadata>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  setHasUnsavedQuickNotes: (dirty: boolean) => void;
  setRemoteSyncStatus: (info: { remoteConfigured?: boolean; lastRemoteSyncedAt?: string | null; isSyncingRemote?: boolean }) => void;
  saveQuickNote: (content: string) => Promise<void>;
  clearQuickNote: () => Promise<void>;
  setDailyTaskGoalTarget: (target: number) => Promise<void>;
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
  syncLifecycleStatus: 'local_only',
  pendingSyncCount: 0,
  lastSyncedAt: null,
  lastRemoteSyncedAt: null,
  remoteConfigured: false,
  syncError: null,
  autoSyncEnabled: true,
  syncPaused: false,
  workspaces: [],
  activeWorkspace: null,
  activeWorkspaceId: DEFAULT_WORKSPACE_ID,
  hasUnsavedQuickNotes: false,
  quickNote: '',
  quickNoteUpdatedAt: '',
  dailyTaskGoalTarget: 0,
  dailyTaskGoalUpdatedAt: '',
  runningTimer: null,
  timerElapsedSeconds: 0,
  backgroundTimerMode: 'fallback',
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
  voiceNotes: [],
  auditEvents: [],
  integrationConnections: [],
  privacyConsents: [],
  storageHealth: initialStorage,
  refresh: async () => {},
  retrySync: async () => {},
  setAutoSyncEnabled: async () => {},
  setSyncPaused: async () => {},
  setActiveWorkspaceId: async () => {},
  createWorkspace: async () => {
    throw new Error('WorkspaceProvider not mounted');
  },
  renameWorkspace: async () => {
    throw new Error('WorkspaceProvider not mounted');
  },
  switchWorkspace: async () => {},
  deleteWorkspace: async () => {},
  setHasUnsavedQuickNotes: () => {},
  setRemoteSyncStatus: () => {},
  saveQuickNote: async () => {},
  clearQuickNote: async () => {},
  setDailyTaskGoalTarget: async () => {},
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
  const [backgroundTimerMode, setBackgroundTimerMode] = useState<BackgroundTimerMode>(() =>
    typeof Worker !== 'undefined' ? 'web-worker' : 'fallback'
  );
  const timerControllerRef = useRef<BackgroundTimerController | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceMetadata[]>([]);
  const [activeWsIdState, setActiveWsIdState] = useState<string>(() => getActiveWorkspaceIdSync());
  const [hasUnsavedQuickNotes, setHasUnsavedQuickNotes] = useState(false);
  const [remoteConfigured, setRemoteConfigured] = useState(false);
  const [lastRemoteSyncedAt, setLastRemoteSyncedAt] = useState<string | null>(null);
  const [isSyncingRemote, setIsSyncingRemote] = useState(false);
  const refreshEpochRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [state, setState] = useState<
    Omit<
      WorkspaceState,
      | 'isOnline'
      | 'syncStatus'
      | 'syncLifecycleStatus'
      | 'pendingSyncCount'
      | 'lastSyncedAt'
      | 'lastRemoteSyncedAt'
      | 'remoteConfigured'
      | 'syncError'
      | 'autoSyncEnabled'
      | 'syncPaused'
      | 'workspaces'
      | 'activeWorkspace'
      | 'activeWorkspaceId'
      | 'hasUnsavedQuickNotes'
      | 'quickNote'
      | 'quickNoteUpdatedAt'
      | 'dailyTaskGoalTarget'
      | 'dailyTaskGoalUpdatedAt'
      | 'runningTimer'
      | 'timerElapsedSeconds'
      | 'backgroundTimerMode'
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
    voiceNotes: [],
    auditEvents: [],
    integrationConnections: [],
    privacyConsents: [],
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

  // Persistent Web Worker background ticker: continues accurate timing even when tab is hidden
  useEffect(() => {
    const controller = createBackgroundTimerController((snapshot) => {
      if (!mountedRef.current) return;
      setTimerNowMs(snapshot.nowMs);
      setBackgroundTimerMode(snapshot.mode);
    });
    timerControllerRef.current = controller;
    setBackgroundTimerMode(controller.mode);
    return () => {
      controller.dispose();
      timerControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const controller = timerControllerRef.current;
    if (!controller) return;
    if (!runningTimer) {
      controller.stop();
      return;
    }
    setTimerNowMs(Date.now());
    controller.start(runningTimer.startTime);
    setBackgroundTimerMode(controller.mode);
  }, [runningTimer]);

  const timerElapsedSeconds = useMemo(
    () => (runningTimer ? computeElapsedSecondsFromIso(runningTimer.startTime, timerNowMs) : 0),
    [runningTimer, timerNowMs]
  );

  const autoSyncEnabled = state.settings?.autoSyncEnabled ?? true;
  const syncPaused = state.settings?.syncPaused ?? false;
  const activeWorkspaceId = activeWsIdState || state.settings?.activeWorkspaceId?.trim() || DEFAULT_WORKSPACE_ID;
  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId]
  );
  const quickNoteEntry = state.settings?.quickNotesByWorkspace?.[activeWorkspaceId];
  const quickNote = quickNoteEntry?.content ?? '';
  const quickNoteUpdatedAt = quickNoteEntry?.updatedAt ?? '';
  const dailyTaskGoalEntry = state.settings?.dailyTaskGoalsByWorkspace?.[activeWorkspaceId];
  const dailyTaskGoalTarget = dailyTaskGoalEntry?.target ?? 0;
  const dailyTaskGoalUpdatedAt = dailyTaskGoalEntry?.updatedAt ?? '';

  const syncLifecycleStatus = useMemo(
    () =>
      deriveRemoteSyncLifecycleStatus({
        syncQueue: state.syncQueue,
        remoteConfigured,
        isSyncingRemote,
        localSyncError: syncTelemetry.lastError,
        lastRemoteSyncedAt,
      }),
    [state.syncQueue, remoteConfigured, isSyncingRemote, syncTelemetry.lastError, lastRemoteSyncedAt]
  );

  const refresh = useCallback(async () => {
    const myEpoch = ++refreshEpochRef.current;
    const currentWsId = getActiveWorkspaceIdSync();
    try {
      await trackSyncOperation('Sync local IndexedDB workspace', async () => {
        await trackWorkspaceOperation(currentWsId, async (activeDb) => {
          const wsList = await listWorkspaces();
          const scopedRepos = repositories.withDatabase(activeDb);
          await runTaskCompletionTimestampMigration(activeDb);
          await ensureBuiltInTemplates(activeDb);
          await runWorkspaceBackgroundJobs({ database: activeDb, repo: scopedRepos });

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
            voiceNotes,
            auditEvents,
            integrationConnections,
            privacyConsents,
            storageHealth,
          ] = await Promise.all([
            scopedRepos.getBusinessProfile(),
            scopedRepos.getSettings(),
            scopedRepos.listClients(),
            scopedRepos.listProjects(),
            scopedRepos.listTasks(),
            scopedRepos.listProposals(),
            scopedRepos.listQuotations(),
            scopedRepos.listContracts(),
            scopedRepos.listInvoices(),
            scopedRepos.listPayments(),
            scopedRepos.listFinanceEntries(),
            scopedRepos.listTimeEntries(),
            scopedRepos.listTemplates(),
            scopedRepos.listKnowledgeDocs(),
            scopedRepos.listWorkflowRuns(),
            scopedRepos.listServiceCatalog(),
            scopedRepos.listAppointments(),
            scopedRepos.listWorkspaceGoals(),
            scopedRepos.listActivities(120),
            scopedRepos.listNotifications(),
            scopedRepos.listVaultFiles(),
            scopedRepos.listClientPortalLinks(),
            scopedRepos.listRetainers(),
            scopedRepos.listCustomWorkflows(),
            scopedRepos.listWebhooks(),
            scopedRepos.listSyncQueue(),
            scopedRepos.listSecurityAuditLogs(200),
            scopedRepos.listSavedViews(),
            scopedRepos.listVoiceNotes(),
            scopedRepos.listAuditEvents(500),
            scopedRepos.listIntegrationConnections(),
            scopedRepos.listPrivacyConsents(),
            getStorageHealth(),
          ]);

          if (
            !mountedRef.current ||
            typeof window === 'undefined' ||
            myEpoch !== refreshEpochRef.current ||
            currentWsId !== getActiveWorkspaceIdSync()
          ) {
            return;
          }

          setWorkspaces(wsList);
          setActiveWsIdState(currentWsId);
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
            voiceNotes,
            auditEvents,
            integrationConnections,
            privacyConsents,
            storageHealth,
          });
        });
      });
    } catch (err) {
      if (
        !mountedRef.current ||
        typeof window === 'undefined' ||
        myEpoch !== refreshEpochRef.current ||
        currentWsId !== getActiveWorkspaceIdSync()
      ) {
        return;
      }
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
      const init = await initializeWorkspaceManager();
      if (!mountedRef.current || typeof window === 'undefined') return;
      setActiveWsIdState(init.activeWorkspaceId);
      setWorkspaces(init.workspaces);
      await refresh();
    })();
  }, [refresh]);

  // Automatic background check when returning online with Auto-sync enabled
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
      const wsId = getActiveWorkspaceIdSync();
      const targetDb = getDatabaseForWorkspace(wsId);
      const updatedSettings = await repositories.saveSettings({ autoSyncEnabled: enabled }, targetDb);
      if (wsId === getActiveWorkspaceIdSync()) {
        setState((prev) => ({ ...prev, settings: updatedSettings }));
      }
      await repositories.withDatabase(targetDb).logSecurityEvent({
        eventType: 'auto_sync_toggled',
        severity: 'info',
        actor: 'user',
        detail: `Background Auto-sync ${enabled ? 'enabled' : 'disabled'} by user.`,
      });
      if (wsId === getActiveWorkspaceIdSync()) {
        await refresh();
      }
    },
    [refresh]
  );

  const setSyncPaused = useCallback(
    async (paused: boolean) => {
      const wsId = getActiveWorkspaceIdSync();
      const targetDb = getDatabaseForWorkspace(wsId);
      const updatedSettings = await repositories.saveSettings({ syncPaused: paused }, targetDb);
      if (wsId === getActiveWorkspaceIdSync()) {
        setState((prev) => ({ ...prev, settings: updatedSettings }));
        await refresh();
      }
    },
    [refresh]
  );

  const switchWorkspace = useCallback(
    async (workspaceId: string) => {
      refreshEpochRef.current += 1;
      const switched = await switchActiveWorkspace(workspaceId);
      const targetDb = getDatabaseForWorkspace(switched.id);
      setHasUnsavedQuickNotes(false);
      await repositories.saveSettings({ activeWorkspaceId: switched.id }, targetDb);
      await refresh();
    },
    [refresh]
  );

  const setActiveWorkspaceId = useCallback(
    async (workspaceId: string) => {
      await switchWorkspace(workspaceId);
    },
    [switchWorkspace]
  );

  const createWorkspace = useCallback(
    async (name: string, switchToNew = true): Promise<WorkspaceMetadata> => {
      const created = await createWorkspaceRecord({ name });
      const createdDb = getDatabaseForWorkspace(created.id);
      await repositories.withDatabase(createdDb).recordAuditEvent({
        workspaceId: created.id,
        eventType: 'WORKSPACE_CREATED',
        action: 'workspace.created',
        resourceType: 'workspace',
        resourceId: created.id,
        detail: `Created isolated workspace "${created.name}"`,
      });
      if (switchToNew) {
        refreshEpochRef.current += 1;
        const switched = await switchActiveWorkspace(created.id);
        setHasUnsavedQuickNotes(false);
        await repositories.saveSettings(
          {
            activeWorkspaceId: switched.id,
            onboardingCompleted: true,
          },
          createdDb
        );
        await refresh();
      } else {
        await repositories.saveSettings(
          {
            activeWorkspaceId: created.id,
            onboardingCompleted: true,
          },
          createdDb
        );
        const wsList = await listWorkspaces();
        setWorkspaces(wsList);
      }
      return created;
    },
    [refresh]
  );

  const renameWorkspace = useCallback(
    async (workspaceId: string, name: string): Promise<WorkspaceMetadata> => {
      const updated = await renameWorkspaceRecord(workspaceId, name);
      const targetDb = getDatabaseForWorkspace(updated.id);
      await repositories.withDatabase(targetDb).recordAuditEvent({
        workspaceId: updated.id,
        eventType: 'WORKSPACE_RENAMED',
        action: 'workspace.renamed',
        resourceType: 'workspace',
        resourceId: updated.id,
        detail: `Renamed workspace to "${updated.name}"`,
      });
      const wsList = await listWorkspaces();
      setWorkspaces(wsList);
      if (updated.id === getActiveWorkspaceIdSync()) {
        await refresh();
      }
      return updated;
    },
    [refresh]
  );

  const deleteWorkspace = useCallback(
    async (workspaceId: string) => {
      refreshEpochRef.current += 1;
      await deleteWorkspaceRecord(workspaceId);
      setHasUnsavedQuickNotes(false);
      await repositories.withDatabase(getActiveWorkspaceDatabase()).recordAuditEvent({
        eventType: 'WORKSPACE_DELETED',
        action: 'workspace.deleted',
        resourceType: 'workspace',
        resourceId: workspaceId,
        severity: 'warning',
        detail: `Deleted secondary workspace "${workspaceId}"`,
      });
      await refresh();
    },
    [refresh]
  );

  const setRemoteSyncStatus = useCallback(
    (info: { remoteConfigured?: boolean; lastRemoteSyncedAt?: string | null; isSyncingRemote?: boolean }) => {
      if (typeof info.remoteConfigured === 'boolean') {
        setRemoteConfigured(info.remoteConfigured);
      }
      if (info.lastRemoteSyncedAt !== undefined) {
        setLastRemoteSyncedAt(info.lastRemoteSyncedAt);
      }
      if (typeof info.isSyncingRemote === 'boolean') {
        setIsSyncingRemote(info.isSyncingRemote);
      }
    },
    []
  );

  const saveQuickNote = useCallback(
    async (content: string) => {
      if (content.length > 10_000) {
        throw new Error('Quick Notes cannot exceed 10,000 characters.');
      }
      const wsId = getActiveWorkspaceIdSync();
      const targetDb = getDatabaseForWorkspace(wsId);
      const current = await repositories.getSettings(targetDb);
      const nextNotes = {
        ...(current.quickNotesByWorkspace ?? {}),
        [wsId]: {
          content,
          updatedAt: new Date().toISOString(),
        },
      };
      await repositories.saveSettings(
        { quickNotesByWorkspace: nextNotes, activeWorkspaceId: wsId },
        targetDb
      );
      if (wsId === getActiveWorkspaceIdSync()) {
        setHasUnsavedQuickNotes(false);
        await refresh();
      }
    },
    [refresh]
  );

  const clearQuickNote = useCallback(async () => {
    const wsId = getActiveWorkspaceIdSync();
    const targetDb = getDatabaseForWorkspace(wsId);
    const current = await repositories.getSettings(targetDb);
    const nextNotes = {
      ...(current.quickNotesByWorkspace ?? {}),
      [wsId]: {
        content: '',
        updatedAt: new Date().toISOString(),
      },
    };
    await repositories.saveSettings(
      { quickNotesByWorkspace: nextNotes, activeWorkspaceId: wsId },
      targetDb
    );
    if (wsId === getActiveWorkspaceIdSync()) {
      setHasUnsavedQuickNotes(false);
      await refresh();
    }
  }, [refresh]);

  const setDailyTaskGoalTarget = useCallback(
    async (target: number) => {
      const validation = validateDailyTaskGoalTarget(target);
      if (!validation.valid) {
        throw new Error(validation.error ?? 'Invalid daily task target.');
      }
      const wsId = getActiveWorkspaceIdSync();
      const targetDb = getDatabaseForWorkspace(wsId);
      const current = await repositories.getSettings(targetDb);
      const nextGoals = {
        ...(current.dailyTaskGoalsByWorkspace ?? {}),
        [wsId]: {
          target: validation.value,
          updatedAt: new Date().toISOString(),
        },
      };
      await repositories.saveSettings(
        { dailyTaskGoalsByWorkspace: nextGoals, activeWorkspaceId: wsId },
        targetDb
      );
      if (wsId === getActiveWorkspaceIdSync()) {
        await refresh();
      }
    },
    [refresh]
  );

  const startGlobalTimer = useCallback(
    async (input: GlobalTimerStartInput): Promise<TimeEntry> => {
      const wsId = getActiveWorkspaceIdSync();
      const targetDb = getDatabaseForWorkspace(wsId);
      const created = await repositories.withDatabase(targetDb).startTimer({
        projectId: input.projectId ?? '',
        taskId: input.taskId ?? '',
        description: input.description,
        hourlyRate: Math.max(0, Number(input.hourlyRate) || 0),
        billable: input.billable,
      });
      if (wsId === getActiveWorkspaceIdSync()) {
        await refresh();
      }
      return created;
    },
    [refresh]
  );

  const stopGlobalTimer = useCallback(
    async (timerId?: string) => {
      const targetId = timerId ?? runningTimer?.id;
      if (!targetId) return;
      const wsId = getActiveWorkspaceIdSync();
      const targetDb = getDatabaseForWorkspace(wsId);
      await repositories.withDatabase(targetDb).stopTimer(targetId);
      if (wsId === getActiveWorkspaceIdSync()) {
        await refresh();
      }
    },
    [runningTimer, refresh]
  );

  const loadDemoWorkspace = useCallback(async () => {
    await seedDemoWorkspace(getActiveWorkspaceDatabase());
    await refresh();
  }, [refresh]);

  const removeDemoWorkspace = useCallback(async () => {
    await clearDemoWorkspaceData(getActiveWorkspaceDatabase());
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
      syncLifecycleStatus,
      pendingSyncCount: syncTelemetry.pendingCount,
      lastSyncedAt: syncTelemetry.lastSyncedAt,
      lastRemoteSyncedAt,
      remoteConfigured,
      syncError: syncTelemetry.lastError,
      autoSyncEnabled,
      syncPaused,
      workspaces,
      activeWorkspace,
      activeWorkspaceId,
      hasUnsavedQuickNotes,
      quickNote,
      quickNoteUpdatedAt,
      dailyTaskGoalTarget,
      dailyTaskGoalUpdatedAt,
      runningTimer,
      timerElapsedSeconds,
      backgroundTimerMode,
      refresh,
      retrySync,
      setAutoSyncEnabled,
      setSyncPaused,
      setActiveWorkspaceId,
      createWorkspace,
      renameWorkspace,
      switchWorkspace,
      deleteWorkspace,
      setHasUnsavedQuickNotes,
      setRemoteSyncStatus,
      saveQuickNote,
      clearQuickNote,
      setDailyTaskGoalTarget,
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
      syncLifecycleStatus,
      lastRemoteSyncedAt,
      remoteConfigured,
      autoSyncEnabled,
      syncPaused,
      workspaces,
      activeWorkspace,
      activeWorkspaceId,
      hasUnsavedQuickNotes,
      quickNote,
      quickNoteUpdatedAt,
      dailyTaskGoalTarget,
      dailyTaskGoalUpdatedAt,
      runningTimer,
      timerElapsedSeconds,
      backgroundTimerMode,
      refresh,
      retrySync,
      setAutoSyncEnabled,
      setSyncPaused,
      setActiveWorkspaceId,
      createWorkspace,
      renameWorkspace,
      switchWorkspace,
      deleteWorkspace,
      setRemoteSyncStatus,
      saveQuickNote,
      clearQuickNote,
      setDailyTaskGoalTarget,
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
