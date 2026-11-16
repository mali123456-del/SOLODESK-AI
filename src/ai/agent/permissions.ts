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
};

export function isAllowlistedTool(name: string): name is CopilotToolName {
  return Object.prototype.hasOwnProperty.call(TOOL_PERMISSION_POLICIES, name);
}

export function requiresUserApproval(name: CopilotToolName): boolean {
  return TOOL_PERMISSION_POLICIES[name].requireApproval;
}
