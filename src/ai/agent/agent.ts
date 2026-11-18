import { createId } from '../../domain/schemas/entities';
import { repositories } from '../../database/repositories/dexieRepositories';
import { wrapUntrustedContextSnippet } from '../../security/sanitize';
import { getPromptTemplate } from '../prompts/promptTemplates';
import { createAIProvider } from '../providers/providerFactory';
import type { KnowledgeCitation } from '../rag/citations';
import { searchKnowledgeBase } from '../knowledge/knowledgeService';
import { validateProposedAction } from './actionApproval';
import type { ProposedAgentAction } from './schemas';
import { COPILOT_SYSTEM_INSTRUCTION } from './systemInstructions';
import { executeAllowlistedTool } from './tools';

import type { AIProviderId } from '../providers/AIProvider';

export type CopilotPresetTask =
  | 'custom'
  | 'proposal_draft'
  | 'client_email'
  | 'invoice_followup'
  | 'project_summary'
  | 'rewrite_professional';

export interface CopilotRunOptions {
  prompt: string;
  preset?: CopilotPresetTask;
  useKnowledgeRag?: boolean;
  allowInternalKnowledge?: boolean;
  includeWorkspaceContext?: boolean;
  allowExternalContextTransmission?: boolean;
  providerPreference?: 'auto' | AIProviderId;
  clientId?: string;
  projectId?: string;
}

export interface CopilotRunResponse {
  text: string;
  model: string;
  providerId: AIProviderId;
  isOfflineDraft: boolean;
  citations: KnowledgeCitation[];
  contextSummarySent: string;
  proposedActions: ProposedAgentAction[];
  usedFallbackFromError?: string;
}

export function extractProposedActions(rawText: string): {
  cleanedText: string;
  proposedActions: ProposedAgentAction[];
} {
  const proposedActions: ProposedAgentAction[] = [];
  const pattern = /<proposed_action>([\s\S]*?)<\/proposed_action>/g;

  const cleanedText = rawText
    .replace(pattern, (_match, jsonBody: string) => {
      try {
        const parsed = JSON.parse(jsonBody.trim()) as Partial<ProposedAgentAction>;
        if (!parsed.tool || !parsed.title || !parsed.summary) return '';
        const candidate: ProposedAgentAction = {
          id: createId('act'),
          tool: parsed.tool,
          title: parsed.title,
          summary: parsed.summary,
          args: parsed.args ?? {},
        };
        proposedActions.push(validateProposedAction(candidate));
      } catch {
        // Ignore malformed proposed action block safely
      }
      return '';
    })
    .trim();

  return { cleanedText, proposedActions };
}

export async function runCopilotPrompt(options: CopilotRunOptions): Promise<CopilotRunResponse> {
  const userPrompt = options.prompt.trim();
  if (!userPrompt) {
    throw new Error('Please enter a prompt or select a quick draft preset.');
  }

  let citations: KnowledgeCitation[] = [];
  const contextSections: string[] = [];

  const template = getPromptTemplate(options.preset);
  if (template) {
    contextSections.push(`TASK TEMPLATE GUIDANCE (${template.label}):\n${template.systemGuidance}`);
  }

  if (options.useKnowledgeRag !== false) {
    const ragResult = await searchKnowledgeBase(userPrompt, 4, {
      accessScope: options.allowInternalKnowledge ? 'internal_only' : 'workspace',
    });
    citations = ragResult.citations;
    if (ragResult.contextText) {
      contextSections.push(
        `KNOWLEDGE HUB CITATIONS:\n${wrapUntrustedContextSnippet('Local Knowledge Hub', ragResult.contextText)}`
      );
    }
  }

  if (options.includeWorkspaceContext !== false) {
    const [summaryTool, agingTool] = await Promise.all([
      executeAllowlistedTool('get_workspace_summary', {}),
      executeAllowlistedTool('analyze_invoice_aging', {}),
    ]);
    contextSections.push(`WORKSPACE SUMMARY:\n${summaryTool.summary}\n${agingTool.summary}`);

    if (options.clientId) {
      const client = await repositories.getClient(options.clientId);
      if (client) {
        contextSections.push(
          `SELECTED CLIENT:\nName: ${client.name}${client.company ? ` (${client.company})` : ''}\nStatus: ${client.status}\nNotes: ${client.notes || 'None'}`
        );
      }
    }

    if (options.projectId) {
      const [project, profTool] = await Promise.all([
        repositories.getProject(options.projectId),
        executeAllowlistedTool('explain_project_profitability', { projectId: options.projectId }),
      ]);
      if (project) {
        contextSections.push(
          `SELECTED PROJECT:\nName: ${project.name}\nStatus: ${project.status}\nProgress: ${project.progress}%\nBudget: ${project.currency} ${project.budget}\n${profTool.summary}`
        );
      }
    }
  }

  const contextSummarySent = contextSections.join('\n\n');
  const provider = createAIProvider(options.providerPreference ?? 'auto');

  if (
    (provider.id === 'gemini' || provider.id === 'openai_compatible') &&
    contextSummarySent &&
    !options.allowExternalContextTransmission
  ) {
    throw new Error(
      `External context consent required: confirm before sending local workspace or Knowledge Hub snippets to ${provider.label}.`
    );
  }

  let aiResponse;
  let usedFallbackFromError: string | undefined;

  try {
    aiResponse = await provider.generateText({
      systemInstruction: COPILOT_SYSTEM_INSTRUCTION,
      prompt: userPrompt,
      context: contextSummarySent,
    });
  } catch (err) {
    // Graceful fallback to offline deterministic draft so the workspace stays usable even when API fails or user goes offline.
    const fallbackProvider = createAIProvider('mock');
    usedFallbackFromError = err instanceof Error ? err.message : 'AI provider call failed.';
    aiResponse = await fallbackProvider.generateText({
      systemInstruction: COPILOT_SYSTEM_INSTRUCTION,
      prompt: userPrompt,
      context: contextSummarySent,
    });
  }

  const { cleanedText, proposedActions } = extractProposedActions(aiResponse.text);

  // Suggest an approval-gated follow-up task draft on invoice follow-up / proposal presets when helpful and none was emitted
  if (
    proposedActions.length === 0 &&
    (options.preset === 'invoice_followup' || options.preset === 'proposal_draft')
  ) {
    const fallbackTitle =
      options.preset === 'invoice_followup'
        ? 'Send client invoice follow-up'
        : 'Review and send client proposal';
    proposedActions.push(
      validateProposedAction({
        id: createId('act'),
        tool: 'create_task_draft',
        title: `Create task: ${fallbackTitle}`,
        summary: 'Add a follow-up reminder task to your Tasks board (requires approval).',
        args: {
          title: fallbackTitle,
          description: `Generated from Copilot prompt: "${userPrompt.slice(0, 140)}"`,
          priority: 'medium',
          projectId: options.projectId ?? '',
        },
      })
    );
  }

  return {
    text: cleanedText,
    model: aiResponse.model,
    providerId: aiResponse.providerId,
    isOfflineDraft: aiResponse.isOfflineDraft,
    citations,
    contextSummarySent,
    proposedActions,
    usedFallbackFromError,
  };
}
