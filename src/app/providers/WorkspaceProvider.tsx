import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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
  Task,
  TimeEntry,
} from '../../domain/schemas/entities';

export interface WorkspaceState {
  loading: boolean;
  error: string | null;
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
  activities: ActivityEvent[];
  notifications: NotificationItem[];
  storageHealth: StorageHealth;
}

interface WorkspaceContextValue extends WorkspaceState {
  refresh: () => Promise<void>;
  loadDemoWorkspace: () => Promise<void>;
  removeDemoWorkspace: () => Promise<void>;
}

const initialStorage: StorageHealth = {
  supported: false,
  persisted: false,
  usageBytes: null,
  quotaBytes: null,
};

const WorkspaceContext = createContext<WorkspaceContextValue>({
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
  activities: [],
  notifications: [],
  storageHealth: initialStorage,
  refresh: async () => {},
  loadDemoWorkspace: async () => {},
  removeDemoWorkspace: async () => {},
});

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<WorkspaceState>({
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
    activities: [],
    notifications: [],
    storageHealth: initialStorage,
  });

  const refresh = useCallback(async () => {
    try {
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
        activities,
        notifications,
        storageHealth,
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

  const loadDemoWorkspace = useCallback(async () => {
    await seedDemoWorkspace();
    await refresh();
  }, [refresh]);

  const removeDemoWorkspace = useCallback(async () => {
    await clearDemoWorkspaceData();
    await refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      ...state,
      refresh,
      loadDemoWorkspace,
      removeDemoWorkspace,
    }),
    [state, refresh, loadDemoWorkspace, removeDemoWorkspace]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
