import type { CopilotToolName } from './schemas';

export interface ToolPermissionPolicy {
  name: CopilotToolName;
  access: 'read' | 'write';
  requireApproval: boolean;
  description: string;
}

export const TOOL_PERMISSION_POLICIES: Record<CopilotToolName, ToolPermissionPolicy> = {
  get_workspace_summary: {
    name: 'get_workspace_summary',
    access: 'read',
    requireApproval: false,
    description: 'Read verified client, project, task, and invoice counts from IndexedDB.',
  },
  search_clients: {
    name: 'search_clients',
    access: 'read',
    requireApproval: false,
    description: 'Search local client records by name, company, or email.',
  },
  search_projects: {
    name: 'search_projects',
    access: 'read',
    requireApproval: false,
    description: 'Search local project records by name, status, or description.',
  },
  search_tasks: {
    name: 'search_tasks',
    access: 'read',
    requireApproval: false,
    description: 'Search local tasks and overdue backlog items.',
  },
  list_overdue_invoices: {
    name: 'list_overdue_invoices',
    access: 'read',
    requireApproval: false,
    description: 'List currently overdue invoices with balances due.',
  },
  search_knowledge: {
    name: 'search_knowledge',
    access: 'read',
    requireApproval: false,
    description: 'Retrieve relevant chunks from the local Knowledge Hub.',
  },
  explain_invoice: {
    name: 'explain_invoice',
    access: 'read',
    requireApproval: false,
    description: 'Break down line items, tax, discounts, payments, and balance due for a real invoice.',
  },
  explain_project_profitability: {
    name: 'explain_project_profitability',
    access: 'read',
    requireApproval: false,
    description: 'Compute income, expenses, tracked hours, and estimated profit for a real project.',
  },
  suggest_expense_category: {
    name: 'suggest_expense_category',
    access: 'read',
    requireApproval: false,
    description: 'Suggest a standard freelance expense category from a description.',
  },
  summarize_business_report: {
    name: 'summarize_business_report',
    access: 'read',
    requireApproval: false,
    description: 'Summarize verified income, expenses, net estimate, and unpaid receivables.',
  },
  analyze_invoice_aging: {
    name: 'analyze_invoice_aging',
    access: 'read',
    requireApproval: false,
    description: 'Group open invoice balances into Current, 1-30d, 31-60d, and 61+ day aging buckets.',
  },
  create_task_draft: {
    name: 'create_task_draft',
    access: 'write',
    requireApproval: true,
    description: 'Create a new task record in the local workspace after explicit user approval.',
  },
  create_client_draft: {
    name: 'create_client_draft',
    access: 'write',
    requireApproval: true,
    description: 'Create a new client record in the local workspace after explicit user approval.',
  },
  create_project_draft: {
    name: 'create_project_draft',
    access: 'write',
    requireApproval: true,
    description: 'Create a new planning project record linked to a client after explicit user approval.',
  },
  create_proposal_draft: {
    name: 'create_proposal_draft',
    access: 'write',
    requireApproval: true,
    description: 'Create a new draft proposal linked to a client after explicit user approval.',
  },
};

export function isAllowlistedTool(name: string): name is CopilotToolName {
  return Object.prototype.hasOwnProperty.call(TOOL_PERMISSION_POLICIES, name);
}

export function requiresUserApproval(name: CopilotToolName): boolean {
  return TOOL_PERMISSION_POLICIES[name].requireApproval;
}
