import { z } from 'zod';
import { priorityEnum } from '../../domain/schemas/entities';

export const copilotToolNameSchema = z.enum([
  'get_workspace_summary',
  'search_clients',
  'list_overdue_invoices',
  'search_knowledge',
  'create_task_draft',
  'create_client_draft',
]);

export type CopilotToolName = z.infer<typeof copilotToolNameSchema>;

export const getWorkspaceSummaryArgsSchema = z.object({});

export const searchClientsArgsSchema = z.object({
  query: z.string().trim().min(1).max(100),
});

export const listOverdueInvoicesArgsSchema = z.object({
  limit: z.number().int().min(1).max(20).optional().default(10),
});

export const searchKnowledgeArgsSchema = z.object({
  query: z.string().trim().min(1).max(200),
  topK: z.number().int().min(1).max(8).optional().default(4),
});

export const createTaskDraftArgsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1500).optional().default(''),
  priority: priorityEnum.optional().default('medium'),
  dueDate: z.string().optional().default(''),
  projectId: z.string().optional().default(''),
});

export const createClientDraftArgsSchema = z.object({
  name: z.string().trim().min(1).max(140),
  company: z.string().trim().max(140).optional().default(''),
  email: z.string().trim().max(160).optional().default(''),
  notes: z.string().trim().max(1500).optional().default(''),
});

export const proposedActionSchema = z.object({
  id: z.string().min(1),
  tool: copilotToolNameSchema,
  title: z.string().min(1).max(140),
  summary: z.string().min(1).max(300),
  args: z.record(z.string(), z.unknown()),
});

export type ProposedAgentAction = z.infer<typeof proposedActionSchema>;
