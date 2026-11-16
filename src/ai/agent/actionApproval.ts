import { isAllowlistedTool, requiresUserApproval } from './permissions';
import {
  createClientDraftArgsSchema,
  createTaskDraftArgsSchema,
  type ProposedAgentAction,
} from './schemas';
import { executeAllowlistedTool, type ToolExecutionResult } from './tools';

export interface ApprovalDecisionRecord {
  action: ProposedAgentAction;
  approved: boolean;
  executed: boolean;
  result?: ToolExecutionResult;
  error?: string;
}

export function validateProposedAction(action: ProposedAgentAction): ProposedAgentAction {
  if (!isAllowlistedTool(action.tool)) {
    throw new Error(`Rejected non-allowlisted action tool: ${action.tool}`);
  }
  if (action.tool === 'create_task_draft') {
    createTaskDraftArgsSchema.parse(action.args);
  } else if (action.tool === 'create_client_draft') {
    createClientDraftArgsSchema.parse(action.args);
  }
  return action;
}

export async function runActionWithApproval(
  action: ProposedAgentAction,
  approved: boolean
): Promise<ApprovalDecisionRecord> {
  validateProposedAction(action);

  if (requiresUserApproval(action.tool) && !approved) {
    return {
      action,
      approved: false,
      executed: false,
      error: 'Explicit user approval is required before executing workspace write actions.',
    };
  }

  const result = await executeAllowlistedTool(action.tool, action.args);
  return {
    action,
    approved,
    executed: true,
    result,
  };
}
