import { z } from 'zod';
import { priorityEnum } from '../../domain/schemas/entities';

export const copilotToolNameSchema = z.enum([
  'get_workspace_summary',
  'search_clients',
  'search_projects',
  'search_tasks',
  'list_overdue_invoices',
  'search_knowledge',
  'explain_invoice',
  'explain_project_profitability',
  'suggest_expense_category',
  'summarize_business_report',
  'analyze_invoice_aging',
  'prioritize_open_tasks',
  'analyze_csv_dataset',
  'create_task_draft',
  'create_client_draft',
  'create_project_draft',
  'create_proposal_draft',
]);

export type CopilotToolName = z.infer<typeof copilotToolNameSchema>;

export const getWorkspaceSummaryArgsSchema = z.object({});

export const searchClientsArgsSchema = z.object({
  query: z.string().trim().min(1).max(100),
});

export const searchProjectsArgsSchema = z.object({
  query: z.string().trim().max(100).optional().default(''),
});

export const searchTasksArgsSchema = z.object({
  query: z.string().trim().max(100).optional().default(''),
  onlyOpen: z.boolean().optional().default(true),
});

export const listOverdueInvoicesArgsSchema = z.object({
  limit: z.number().int().min(1).max(20).optional().default(10),
});

export const searchKnowledgeArgsSchema = z.object({
  query: z.string().trim().min(1).max(200),
  topK: z.number().int().min(1).max(8).optional().default(4),
});

export const explainInvoiceArgsSchema = z.object({
  invoiceIdOrNumber: z.string().trim().min(1).max(80),
});

export const explainProjectProfitabilityArgsSchema = z.object({
  projectId: z.string().trim().min(1).max(80),
});

export const suggestExpenseCategoryArgsSchema = z.object({
  description: z.string().trim().min(1).max(240),
});

export const summarizeBusinessReportArgsSchema = z.object({
  monthPrefix: z.string().trim().max(7).optional().default(''),
});

export const analyzeInvoiceAgingArgsSchema = z.object({});

export const prioritizeOpenTasksArgsSchema = z.object({
  limit: z.number().int().min(1).max(20).optional().default(8),
});

export const analyzeCsvDatasetArgsSchema = z.object({
  csvText: z.string().trim().min(1).max(100_000),
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

export const createProjectDraftArgsSchema = z.object({
  clientId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional().default(''),
  budget: z.number().finite().min(0).optional().default(0),
  currency: z.string().min(3).max(5).optional().default('USD'),
});

export const createProposalDraftArgsSchema = z.object({
  clientId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(200),
  overview: z.string().trim().max(4000).optional().default(''),
  pricingAmount: z.number().finite().min(0).optional().default(0),
  currency: z.string().min(3).max(5).optional().default('USD'),
  deliverables: z.array(z.string().trim().min(1)).optional().default([]),
});

export const proposedActionSchema = z.object({
  id: z.string().min(1),
  tool: copilotToolNameSchema,
  title: z.string().min(1).max(140),
  summary: z.string().min(1).max(300),
  args: z.record(z.string(), z.unknown()),
});

export type ProposedAgentAction = z.infer<typeof proposedActionSchema>;
