import { repositories } from '../../database/repositories/dexieRepositories';
import { isValidDateOnly, secondsToDecimalHours } from '../../domain/calculations/dates';
import { addMoney, subtractMoney } from '../../domain/calculations/money';
import { calculateInvoiceAging } from '../../services/businessHealthService';
import { searchKnowledgeBase } from '../knowledge/knowledgeService';
import { isAllowlistedTool } from './permissions';
import {
  analyzeInvoiceAgingArgsSchema,
  createClientDraftArgsSchema,
  createProjectDraftArgsSchema,
  createProposalDraftArgsSchema,
  createTaskDraftArgsSchema,
  explainInvoiceArgsSchema,
  explainProjectProfitabilityArgsSchema,
  getWorkspaceSummaryArgsSchema,
  listOverdueInvoicesArgsSchema,
  searchClientsArgsSchema,
  searchKnowledgeArgsSchema,
  searchProjectsArgsSchema,
  searchTasksArgsSchema,
  suggestExpenseCategoryArgsSchema,
  summarizeBusinessReportArgsSchema,
  type CopilotToolName,
} from './schemas';

export interface ToolExecutionResult {
  tool: CopilotToolName;
  ok: boolean;
  summary: string;
  data: unknown;
}

const EXPENSE_CATEGORY_RULES: Array<{ category: string; keywords: string[] }> = [
  { category: 'Software & Subscriptions', keywords: ['saas', 'figma', 'adobe', 'github', 'license', 'subscription', 'notion', 'slack', 'software'] },
  { category: 'Hosting & Cloud', keywords: ['aws', 'vercel', 'netlify', 'cloudflare', 'domain', 'dns', 'server', 'hosting', 'cloud'] },
  { category: 'Hardware & Equipment', keywords: ['laptop', 'monitor', 'keyboard', 'mouse', 'ssd', 'desk', 'chair', 'camera', 'mic'] },
  { category: 'Marketing & Outreach', keywords: ['ads', 'marketing', 'sponsor', 'portfolio', 'seo', 'promo'] },
  { category: 'Subcontractors & Collaborators', keywords: ['contractor', 'freelancer', 'subcontract', 'illustrator', 'qa', 'editor'] },
  { category: 'Travel & Meetings', keywords: ['uber', 'flight', 'train', 'hotel', 'coffee', 'travel', 'fuel', 'parking'] },
  { category: 'Office & Utilities', keywords: ['internet', 'wifi', 'electricity', 'phone', 'coworking', 'rent', 'stationery'] },
  { category: 'Bank & Payment Fees', keywords: ['wire', 'transfer', 'fee', 'stripe', 'paypal', 'wise', 'payoneer', 'fx'] },
];

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

    case 'search_projects': {
      const { query } = searchProjectsArgsSchema.parse(rawArgs);
      const q = query.toLowerCase();
      const projects = await repositories.listProjects();
      const matches = projects
        .filter(
          (p) =>
            !q ||
            p.name.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            p.status.toLowerCase().includes(q)
        )
        .slice(0, 10)
        .map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          budget: p.budget,
          currency: p.currency,
          progress: p.progress,
          dueDate: p.dueDate,
        }));
      return {
        tool: toolName,
        ok: true,
        summary: `Found ${matches.length} project(s)${query ? ` matching "${query}"` : ''}.`,
        data: matches,
      };
    }

    case 'search_tasks': {
      const { query, onlyOpen } = searchTasksArgsSchema.parse(rawArgs);
      const q = query.toLowerCase();
      const tasks = await repositories.listTasks();
      const matches = tasks
        .filter((t) => (!onlyOpen || (t.status !== 'done' && t.status !== 'archived')))
        .filter((t) => !q || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
        .slice(0, 12)
        .map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          projectId: t.projectId,
        }));
      return {
        tool: toolName,
        ok: true,
        summary: `Found ${matches.length} ${onlyOpen ? 'open ' : ''}task(s).`,
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

    case 'explain_invoice': {
      const { invoiceIdOrNumber } = explainInvoiceArgsSchema.parse(rawArgs);
      const [invoices, clients, payments] = await Promise.all([
        repositories.listInvoices(),
        repositories.listClients(),
        repositories.listPayments(),
      ]);
      const needle = invoiceIdOrNumber.toLowerCase();
      const invoice = invoices.find(
        (i) => i.id.toLowerCase() === needle || i.number.toLowerCase() === needle
      );
      if (!invoice) {
        return {
          tool: toolName,
          ok: false,
          summary: `No invoice matched "${invoiceIdOrNumber}".`,
          data: null,
        };
      }
      const clientName = clients.find((c) => c.id === invoice.clientId)?.name ?? 'Unknown client';
      const invPayments = payments.filter((p) => p.invoiceId === invoice.id);
      const summary = `Invoice ${invoice.number} (${clientName}, status: ${invoice.status}): Subtotal ${invoice.currency} ${invoice.subtotal.toFixed(2)}, discount -${invoice.discountAmount.toFixed(2)}, tax +${invoice.taxAmount.toFixed(2)} (${invoice.taxRate}%${invoice.taxInclusive ? ' inclusive' : ''}), total ${invoice.total.toFixed(2)}. Paid ${invoice.amountPaid.toFixed(2)} across ${invPayments.length} payment(s); balance due ${invoice.balanceDue.toFixed(2)} (due ${invoice.dueDate}).`;
      return {
        tool: toolName,
        ok: true,
        summary,
        data: {
          invoiceNumber: invoice.number,
          clientName,
          status: invoice.status,
          subtotal: invoice.subtotal,
          discountAmount: invoice.discountAmount,
          taxAmount: invoice.taxAmount,
          total: invoice.total,
          amountPaid: invoice.amountPaid,
          balanceDue: invoice.balanceDue,
          paymentCount: invPayments.length,
        },
      };
    }

    case 'explain_project_profitability': {
      const { projectId } = explainProjectProfitabilityArgsSchema.parse(rawArgs);
      const [project, financeEntries, timeEntries] = await Promise.all([
        repositories.getProject(projectId),
        repositories.listFinanceEntries(),
        repositories.listTimeEntries(),
      ]);
      if (!project) {
        return {
          tool: toolName,
          ok: false,
          summary: `Project "${projectId}" was not found.`,
          data: null,
        };
      }
      const prjFinance = financeEntries.filter((f) => f.projectId === projectId);
      const income = addMoney(...prjFinance.filter((f) => f.type === 'income').map((f) => f.amount));
      const expenses = addMoney(...prjFinance.filter((f) => f.type === 'expense').map((f) => f.amount));
      const estimatedNet = subtractMoney(income, expenses);
      const prjSeconds = timeEntries
        .filter((t) => t.projectId === projectId)
        .reduce((s, t) => s + t.durationSeconds, 0);
      const hours = secondsToDecimalHours(prjSeconds);
      const effectiveHourly = hours > 0 ? Number((estimatedNet / hours).toFixed(2)) : null;

      const summary = `Project "${project.name}" (${project.status}): Recorded income ${project.currency} ${income.toFixed(2)} minus expenses ${expenses.toFixed(2)} = estimated net ${estimatedNet.toFixed(2)} (informational estimate). Logged time: ${hours.toFixed(2)}h${effectiveHourly !== null ? ` (~${project.currency} ${effectiveHourly}/hr effective)` : ''}.`;
      return {
        tool: toolName,
        ok: true,
        summary,
        data: {
          projectName: project.name,
          currency: project.currency,
          income,
          expenses,
          estimatedNet,
          loggedHours: Number(hours.toFixed(2)),
          effectiveHourly,
        },
      };
    }

    case 'suggest_expense_category': {
      const { description } = suggestExpenseCategoryArgsSchema.parse(rawArgs);
      const lower = description.toLowerCase();
      const matched = EXPENSE_CATEGORY_RULES.find((rule) =>
        rule.keywords.some((kw) => lower.includes(kw))
      );
      const category = matched?.category ?? 'General Business Expense';
      return {
        tool: toolName,
        ok: true,
        summary: `Suggested category for "${description}": ${category}.`,
        data: { description, suggestedCategory: category, confidence: matched ? 'keyword-match' : 'default' },
      };
    }

    case 'summarize_business_report': {
      const { monthPrefix } = summarizeBusinessReportArgsSchema.parse(rawArgs);
      const [financeEntries, invoices, settings] = await Promise.all([
        repositories.listFinanceEntries(),
        repositories.listInvoices(),
        repositories.getSettings(),
      ]);
      const scoped = monthPrefix
        ? financeEntries.filter((f) => f.date.startsWith(monthPrefix))
        : financeEntries;
      const income = addMoney(...scoped.filter((f) => f.type === 'income').map((f) => f.amount));
      const expenses = addMoney(...scoped.filter((f) => f.type === 'expense').map((f) => f.amount));
      const net = subtractMoney(income, expenses);
      const openReceivables = addMoney(
        ...invoices
          .filter((i) => i.status !== 'cancelled' && i.balanceDue > 0)
          .map((i) => i.balanceDue)
      );
      const label = monthPrefix || 'All Recorded Periods';
      const summary = `Business summary (${label}): Income ${settings.defaultCurrency} ${income.toFixed(2)}, Expenses ${expenses.toFixed(2)}, Estimated Net ${net.toFixed(2)}, Open Receivables ${openReceivables.toFixed(2)} (informational estimate, not certified accounting).`;
      return {
        tool: toolName,
        ok: true,
        summary,
        data: { period: label, currency: settings.defaultCurrency, income, expenses, estimatedNet: net, openReceivables },
      };
    }

    case 'analyze_invoice_aging': {
      analyzeInvoiceAgingArgsSchema.parse(rawArgs);
      const invoices = await repositories.listInvoices();
      const aging = calculateInvoiceAging(invoices);
      const summary = `Open invoices (${aging.openInvoiceCount}): Current ${aging.buckets[0].totalBalance.toFixed(2)}, 1-30d overdue ${aging.buckets[1].totalBalance.toFixed(2)}, 31-60d overdue ${aging.buckets[2].totalBalance.toFixed(2)}, 61+d overdue ${aging.buckets[3].totalBalance.toFixed(2)}.`;
      return {
        tool: toolName,
        ok: true,
        summary,
        data: aging,
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

    case 'create_project_draft': {
      const args = createProjectDraftArgsSchema.parse(rawArgs);
      const created = await repositories.createProject({
        clientId: args.clientId,
        name: args.name,
        description: args.description,
        status: 'planning',
        priority: 'medium',
        startDate: '',
        dueDate: '',
        budget: args.budget,
        agreedValue: args.budget,
        currency: args.currency,
        hourlyRate: (await repositories.getSettings()).defaultHourlyRate,
        progress: 0,
        milestones: [],
        notes: 'Draft created via Copilot approval gate.',
        isDemo: false,
      });
      return {
        tool: toolName,
        ok: true,
        summary: `Created planning project "${created.name}".`,
        data: created,
      };
    }

    case 'create_proposal_draft': {
      const args = createProposalDraftArgsSchema.parse(rawArgs);
      const created = await repositories.createProposal({
        clientId: args.clientId,
        projectId: '',
        title: args.title,
        overview: args.overview,
        scopeOfWork: '',
        deliverables: args.deliverables,
        timeline: '4 Weeks',
        pricingAmount: args.pricingAmount,
        currency: args.currency,
        terms: '40% kickoff deposit, 60% on final delivery.',
        validUntil: '',
        status: 'draft',
        isDemo: false,
      });
      return {
        tool: toolName,
        ok: true,
        summary: `Created draft proposal ${created.number} ("${created.title}").`,
        data: created,
      };
    }
  }
}
