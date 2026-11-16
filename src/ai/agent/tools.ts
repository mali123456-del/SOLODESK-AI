import { repositories } from '../../database/repositories/dexieRepositories';
import { isValidDateOnly } from '../../domain/calculations/dates';
import { addMoney } from '../../domain/calculations/money';
import { searchKnowledgeBase } from '../knowledge/knowledgeService';
import { isAllowlistedTool } from './permissions';
import {
  createClientDraftArgsSchema,
  createTaskDraftArgsSchema,
  getWorkspaceSummaryArgsSchema,
  listOverdueInvoicesArgsSchema,
  searchClientsArgsSchema,
  searchKnowledgeArgsSchema,
  type CopilotToolName,
} from './schemas';

export interface ToolExecutionResult {
  tool: CopilotToolName;
  ok: boolean;
  summary: string;
  data: unknown;
}

export async function executeAllowlistedTool(
  toolName: string,
  rawArgs: Record<string, unknown> = {}
): Promise<ToolExecutionResult> {
  if (!isAllowlistedTool(toolName)) {
    throw new Error(`Tool "${toolName}" is not allowlisted.`);
  }

  switch (toolName) {
    case 'get_workspace_summary': {
      getWorkspaceSummaryArgsSchema.parse(rawArgs);
      const [clients, projects, tasks, invoices, settings] = await Promise.all([
        repositories.listClients(),
        repositories.listProjects(),
        repositories.listTasks(),
        repositories.listInvoices(),
        repositories.getSettings(),
      ]);
      const activeClients = clients.filter((c) => c.status !== 'archived').length;
      const activeProjects = projects.filter((p) => p.status === 'active').length;
      const openTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'archived').length;
      const unpaidInvoices = invoices.filter(
        (i) => i.status === 'sent' || i.status === 'partially_paid' || i.status === 'overdue'
      );
      const pendingBalance = addMoney(...unpaidInvoices.map((i) => i.balanceDue));
      const summary = `Workspace has ${activeClients} active client(s), ${activeProjects} active project(s), ${openTasks} open task(s), and ${unpaidInvoices.length} unpaid invoice(s) totaling ${settings.defaultCurrency} ${pendingBalance.toFixed(2)}.`;
      return {
        tool: toolName,
        ok: true,
        summary,
        data: {
          activeClients,
          activeProjects,
          openTasks,
          unpaidInvoiceCount: unpaidInvoices.length,
          pendingBalance,
          currency: settings.defaultCurrency,
        },
      };
    }

    case 'search_clients': {
      const { query } = searchClientsArgsSchema.parse(rawArgs);
      const q = query.toLowerCase();
      const clients = await repositories.listClients();
      const matches = clients
        .filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.company.toLowerCase().includes(q) ||
            c.email.toLowerCase().includes(q)
        )
        .slice(0, 8)
        .map((c) => ({
          id: c.id,
          name: c.name,
          company: c.company,
          email: c.email,
          status: c.status,
        }));
      return {
        tool: toolName,
        ok: true,
        summary: `Found ${matches.length} client match(es) for "${query}".`,
        data: matches,
      };
    }

    case 'list_overdue_invoices': {
      const { limit } = listOverdueInvoicesArgsSchema.parse(rawArgs);
      const [invoices, clients] = await Promise.all([
        repositories.listInvoices(),
        repositories.listClients(),
      ]);
      const clientMap = new Map(clients.map((c) => [c.id, c.name]));
      const overdue = invoices
        .filter((i) => i.status === 'overdue')
        .slice(0, limit)
        .map((i) => ({
          id: i.id,
          number: i.number,
          clientName: clientMap.get(i.clientId) ?? 'Unknown client',
          dueDate: i.dueDate,
          currency: i.currency,
          balanceDue: i.balanceDue,
        }));
      return {
        tool: toolName,
        ok: true,
        summary: `Found ${overdue.length} overdue invoice(s).`,
        data: overdue,
      };
    }

    case 'search_knowledge': {
      const { query, topK } = searchKnowledgeArgsSchema.parse(rawArgs);
      const result = await searchKnowledgeBase(query, topK);
      return {
        tool: toolName,
        ok: true,
        summary: `Retrieved ${result.citations.length} knowledge citation(s).`,
        data: result.citations,
      };
    }

    case 'create_task_draft': {
      const args = createTaskDraftArgsSchema.parse(rawArgs);
      const created = await repositories.createTask({
        title: args.title,
        description: args.description,
        priority: args.priority,
        dueDate: args.dueDate && isValidDateOnly(args.dueDate) ? args.dueDate : '',
        projectId: args.projectId,
        clientId: '',
        status: 'todo',
        tags: ['ai-draft'],
        subtasks: [],
        completedAt: '',
        isDemo: false,
      });
      return {
        tool: toolName,
        ok: true,
        summary: `Created task "${created.title}".`,
        data: created,
      };
    }

    case 'create_client_draft': {
      const args = createClientDraftArgsSchema.parse(rawArgs);
      const created = await repositories.createClient({
        name: args.name,
        company: args.company,
        email: args.email,
        phone: '',
        website: '',
        location: '',
        status: 'lead',
        category: 'General',
        tags: ['ai-draft'],
        notes: args.notes,
        isDemo: false,
      });
      return {
        tool: toolName,
        ok: true,
        summary: `Created lead client "${created.name}".`,
        data: created,
      };
    }
  }
}
