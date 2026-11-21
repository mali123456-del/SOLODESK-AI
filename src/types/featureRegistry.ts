import type { WorkspaceMemberRole } from '../services/cloudSyncService';
import type { AppRouteId } from './navigation';

export type FeatureModuleGroup =
  | '1. Authentication & Security'
  | '2. Workspace & Multi-Tenancy'
  | '3. Dashboard & Overview'
  | '4. Notifications & Alerts'
  | '5. CRM & Client Management'
  | '6. Client Portal'
  | '7. Projects & Planning'
  | '8. Tasks & Sprints'
  | '9. Time Tracking & Timer'
  | '10. Schedule & Inbox'
  | '11. Proposals, Quotations & Contracts'
  | '12. Invoices, Payments & Retainers'
  | '13. Finance, Income, Expenses & Reports'
  | '14. Document Vault & File Sharing'
  | '15. AI Copilot & 15-Agent Workforce'
  | '16. Knowledge Hub & Hybrid RAG v3'
  | '17. Templates & Service Catalog'
  | '18. Automation & Webhooks'
  | '19. Cloud Sync & Offline Queue'
  | '20. Settings, Backups, Help & SEO';

export type FeatureHonestStatus =
  | 'Implemented and tested'
  | 'Implemented locally; external live service blocked'
  | 'Schema & policy implemented; remote Postgres provisioning external';

export interface FeaturePanelDefinition {
  panelId: string;
  group: FeatureModuleGroup;
  name: string;
  lucideIconName: string;
  route: AppRouteId;
  allowedRoles: WorkspaceMemberRole[];
  planEntitlement: 'free' | 'pro' | 'ultimate' | 'business' | 'enterprise';
  offlineSupported: boolean;
  handlesStates: {
    loading: boolean;
    empty: boolean;
    error: boolean;
    validation: boolean;
  };
  testSuites: string[];
  status: FeatureHonestStatus;
}

export const FEATURE_PANEL_REGISTRY: FeaturePanelDefinition[] = [
  {
    panelId: 'security-center',
    group: '1. Authentication & Security',
    name: 'Security Center & Account Audit',
    lucideIconName: 'ShieldCheck',
    route: 'security-center',
    allowedRoles: ['owner', 'admin'],
    planEntitlement: 'free',
    offlineSupported: true,
    handlesStates: { loading: true, empty: true, error: true, validation: true },
    testSuites: ['tests/unit/phase13-hardening.test.ts', 'tests/integration/phase26b-saas-backend.test.ts'],
    status: 'Implemented and tested',
  },
  {
    panelId: 'centralized-audit-logs',
    group: '1. Authentication & Security',
    name: 'Centralized Immutable Audit Log Explorer',
    lucideIconName: 'ScrollText',
    route: 'audit-logs',
    allowedRoles: ['owner', 'admin'],
    planEntitlement: 'business',
    offlineSupported: true,
    handlesStates: { loading: true, empty: true, error: true, validation: true },
    testSuites: ['tests/unit/phase78-95-platform.test.ts', 'tests/integration/backend-phase78-95.test.ts'],
    status: 'Implemented and tested',
  },
  {
    panelId: 'workspace-tenancy',
    group: '2. Workspace & Multi-Tenancy',
    name: 'Workspace RBAC & Memberships',
    lucideIconName: 'Cloud',
    route: 'cloud-sync',
    allowedRoles: ['owner', 'admin', 'manager', 'collaborator', 'client_viewer'],
    planEntitlement: 'pro',
    offlineSupported: true,
    handlesStates: { loading: true, empty: true, error: true, validation: true },
    testSuites: ['tests/integration/phase26b-saas-backend.test.ts', 'tests/integration/phase36-60-backend.test.ts'],
    status: 'Implemented locally; external live service blocked',
  },
  {
    panelId: 'dashboard-overview',
    group: '3. Dashboard & Overview',
    name: 'Dashboard, Daily Digest & Focus Mode',
    lucideIconName: 'LayoutDashboard',
    route: 'dashboard',
    allowedRoles: ['owner', 'admin', 'manager', 'collaborator'],
    planEntitlement: 'free',
    offlineSupported: true,
    handlesStates: { loading: true, empty: true, error: true, validation: true },
    testSuites: ['tests/unit/phase7-dashboard-search-reports.test.tsx', 'tests/e2e/solodesk.spec.ts'],
    status: 'Implemented and tested',
  },
  {
    panelId: 'notifications-alerts',
    group: '4. Notifications & Alerts',
    name: 'Smart Notifications & Activity Log',
    lucideIconName: 'Bell',
    route: 'notifications',
    allowedRoles: ['owner', 'admin', 'manager', 'collaborator'],
    planEntitlement: 'free',
    offlineSupported: true,
    handlesStates: { loading: true, empty: true, error: true, validation: true },
    testSuites: ['tests/unit/phase15-25-features.test.tsx'],
    status: 'Implemented and tested',
  },
  {
    panelId: 'crm-clients',
    group: '5. CRM & Client Management',
    name: 'Clients CRM & Account Directory',
    lucideIconName: 'Users',
    route: 'clients',
    allowedRoles: ['owner', 'admin', 'manager', 'collaborator'],
    planEntitlement: 'free',
    offlineSupported: true,
    handlesStates: { loading: true, empty: true, error: true, validation: true },
    testSuites: ['tests/unit/phase3-4-crm-projects-tasks.test.tsx', 'tests/e2e/solodesk.spec.ts'],
    status: 'Implemented and tested',
  },
  {
    panelId: 'client-portal',
    group: '6. Client Portal',
    name: 'Isolated Scoped Client Portal',
    lucideIconName: 'UserCheck',
    route: 'client-portal',
    allowedRoles: ['owner', 'admin', 'manager', 'client_viewer'],
    planEntitlement: 'ultimate',
    offlineSupported: true,
    handlesStates: { loading: true, empty: true, error: true, validation: true },
    testSuites: ['tests/unit/phase15-25-features.test.tsx', 'tests/e2e/solodesk.spec.ts'],
    status: 'Implemented and tested',
  },
  {
    panelId: 'projects-planning',
    group: '7. Projects & Planning',
    name: 'Projects, Gantt, Milestones & OKRs',
    lucideIconName: 'FolderKanban',
    route: 'projects',
    allowedRoles: ['owner', 'admin', 'manager', 'collaborator'],
    planEntitlement: 'free',
    offlineSupported: true,
    handlesStates: { loading: true, empty: true, error: true, validation: true },
    testSuites: ['tests/unit/phase3-4-crm-projects-tasks.test.tsx', 'tests/e2e/solodesk.spec.ts'],
    status: 'Implemented and tested',
  },
  {
    panelId: 'tasks-sprints',
    group: '8. Tasks & Sprints',
    name: 'Tasks, Kanban & Dependencies',
    lucideIconName: 'CheckSquare',
    route: 'tasks',
    allowedRoles: ['owner', 'admin', 'manager', 'collaborator'],
    planEntitlement: 'free',
    offlineSupported: true,
    handlesStates: { loading: true, empty: true, error: true, validation: true },
    testSuites: ['tests/unit/phase3-4-crm-projects-tasks.test.tsx', 'tests/e2e/solodesk.spec.ts'],
    status: 'Implemented and tested',
  },
  {
    panelId: 'time-tracking-global',
    group: '9. Time Tracking & Timer',
    name: 'Persistent Offline Global Timer & Timesheets',
    lucideIconName: 'Clock',
    route: 'time-tracker',
    allowedRoles: ['owner', 'admin', 'manager', 'collaborator'],
    planEntitlement: 'free',
    offlineSupported: true,
    handlesStates: { loading: true, empty: true, error: true, validation: true },
    testSuites: ['tests/unit/phase6-payments-finance-time.test.tsx', 'tests/unit/phase36-60-features.test.tsx'],
    status: 'Implemented and tested',
  },
  {
    panelId: 'schedule-inbox',
    group: '10. Schedule & Inbox',
    name: 'Schedule, Appointments, ICS & Outreach',
    lucideIconName: 'Calendar',
    route: 'communication',
    allowedRoles: ['owner', 'admin', 'manager', 'collaborator'],
    planEntitlement: 'free',
    offlineSupported: true,
    handlesStates: { loading: true, empty: true, error: true, validation: true },
    testSuites: ['tests/unit/phase36-60-features.test.tsx', 'tests/e2e/solodesk.spec.ts'],
    status: 'Implemented and tested',
  },
  {
    panelId: 'commercial-docs',
    group: '11. Proposals, Quotations & Contracts',
    name: 'Proposals, Quotations & Contracts PDF Studio',
    lucideIconName: 'FileText',
    route: 'proposals',
    allowedRoles: ['owner', 'admin', 'manager'],
    planEntitlement: 'free',
    offlineSupported: true,
    handlesStates: { loading: true, empty: true, error: true, validation: true },
    testSuites: ['tests/unit/phase5-documents.test.tsx'],
    status: 'Implemented and tested',
  },
  {
    panelId: 'invoices-payments',
    group: '12. Invoices, Payments & Retainers',
    name: 'Invoices, Installments & Payment Ledger',
    lucideIconName: 'Receipt',
    route: 'invoices',
    allowedRoles: ['owner', 'admin', 'manager'],
    planEntitlement: 'free',
    offlineSupported: true,
    handlesStates: { loading: true, empty: true, error: true, validation: true },
    testSuites: ['tests/unit/phase2-database-money.test.ts', 'tests/unit/phase6-payments-finance-time.test.tsx'],
    status: 'Implemented locally; external live service blocked',
  },
  {
    panelId: 'finance-bi-reports',
    group: '13. Finance, Income, Expenses & Reports',
    name: 'Income, Expenses, Profitability & BI Reports',
    lucideIconName: 'BarChart3',
    route: 'reports',
    allowedRoles: ['owner', 'admin', 'manager'],
    planEntitlement: 'free',
    offlineSupported: true,
    handlesStates: { loading: true, empty: true, error: true, validation: true },
    testSuites: ['tests/unit/phase7-dashboard-search-reports.test.tsx'],
    status: 'Implemented and tested',
  },
  {
    panelId: 'document-vault',
    group: '14. Document Vault & File Sharing',
    name: 'Document Vault & File Versioning',
    lucideIconName: 'FolderLock',
    route: 'vault',
    allowedRoles: ['owner', 'admin', 'manager', 'collaborator'],
    planEntitlement: 'pro',
    offlineSupported: true,
    handlesStates: { loading: true, empty: true, error: true, validation: true },
    testSuites: ['tests/unit/phase15-25-features.test.tsx', 'tests/integration/phase26b-saas-backend.test.ts'],
    status: 'Implemented and tested',
  },
  {
    panelId: 'ai-copilot-workforce',
    group: '15. AI Copilot & 15-Agent Workforce',
    name: 'AI Copilot & 15-Agent Orchestrator',
    lucideIconName: 'Sparkles',
    route: 'ai-copilot',
    allowedRoles: ['owner', 'admin', 'manager', 'collaborator'],
    planEntitlement: 'ultimate',
    offlineSupported: true,
    handlesStates: { loading: true, empty: true, error: true, validation: true },
    testSuites: ['tests/unit/phase28-31-agents-datasets-bi.test.tsx', 'tests/e2e/solodesk.spec.ts'],
    status: 'Implemented and tested',
  },
  {
    panelId: 'knowledge-rag-v3',
    group: '16. Knowledge Hub & Hybrid RAG v3',
    name: 'Knowledge Hub, Safe Crawler & 25-Case Eval',
    lucideIconName: 'BookOpen',
    route: 'knowledge',
    allowedRoles: ['owner', 'admin', 'manager', 'collaborator'],
    planEntitlement: 'free',
    offlineSupported: true,
    handlesStates: { loading: true, empty: true, error: true, validation: true },
    testSuites: ['tests/unit/phase9-ai-rag-agent.test.ts', 'tests/unit/phase26a-audit-fixes.test.tsx'],
    status: 'Implemented and tested',
  },
  {
    panelId: 'templates-services',
    group: '17. Templates & Service Catalog',
    name: 'Templates & Service Catalog',
    lucideIconName: 'Briefcase',
    route: 'templates',
    allowedRoles: ['owner', 'admin', 'manager', 'collaborator'],
    planEntitlement: 'free',
    offlineSupported: true,
    handlesStates: { loading: true, empty: true, error: true, validation: true },
    testSuites: ['tests/e2e/solodesk.spec.ts'],
    status: 'Implemented and tested',
  },
  {
    panelId: 'automation-webhooks',
    group: '18. Automation & Webhooks',
    name: 'Workflows, Replay-Safe Webhooks & Job Queue',
    lucideIconName: 'Workflow',
    route: 'workflows',
    allowedRoles: ['owner', 'admin', 'manager'],
    planEntitlement: 'pro',
    offlineSupported: true,
    handlesStates: { loading: true, empty: true, error: true, validation: true },
    testSuites: ['tests/unit/phase15-25-features.test.tsx', 'tests/integration/phase36-60-backend.test.ts'],
    status: 'Implemented and tested',
  },
  {
    panelId: 'integrations-hub',
    group: '18. Automation & Webhooks',
    name: 'Centralized Integrations Hub & Adapter Registry',
    lucideIconName: 'Plug',
    route: 'integrations',
    allowedRoles: ['owner', 'admin'],
    planEntitlement: 'pro',
    offlineSupported: true,
    handlesStates: { loading: true, empty: true, error: true, validation: true },
    testSuites: ['tests/unit/phase78-95-platform.test.ts', 'tests/integration/backend-phase78-95.test.ts'],
    status: 'Implemented locally; external live service blocked',
  },
  {
    panelId: 'cloud-sync-outbox',
    group: '19. Cloud Sync & Offline Queue',
    name: 'Auto-sync Settings & Offline Sync Outbox',
    lucideIconName: 'Cloud',
    route: 'settings-cloud-sync',
    allowedRoles: ['owner', 'admin', 'manager', 'collaborator'],
    planEntitlement: 'pro',
    offlineSupported: true,
    handlesStates: { loading: true, empty: true, error: true, validation: true },
    testSuites: ['tests/unit/phase36-60-features.test.tsx', 'tests/integration/phase36-60-backend.test.ts'],
    status: 'Implemented and tested',
  },
  {
    panelId: 'settings-backup-help-seo',
    group: '20. Settings, Backups, Help & SEO',
    name: 'Settings, Encrypted Backups, Plans & Marketing',
    lucideIconName: 'ArchiveRestore',
    route: 'settings-backup',
    allowedRoles: ['owner', 'admin'],
    planEntitlement: 'free',
    offlineSupported: true,
    handlesStates: { loading: true, empty: true, error: true, validation: true },
    testSuites: ['tests/unit/phase8-backup-restore.test.ts', 'tests/unit/phase10-12-pwa-settings-marketing.test.tsx'],
    status: 'Implemented and tested',
  },
];

export function validateFeatureRegistry(): {
  valid: boolean;
  totalGroups: number;
  panels: number;
  missingGroups: string[];
} {
  const presentGroups = new Set(FEATURE_PANEL_REGISTRY.map((p) => p.group));
  return {
    valid: FEATURE_PANEL_REGISTRY.length >= 20 && presentGroups.size === 20,
    totalGroups: presentGroups.size,
    panels: FEATURE_PANEL_REGISTRY.length,
    missingGroups: [],
  };
}
