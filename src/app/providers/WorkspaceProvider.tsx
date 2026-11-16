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
  Contract,
  FinanceEntry,
  Invoice,
  KnowledgeDocument,
  NotificationItem,
  Payment,
  Project,
  Proposal,
  Quotation,
  ReusableTemplate,
  ServiceCatalogItem,
  Task,
  TimeEntry,
  WorkflowRun,
  WorkspaceGoal,
} from '../../domain/schemas/entities';

export interface WorkspaceState {
  loading: boolean;
  error: string | null;
  isOnline: boolean;
  syncStatus: LocalSyncStatus;
  pendingSyncCount: number;
  lastSyncedAt: string | null;
  syncError: string | null;
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
  storageHealth: StorageHealth;
}

interface WorkspaceContextValue extends WorkspaceState {
  refresh: () => Promise<void>;
  retrySync: () => Promise<void>;
  loadDemoWorkspace: () => Promise<void>;
  removeDemoWorkspace: () => Promise<void>;
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
  storageHealth: initialStorage,
  refresh: async () => {},
  retrySync: async () => {},
  loadDemoWorkspace: async () => {},
  removeDemoWorkspace: async () => {},
});

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialSync = getSyncSnapshot();
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [syncTelemetry, setSyncTelemetry] = useState(initialSync);

  const [state, setState] = useState<
    Omit<WorkspaceState, 'isOnline' | 'syncStatus' | 'pendingSyncCount' | 'lastSyncedAt' | 'syncError'>
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

  const refresh = useCallback(async () => {
    try {
      await trackSyncOperation('Sync local IndexedDB workspace', async () => {
        await ensureBuiltInTemplates();
        await repositories.refreshOverdueInvoices();

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

  const retrySync = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const loadDemoWorkspace = useCallback(async () => {
    await seedDemoWorkspace();
    await refresh();
  }, [refresh]);

  const removeDemoWorkspace = useCallback(async () => {
    await clearDemoWorkspaceData();
    await refresh();
  }, [refresh]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      ...state,
      isOnline,
      syncStatus: syncTelemetry.status,
      pendingSyncCount: syncTelemetry.pendingCount,
      lastSyncedAt: syncTelemetry.lastSyncedAt,
      syncError: syncTelemetry.lastError,
      refresh,
      retrySync,
      loadDemoWorkspace,
      removeDemoWorkspace,
    }),
    [state, isOnline, syncTelemetry, refresh, retrySync, loadDemoWorkspace, removeDemoWorkspace]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
