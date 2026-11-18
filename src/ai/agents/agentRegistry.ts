import { createId } from '../../domain/schemas/entities';
import { repositories } from '../../database/repositories/dexieRepositories';
import { wrapUntrustedContextSnippet } from '../../security/sanitize';
import { validateProposedAction } from '../agent/actionApproval';
import { TOOL_PERMISSION_POLICIES } from '../agent/permissions';
import type { CopilotToolName, ProposedAgentAction } from '../agent/schemas';
import { COPILOT_SYSTEM_INSTRUCTION } from '../agent/systemInstructions';
import { executeAllowlistedTool } from '../agent/tools';
import { searchKnowledgeBase } from '../knowledge/knowledgeService';
import type { AIProviderId } from '../providers/AIProvider';
import { createAIProvider } from '../providers/providerFactory';
import type { KnowledgeCitation } from '../rag/citations';

export type AgentAutonomyClass = 'read_only' | 'draft_only' | 'approval_required';

export type AgentRunStatus = 'pending' | 'running' | 'completed' | 'cancelled' | 'failed';

export type AgentId =
  | 'workspace_analyst'
  | 'knowledge_researcher'
  | 'financial_intelligence'
  | 'schedule_dependency_auditor'
  | 'client_relationship_analyst'
  | 'security_compliance_auditor'
  | 'bi_narrative_summarizer'
  | 'proposal_drafter'
  | 'quotation_pricing_drafter'
  | 'contract_clause_drafter'
  | 'client_outreach_agent'
  | 'task_sprint_planner'
  | 'executive_digest_writer'
  | 'workflow_action_proposer'
  | 'solodesk_orchestrator';

export interface AgentDefinition {
  id: AgentId;
  name: string;
  autonomyClass: AgentAutonomyClass;
  roleSummary: string;
  systemGuidance: string;
  allowedTools: CopilotToolName[];
  canDelegateTo?: AgentId[];
  canEmitProposedActions: boolean;
}

export interface AgentRunResult {
  runId: string;
  agentId: AgentId;
  agentName: string;
  autonomyClass: AgentAutonomyClass;
  status: AgentRunStatus;
  goal: string;
  outputText: string;
  model: string;
  providerId: AIProviderId;
  isOfflineDraft: boolean;
  citations: KnowledgeCitation[];
  toolsInvoked: CopilotToolName[];
  delegatedAgents: AgentId[];
  proposedActions: ProposedAgentAction[];
  durationMs: number;
  estimatedTokens: number;
  startedAt: string;
  finishedAt: string;
  errorMessage?: string;
}

export const AGENT_WORKFORCE_REGISTRY: AgentDefinition[] = [
  // Class 1 — Read-only (7 agents)
  {
    id: 'workspace_analyst',
    name: 'Workspace Analyst Agent',
    autonomyClass: 'read_only',
    roleSummary: 'Audits active clients, projects, tasks, and delivery workload without modifying records.',
    systemGuidance:
      'Summarize real workspace counts, highlight open blockers and high-priority tasks, and stay strictly grounded in verified tool output.',
    allowedTools: [
      'get_workspace_summary',
      'search_clients',
      'search_projects',
      'search_tasks',
      'prioritize_open_tasks',
    ],
    canEmitProposedActions: false,
  },
  {
    id: 'knowledge_researcher',
    name: 'Knowledge Research Agent',
    autonomyClass: 'read_only',
    roleSummary: 'Retrieves grounded SOP, pricing, and policy citations via Hybrid RAG v3.',
    systemGuidance:
      'Cite only verified local Knowledge Hub excerpts in [1], [2] format. State explicitly when no matching document exists.',
    allowedTools: ['search_knowledge', 'get_workspace_summary'],
    canEmitProposedActions: false,
  },
  {
    id: 'financial_intelligence',
    name: 'Financial Intelligence Agent',
    autonomyClass: 'read_only',
    roleSummary: 'Analyzes revenue, expenses, invoice aging buckets, and project profitability estimates.',
    systemGuidance:
      'Present big.js-derived totals clearly and include an explicit disclaimer that outputs are informational estimates, not certified accounting or tax advice.',
    allowedTools: [
      'summarize_business_report',
      'analyze_invoice_aging',
      'list_overdue_invoices',
      'explain_invoice',
      'explain_project_profitability',
      'suggest_expense_category',
    ],
    canEmitProposedActions: false,
  },
  {
    id: 'schedule_dependency_auditor',
    name: 'Schedule & Dependency Auditor',
    autonomyClass: 'read_only',
    roleSummary: 'Identifies overdue tasks, deadline clusters, and execution priority ordering.',
    systemGuidance:
      'Rank open work by urgency and due-date risk so the freelancer knows what threatens schedule reliability.',
    allowedTools: ['search_tasks', 'prioritize_open_tasks', 'search_projects'],
    canEmitProposedActions: false,
  },
  {
    id: 'client_relationship_analyst',
    name: 'Client Relationship Analyst',
    autonomyClass: 'read_only',
    roleSummary: 'Reviews CRM accounts, active engagements, and payment timeliness per client.',
    systemGuidance:
      'Provide concise account health insights across client status, open invoices, and active deliverables.',
    allowedTools: ['search_clients', 'search_projects', 'list_overdue_invoices'],
    canEmitProposedActions: false,
  },
  {
    id: 'security_compliance_auditor',
    name: 'Security & Compliance Auditor',
    autonomyClass: 'read_only',
    roleSummary: 'Reviews local data scope hygiene, internal-only isolation, and workspace security posture.',
    systemGuidance:
      'Highlight privacy and access-scope controls without exposing secrets or internal credentials.',
    allowedTools: ['get_workspace_summary', 'search_knowledge'],
    canEmitProposedActions: false,
  },
  {
    id: 'bi_narrative_summarizer',
    name: 'BI Narrative Summarizer',
    autonomyClass: 'read_only',
    roleSummary: 'Converts ledger summaries, aging buckets, and CSV profiles into clear executive briefs.',
    systemGuidance:
      'Produce structured narrative insights referencing the exact period and calculation basis.',
    allowedTools: ['summarize_business_report', 'analyze_invoice_aging', 'analyze_csv_dataset'],
    canEmitProposedActions: false,
  },

  // Class 2 — Draft-only (6 agents)
  {
    id: 'proposal_drafter',
    name: 'Proposal Drafter Agent',
    autonomyClass: 'draft_only',
    roleSummary: 'Produces client-ready scope, deliverable, milestone, and pricing proposal text.',
    systemGuidance:
      'Write clear proposal sections (Overview, Deliverables, Timeline, Commercial Terms) grounded in workspace context without mutating IndexedDB.',
    allowedTools: ['search_clients', 'search_projects', 'search_knowledge', 'explain_project_profitability'],
    canEmitProposedActions: false,
  },
  {
    id: 'quotation_pricing_drafter',
    name: 'Quotation & Pricing Drafter',
    autonomyClass: 'draft_only',
    roleSummary: 'Prepares itemized fee breakdowns, deposit terms, and rate framing for quotations.',
    systemGuidance:
      'Use bracketed placeholders where exact quantities remain undecided and cite relevant SOP pricing notes.',
    allowedTools: ['search_clients', 'search_knowledge', 'summarize_business_report'],
    canEmitProposedActions: false,
  },
  {
    id: 'contract_clause_drafter',
    name: 'Contract Clause Drafter',
    autonomyClass: 'draft_only',
    roleSummary: 'Drafts IP ownership, revision-cap, payment-schedule, and termination clauses for review.',
    systemGuidance:
      'Draft non-binding template clauses for independent contractor work and note that legal counsel should review final agreements.',
    allowedTools: ['search_clients', 'search_projects', 'search_knowledge'],
    canEmitProposedActions: false,
  },
  {
    id: 'client_outreach_agent',
    name: 'Client Outreach & Follow-Up Agent',
    autonomyClass: 'draft_only',
    roleSummary: 'Drafts polite progress updates, overdue invoice reminders, and check-in messages.',
    systemGuidance:
      'Keep client outreach concise, courteous, and solution-oriented while referencing verified invoice/project facts.',
    allowedTools: ['search_clients', 'list_overdue_invoices', 'explain_invoice', 'search_knowledge'],
    canEmitProposedActions: false,
  },
  {
    id: 'task_sprint_planner',
    name: 'Task & Sprint Planner Agent',
    autonomyClass: 'draft_only',
    roleSummary: 'Breaks project goals into sequenced milestones, task checklists, and effort estimates.',
    systemGuidance:
      'Produce realistic weekly sprint plans ordered by dependency and priority without creating tasks directly.',
    allowedTools: ['search_projects', 'search_tasks', 'prioritize_open_tasks'],
    canEmitProposedActions: false,
  },
  {
    id: 'executive_digest_writer',
    name: 'Executive Digest Writer',
    autonomyClass: 'draft_only',
    roleSummary: 'Writes weekly or daily owner briefings combining revenue, receivables, and focus priorities.',
    systemGuidance:
      'Summarize high-impact numbers and top 3 focus actions cleanly.',
    allowedTools: [
      'get_workspace_summary',
      'summarize_business_report',
      'analyze_invoice_aging',
      'prioritize_open_tasks',
    ],
    canEmitProposedActions: false,
  },

  // Class 3 — Approval-required (2 agents)
  {
    id: 'workflow_action_proposer',
    name: 'Workflow Action Proposer',
    autonomyClass: 'approval_required',
    roleSummary: 'Prepares validated workspace mutations (tasks, leads, projects, proposals) for human sign-off.',
    systemGuidance:
      'Analyze workspace needs and propose explicit structured actions that ALWAYS require human Approve & Create confirmation before writing.',
    allowedTools: [
      'get_workspace_summary',
      'search_clients',
      'search_projects',
      'search_tasks',
      'create_task_draft',
      'create_client_draft',
      'create_project_draft',
      'create_proposal_draft',
    ],
    canEmitProposedActions: true,
  },
  {
    id: 'solodesk_orchestrator',
    name: 'Solodesk Orchestrator Agent',
    autonomyClass: 'approval_required',
    roleSummary: 'Plans multi-step workflows across least-privilege read/draft agents and gates write proposals behind human approval.',
    systemGuidance:
      'Coordinate workspace analysis, research grounding, and executive drafting across scoped sub-agents without ever bypassing tool permissions.',
    allowedTools: [
      'get_workspace_summary',
      'search_clients',
      'search_projects',
      'search_tasks',
      'search_knowledge',
      'summarize_business_report',
      'analyze_invoice_aging',
      'prioritize_open_tasks',
      'create_task_draft',
      'create_project_draft',
      'create_proposal_draft',
    ],
    canDelegateTo: ['workspace_analyst', 'financial_intelligence', 'knowledge_researcher', 'executive_digest_writer'],
    canEmitProposedActions: true,
  },
];

export function getAgentDefinition(agentId: AgentId): AgentDefinition {
  const found = AGENT_WORKFORCE_REGISTRY.find((a) => a.id === agentId);
  if (!found) {
    throw new Error(`Unknown agent "${agentId}".`);
  }
  return found;
}

/**
 * Enforces strict least-privilege tool allowlists on individual agents.
 */
export function assertAgentToolAllowed(agentId: AgentId, toolName: CopilotToolName): void {
  const agent = getAgentDefinition(agentId);
  if (!agent.allowedTools.includes(toolName)) {
    throw new Error(
      `Permission denied: agent "${agent.name}" (${agent.autonomyClass}) cannot access tool "${toolName}".`
    );
  }
  const policy = TOOL_PERMISSION_POLICIES[toolName];
  if (!policy) {
    throw new Error(`Unknown tool policy: "${toolName}".`);
  }
  if (agent.autonomyClass !== 'approval_required' && policy.access === 'write') {
    throw new Error(
      `Privilege escalation blocked: "${agent.autonomyClass}" agent "${agent.name}" cannot access write tool "${toolName}".`
    );
  }
}

/**
 * Enforces non-escalation when an orchestrator delegates to a child agent:
 * 1. Child must be explicitly listed in parent.canDelegateTo
 * 2. Effective allowed tools are strict intersection: parent.allowedTools ∩ child.allowedTools
 * 3. Direct write-tool execution is strictly blocked during autonomous delegation
 */
export function enforceDelegatedToolAllowed(
  parentAgentId: AgentId,
  childAgentId: AgentId,
  toolName: CopilotToolName
): void {
  const parent = getAgentDefinition(parentAgentId);
  const child = getAgentDefinition(childAgentId);

  if (!parent.canDelegateTo || !parent.canDelegateTo.includes(childAgentId)) {
    throw new Error(
      `Delegation denied: agent "${parent.name}" is not authorized to delegate to "${child.name}".`
    );
  }
  if (!parent.allowedTools.includes(toolName) || !child.allowedTools.includes(toolName)) {
    throw new Error(
      `Delegated privilege escalation blocked: tool "${toolName}" is outside the permission intersection of "${parent.name}" and "${child.name}".`
    );
  }
  if (TOOL_PERMISSION_POLICIES[toolName].access === 'write') {
    throw new Error(
      `Delegated write execution blocked: "${toolName}" requires explicit human approval.`
    );
  }
}

async function safeInvokeReadTool(
  agentId: AgentId,
  toolName: CopilotToolName,
  args: Record<string, unknown>,
  delegatedFrom?: AgentId
): Promise<string | null> {
  if (delegatedFrom) {
    enforceDelegatedToolAllowed(delegatedFrom, agentId, toolName);
  } else {
    assertAgentToolAllowed(agentId, toolName);
  }
  if (TOOL_PERMISSION_POLICIES[toolName].access === 'write') {
    throw new Error(`Direct execution of write tool "${toolName}" is prohibited without approval.`);
  }
  const res = await executeAllowlistedTool(toolName, args);
  return res.summary;
}

export async function runWorkforceAgent(input: {
  agentId: AgentId;
  goal: string;
  clientId?: string;
  projectId?: string;
  providerPreference?: 'auto' | AIProviderId;
  allowExternalContextTransmission?: boolean;
  signal?: AbortSignal;
}): Promise<AgentRunResult> {
  const startedMs = Date.now();
  const startedAt = new Date(startedMs).toISOString();
  const runId = createId('agrun');
  const agent = getAgentDefinition(input.agentId);
  const cleanGoal = input.goal.trim();

  if (!cleanGoal) {
    throw new Error('Please provide a clear task or goal for the agent.');
  }

  const toolsInvoked: CopilotToolName[] = [];
  const delegatedAgents: AgentId[] = [];
  const contextParts: string[] = [];
  let citations: KnowledgeCitation[] = [];

  const checkCancelled = () => {
    if (input.signal?.aborted) {
      throw new DOMException('Agent execution was cancelled by user.', 'AbortError');
    }
  };

  try {
    checkCancelled();

    if (agent.id === 'solodesk_orchestrator' && agent.canDelegateTo) {
      const planSteps: Array<{ childId: AgentId; tool: CopilotToolName }> = [
        { childId: 'workspace_analyst', tool: 'get_workspace_summary' },
        { childId: 'financial_intelligence', tool: 'analyze_invoice_aging' },
        { childId: 'financial_intelligence', tool: 'summarize_business_report' },
        { childId: 'executive_digest_writer', tool: 'prioritize_open_tasks' },
      ];

      for (const step of planSteps) {
        checkCancelled();
        enforceDelegatedToolAllowed('solodesk_orchestrator', step.childId, step.tool);
        const summary = await safeInvokeReadTool(step.childId, step.tool, {}, 'solodesk_orchestrator');
        if (summary) {
          if (!delegatedAgents.includes(step.childId)) delegatedAgents.push(step.childId);
          if (!toolsInvoked.includes(step.tool)) toolsInvoked.push(step.tool);
          contextParts.push(`[Delegated -> ${step.childId} / ${step.tool}]: ${summary}`);
        }
      }
    } else {
      const readTools = agent.allowedTools.filter(
        (t) => TOOL_PERMISSION_POLICIES[t].access === 'read' && t !== 'analyze_csv_dataset' && t !== 'search_knowledge'
      );

      for (const tool of readTools.slice(0, 4)) {
        checkCancelled();
        let args: Record<string, unknown> = {};
        if (tool === 'search_clients' || tool === 'search_projects' || tool === 'search_tasks') {
          args = { query: cleanGoal.slice(0, 60) };
        } else if (tool === 'explain_invoice') {
          continue;
        } else if (tool === 'explain_project_profitability') {
          if (!input.projectId) continue;
          args = { projectId: input.projectId };
        } else if (tool === 'suggest_expense_category') {
          args = { description: cleanGoal.slice(0, 120) };
        }

        const summary = await safeInvokeReadTool(agent.id, tool, args);
        if (summary) {
          toolsInvoked.push(tool);
          contextParts.push(`[${tool}]: ${summary}`);
        }
      }
    }

    if (agent.allowedTools.includes('search_knowledge')) {
      checkCancelled();
      assertAgentToolAllowed(agent.id, 'search_knowledge');
      const rag = await searchKnowledgeBase(cleanGoal, 4, { accessScope: 'workspace' });
      citations = rag.citations;
      if (!toolsInvoked.includes('search_knowledge')) {
        toolsInvoked.push('search_knowledge');
      }
      if (rag.contextText) {
        contextParts.push(
          `KNOWLEDGE HUB CITATIONS (workspace scope):\n${wrapUntrustedContextSnippet('Local Knowledge Hub', rag.contextText)}`
        );
      }
    }

    if (input.clientId) {
      const client = await repositories.getClient(input.clientId);
      if (client) {
        contextParts.push(
          `TARGET CLIENT: ${client.name}${client.company ? ` (${client.company})` : ''} · Status: ${client.status}`
        );
      }
    }
    if (input.projectId) {
      const project = await repositories.getProject(input.projectId);
      if (project) {
        contextParts.push(
          `TARGET PROJECT: ${project.name} · ${project.status} · Budget ${project.currency} ${project.budget} · ${project.progress}%`
        );
      }
    }

    checkCancelled();

    const contextSummary = contextParts.join('\n\n');
    const provider = createAIProvider(input.providerPreference ?? 'auto');
    let usedProvider = provider;

    if (
      (provider.id === 'gemini' || provider.id === 'openai_compatible') &&
      contextSummary &&
      !input.allowExternalContextTransmission
    ) {
      // Safe deterministic downgrade unless external transmission consent is granted
      usedProvider = createAIProvider('mock');
    }

    let response;
    try {
      response = await usedProvider.generateText({
        systemInstruction: `${COPILOT_SYSTEM_INSTRUCTION}\n\nACTIVE AGENT ROLE (${agent.name} · ${agent.autonomyClass}): ${agent.systemGuidance}`,
        prompt: cleanGoal,
        context: contextSummary,
      });
    } catch {
      const offline = createAIProvider('mock');
      response = await offline.generateText({
        systemInstruction: `${COPILOT_SYSTEM_INSTRUCTION}\n\nACTIVE AGENT ROLE (${agent.name}): ${agent.systemGuidance}`,
        prompt: cleanGoal,
        context: contextSummary,
      });
    }

    checkCancelled();

    // Only Class 3 (approval_required) agents may propose workspace write actions, and ALWAYS gated.
    const proposedActions: ProposedAgentAction[] = [];
    if (agent.autonomyClass === 'approval_required' && agent.canEmitProposedActions) {
      const actionTitle = cleanGoal.slice(0, 72) || 'Follow up on orchestrated plan';
      proposedActions.push(
        validateProposedAction({
          id: createId('act'),
          tool: 'create_task_draft',
          title: `Action Draft: ${actionTitle}`,
          summary: `Proposed by ${agent.name} — requires explicit human approval before creating task in IndexedDB.`,
          args: {
            title: `[Agent Proposal] ${actionTitle}`,
            description: `Orchestrated by ${agent.name} (${agent.autonomyClass}). Review context before confirming.`,
            priority: 'medium',
            projectId: input.projectId ?? '',
          },
        })
      );
    }

    const finishedMs = Date.now();
    const durationMs = Math.max(1, finishedMs - startedMs);
    const estimatedTokens = Math.max(
      1,
      Math.ceil((cleanGoal.length + contextSummary.length + response.text.length) / 4)
    );

    const runResult: AgentRunResult = {
      runId,
      agentId: agent.id,
      agentName: agent.name,
      autonomyClass: agent.autonomyClass,
      status: 'completed',
      goal: cleanGoal,
      outputText: `${agent.name} [${agent.autonomyClass.toUpperCase()}]\n\n${response.text}${
        contextParts.length > 0 ? `\n\n--- Grounded Tool Trace ---\n${contextParts.slice(0, 4).join('\n')}` : ''
      }`,
      model: response.model,
      providerId: response.providerId,
      isOfflineDraft: response.isOfflineDraft,
      citations,
      toolsInvoked,
      delegatedAgents,
      proposedActions,
      durationMs,
      estimatedTokens,
      startedAt,
      finishedAt: new Date(finishedMs).toISOString(),
    };

    try {
      await repositories.logSecurityEvent({
        eventType: 'agent_execution',
        severity: 'info',
        actor: `agent:${agent.id}`,
        detail: `${agent.name} (${agent.autonomyClass}) completed in ${durationMs}ms using tools [${toolsInvoked.join(', ') || 'none'}]; proposedActions=${proposedActions.length}.`,
      });
    } catch {
      // Non-fatal in isolated mock tests
    }

    return runResult;
  } catch (err) {
    const finishedMs = Date.now();
    const isAbort =
      (err instanceof DOMException && err.name === 'AbortError') ||
      (err instanceof Error && err.name === 'AbortError');
    return {
      runId,
      agentId: agent.id,
      agentName: agent.name,
      autonomyClass: agent.autonomyClass,
      status: isAbort ? 'cancelled' : 'failed',
      goal: cleanGoal,
      outputText: isAbort
        ? 'Execution cancelled cleanly before completion.'
        : err instanceof Error
          ? err.message
          : 'Agent execution failed.',
      model: 'deterministic-guard',
      providerId: 'mock',
      isOfflineDraft: true,
      citations,
      toolsInvoked,
      delegatedAgents,
      proposedActions: [],
      durationMs: Math.max(1, finishedMs - startedMs),
      estimatedTokens: 0,
      startedAt,
      finishedAt: new Date(finishedMs).toISOString(),
      errorMessage: err instanceof Error ? err.message : 'Agent error',
    };
  }
}
