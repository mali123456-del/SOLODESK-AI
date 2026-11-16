import type { CopilotPresetTask } from '../agent/agent';

export interface DomainPromptTemplate {
  id: CopilotPresetTask | 'profitability_explain';
  label: string;
  systemGuidance: string;
  userScaffold: string;
  requiredFactsChecklist: string[];
}

export const COPILOT_PROMPT_TEMPLATES: Record<string, DomainPromptTemplate> = {
  proposal_draft: {
    id: 'proposal_draft',
    label: 'Proposal Scope & Deliverables Draft',
    systemGuidance:
      'Structure the response into: (1) Verified Workspace Facts Used, (2) Proposal Outline (Overview, Deliverables, Timeline, Investment/Payment Schedule), (3) Assumptions & Missing Info to Confirm.',
    userScaffold:
      'Draft a clear client proposal based on my selected client/project context and Knowledge Hub pricing guidelines.',
    requiredFactsChecklist: ['Client name', 'Project scope or deliverables', 'Currency & pricing schedule'],
  },
  client_email: {
    id: 'client_email',
    label: 'Client Update Email',
    systemGuidance:
      'Write a concise, polite client email citing only verified project milestones or tasks present in context. Mark placeholders clearly where info is missing.',
    userScaffold: 'Draft a concise weekly project status email summarizing progress and next milestone.',
    requiredFactsChecklist: ['Client contact name', 'Current project status', 'Next action/date'],
  },
  invoice_followup: {
    id: 'invoice_followup',
    label: 'Overdue Invoice Follow-Up',
    systemGuidance:
      'Reference exact invoice number, remaining balance, currency, and due date from context. Keep tone courteous and constructive.',
    userScaffold: 'Draft a polite follow-up reminder for my open or overdue invoices.',
    requiredFactsChecklist: ['Invoice number', 'Balance due & currency', 'Due date'],
  },
  project_summary: {
    id: 'project_summary',
    label: 'Project Health & Profitability Summary',
    systemGuidance:
      'Separate Verified Facts (budget, logged hours, income, expenses) from Recommendations. Label financial metrics as informational estimates.',
    userScaffold: 'Summarize the selected project status, hours tracked vs budget, and recommended next step.',
    requiredFactsChecklist: ['Project budget', 'Tracked hours', 'Recorded income & expenses'],
  },
  rewrite_professional: {
    id: 'rewrite_professional',
    label: 'Professional Rewrite',
    systemGuidance:
      'Improve clarity, structure, and tone without inventing metrics, dates, or deliverables not provided by the user.',
    userScaffold: 'Rewrite this client note cleanly and concisely with a clear next step.',
    requiredFactsChecklist: ['Source draft text'],
  },
};

export function getPromptTemplate(preset?: string): DomainPromptTemplate | undefined {
  if (!preset) return undefined;
  return COPILOT_PROMPT_TEMPLATES[preset];
}
