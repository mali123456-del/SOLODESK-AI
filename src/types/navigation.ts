export type AppRouteId =
  | 'dashboard'
  | 'focus-mode'
  | 'activity'
  | 'notifications'
  | 'clients'
  | 'client-portal'
  | 'projects'
  | 'tasks'
  | 'time-tracker'
  | 'communication'
  | 'proposals'
  | 'quotations'
  | 'contracts'
  | 'invoices'
  | 'payments'
  | 'vault'
  | 'income'
  | 'expenses'
  | 'profitability'
  | 'reports'
  | 'ai-copilot'
  | 'knowledge'
  | 'templates'
  | 'workflows'
  | 'cloud-sync'
  | 'search'
  | 'import-export'
  | 'settings-profile'
  | 'settings-appearance'
  | 'settings-localization'
  | 'settings-ai'
  | 'settings-backup'
  | 'settings-privacy'
  | 'settings-cloud-sync'
  | 'security-center'
  | 'help-plans'
  | 'about'
  | 'marketing';

export interface NavItemConfig {
  id: AppRouteId;
  label: string;
  group:
    | 'Overview'
    | 'Workspace'
    | 'Business Documents'
    | 'Finance'
    | 'Intelligence'
    | 'Productivity'
    | 'Settings';
  description: string;
}

export const APP_NAVIGATION: NavItemConfig[] = [
  // Overview
  {
    id: 'dashboard',
    label: 'Dashboard',
    group: 'Overview',
    description: 'Daily Digest, live revenue, expenses, active projects, deadlines, and recent work.',
  },
  {
    id: 'focus-mode',
    label: 'Focus Mode',
    group: 'Overview',
    description: 'Distraction-free single project or task view with live timer and subtasks.',
  },
  {
    id: 'activity',
    label: 'Activity',
    group: 'Overview',
    description: 'Chronological audit log of workspace events across clients and documents.',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    group: 'Overview',
    description: 'Due invoices, overdue tasks, snoozed reminders, and workspace alerts.',
  },
  // Workspace
  {
    id: 'clients',
    label: 'Clients',
    group: 'Workspace',
    description: 'Client CRM, contact records, notes, tags, and linked projects.',
  },
  {
    id: 'client-portal',
    label: 'Client Portal',
    group: 'Workspace',
    description: 'Scoped client share links, lead capture forms, onboarding, approvals, and surveys.',
  },
  {
    id: 'projects',
    label: 'Projects',
    group: 'Workspace',
    description: 'Project scope, Gantt timeline, risks, OKRs, templates, and milestones.',
  },
  {
    id: 'tasks',
    label: 'Tasks',
    group: 'Workspace',
    description: 'List and Kanban boards, dependencies, critical path, and recurring tasks.',
  },
  {
    id: 'time-tracker',
    label: 'Time Tracker',
    group: 'Workspace',
    description: 'Persistent timer, manual logs, billable hours, and timesheets.',
  },
  {
    id: 'communication',
    label: 'Schedule & Inbox',
    group: 'Workspace',
    description: 'Unified outreach queue, appointments, booking links, and conflict detection.',
  },
  // Business Documents
  {
    id: 'proposals',
    label: 'Proposals',
    group: 'Business Documents',
    description: 'Create reusable client proposals with deliverables and PDF export.',
  },
  {
    id: 'quotations',
    label: 'Quotations',
    group: 'Business Documents',
    description: 'Build priced estimates and convert accepted quotes into invoices.',
  },
  {
    id: 'contracts',
    label: 'Contracts',
    group: 'Business Documents',
    description: 'Editable agreement templates with client/project details and PDF export.',
  },
  {
    id: 'invoices',
    label: 'Invoices',
    group: 'Business Documents',
    description: 'Invoice studio with recurring schedules, FX currency, installments, and PDF.',
  },
  {
    id: 'payments',
    label: 'Payments',
    group: 'Business Documents',
    description: 'Record manual and partial payments and track outstanding balances.',
  },
  {
    id: 'vault',
    label: 'Document Vault',
    group: 'Business Documents',
    description: 'Validated file vault with folders, magic-byte checks, versions, and approvals.',
  },
  // Finance
  {
    id: 'income',
    label: 'Income',
    group: 'Finance',
    description: 'Recorded earnings, retainers, linked client income, and CSV export.',
  },
  {
    id: 'expenses',
    label: 'Expenses',
    group: 'Finance',
    description: 'Track business expenses, receipt attachments, and tax profiles.',
  },
  {
    id: 'profitability',
    label: 'Profitability',
    group: 'Finance',
    description: 'Project and client profitability, net profit, and hourly yield.',
  },
  {
    id: 'reports',
    label: 'Financial Reports',
    group: 'Finance',
    description: 'AR aging, cashflow forecasts, what-if modeling, and estimates vs actuals.',
  },
  // Intelligence
  {
    id: 'ai-copilot',
    label: 'AI Copilot',
    group: 'Intelligence',
    description: 'Gemini, OpenAI-compatible, or local Ollama assistant with approval-gated tools.',
  },
  {
    id: 'knowledge',
    label: 'Knowledge Hub',
    group: 'Intelligence',
    description: 'Hybrid keyword + semantic vector RAG library, URL importer, and 25-case eval.',
  },
  {
    id: 'templates',
    label: 'Templates & Services',
    group: 'Intelligence',
    description: 'Reusable templates for proposals, contracts, emails, and your service catalog.',
  },
  // Productivity
  {
    id: 'workflows',
    label: 'Automation & Webhooks',
    group: 'Productivity',
    description: 'Visual trigger-condition-action workflow builder, webhooks, and retry logs.',
  },
  {
    id: 'cloud-sync',
    label: 'Sync & Multi-Role',
    group: 'Productivity',
    description: 'Offline sync outbox queue, conflict resolution, and workspace RBAC matrix.',
  },
  {
    id: 'search',
    label: 'Global Search',
    group: 'Productivity',
    description: 'Search across clients, projects, tasks, documents, vault, and knowledge.',
  },
  {
    id: 'import-export',
    label: 'Import & Export',
    group: 'Productivity',
    description: 'CSV client/finance import & export plus JSON backups.',
  },
  // Settings
  {
    id: 'settings-profile',
    label: 'Business Profile',
    group: 'Settings',
    description: 'Your business name, address, tax label, and invoice footer.',
  },
  {
    id: 'settings-appearance',
    label: 'Appearance',
    group: 'Settings',
    description: 'Light/dark theme, accent colors, and layout preferences.',
  },
  {
    id: 'settings-localization',
    label: 'Currency, Tax & RTL',
    group: 'Settings',
    description: 'Multi-currency FX rates, tax profiles, language packs, and RTL layout.',
  },
  {
    id: 'settings-ai',
    label: 'AI Configuration',
    group: 'Settings',
    description: 'In-memory Gemini, OpenAI-compatible, and local Ollama adapter configuration.',
  },
  {
    id: 'settings-backup',
    label: 'Backup & Restore',
    group: 'Settings',
    description: 'Versioned JSON backups, conflict preview, and AES-GCM encryption.',
  },
  {
    id: 'settings-privacy',
    label: 'Privacy & Diagnostics',
    group: 'Settings',
    description: 'Local storage transparency, persistence status, and DB health diagnostics.',
  },
  {
    id: 'settings-cloud-sync',
    label: 'Cloud Sync',
    group: 'Settings',
    description: 'Configure Auto-sync background behavior, offline queue pause/resume, and sync checkpoints.',
  },
  {
    id: 'security-center',
    label: 'Security Center',
    group: 'Settings',
    description: 'Security audit trail, backup recovery self-test, retention, and RBAC audit.',
  },
  {
    id: 'help-plans',
    label: 'Help, Tour & Plans',
    group: 'Settings',
    description: 'Product tour, user help center, and configurable workspace plan entitlements.',
  },
  {
    id: 'about',
    label: 'About SOLODESK AI',
    group: 'Settings',
    description: 'Product overview, documentation, pricing structure, and release info.',
  },
];

export const NAV_GROUPS: Array<NavItemConfig['group']> = [
  'Overview',
  'Workspace',
  'Business Documents',
  'Finance',
  'Intelligence',
  'Productivity',
  'Settings',
];
