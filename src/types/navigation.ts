export type AppRouteId =
  | 'dashboard'
  | 'activity'
  | 'notifications'
  | 'clients'
  | 'projects'
  | 'tasks'
  | 'time-tracker'
  | 'proposals'
  | 'quotations'
  | 'contracts'
  | 'invoices'
  | 'payments'
  | 'income'
  | 'expenses'
  | 'profitability'
  | 'reports'
  | 'ai-copilot'
  | 'knowledge'
  | 'templates'
  | 'search'
  | 'import-export'
  | 'settings-profile'
  | 'settings-appearance'
  | 'settings-localization'
  | 'settings-ai'
  | 'settings-backup'
  | 'settings-privacy'
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
    description: 'Live revenue, expenses, active projects, deadlines, and recent work.',
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
    description: 'Due invoices, overdue tasks, backup reminders, and workspace alerts.',
  },
  // Workspace
  {
    id: 'clients',
    label: 'Clients',
    group: 'Workspace',
    description: 'Client CRM, contact records, notes, tags, and linked projects.',
  },
  {
    id: 'projects',
    label: 'Projects',
    group: 'Workspace',
    description: 'Project scope, budgets, milestones, deadlines, and delivery progress.',
  },
  {
    id: 'tasks',
    label: 'Tasks',
    group: 'Workspace',
    description: 'List and Kanban task boards, subtasks, priorities, and overdue tracking.',
  },
  {
    id: 'time-tracker',
    label: 'Time Tracker',
    group: 'Workspace',
    description: 'Persistent timer, manual logs, billable hours, and timesheets.',
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
    description: 'Invoice studio with unique numbering, taxes, discounts, and PDF/print.',
  },
  {
    id: 'payments',
    label: 'Payments',
    group: 'Business Documents',
    description: 'Record manual and partial payments and track outstanding balances.',
  },
  // Finance
  {
    id: 'income',
    label: 'Income',
    group: 'Finance',
    description: 'Recorded earnings, linked client income, and CSV export.',
  },
  {
    id: 'expenses',
    label: 'Expenses',
    group: 'Finance',
    description: 'Track business expenses by category, project, and date.',
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
    description: 'Date-filtered financial analytics, invoice aging, and CSV/PDF reports.',
  },
  // Intelligence
  {
    id: 'ai-copilot',
    label: 'AI Copilot',
    group: 'Intelligence',
    description: 'Optional Gemini 4 Hydrogen assistant with approval-gated tools.',
  },
  {
    id: 'knowledge',
    label: 'Knowledge Hub',
    group: 'Intelligence',
    description: 'Local-first document library, chunk indexing, and cited search.',
  },
  {
    id: 'templates',
    label: 'Templates',
    group: 'Intelligence',
    description: 'Reusable templates for proposals, contracts, and client emails.',
  },
  // Productivity
  {
    id: 'search',
    label: 'Global Search',
    group: 'Productivity',
    description: 'Search across clients, projects, tasks, documents, and knowledge.',
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
    description: 'Light/dark theme and layout preferences.',
  },
  {
    id: 'settings-localization',
    label: 'Currency & Localization',
    group: 'Settings',
    description: 'Default currency (PKR, USD, EUR, GBP, etc.) and date formatting.',
  },
  {
    id: 'settings-ai',
    label: 'AI Configuration',
    group: 'Settings',
    description: 'Optional in-memory Gemini 4 Hydrogen BYOK configuration & privacy.',
  },
  {
    id: 'settings-backup',
    label: 'Backup & Restore',
    group: 'Settings',
    description: 'Versioned JSON backups, conflict preview, and AES-GCM encryption.',
  },
  {
    id: 'settings-privacy',
    label: 'Privacy & Security',
    group: 'Settings',
    description: 'Local storage transparency, persistence status, and data controls.',
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
