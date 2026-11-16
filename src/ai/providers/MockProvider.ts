import type { AIGenerateRequest, AIGenerateResponse, AIProvider } from './AIProvider';

export class MockProvider implements AIProvider {
  readonly id = 'mock' as const;
  readonly label = 'Offline Deterministic Drafts';
  readonly modelId = 'local-offline-template-v2';

  isConfigured(): boolean {
    return true;
  }

  async generateText(request: AIGenerateRequest): Promise<AIGenerateResponse> {
    const prompt = request.prompt.trim();
    const lower = prompt.toLowerCase();
    const context = request.context?.trim() ?? '';

    const workspaceLine =
      context
        .split('\n')
        .find((line) => line.startsWith('Workspace has ') || line.startsWith('Business summary ')) ??
      '';
    const clientMatch = context.match(/SELECTED CLIENT:\n([\s\S]*?)(\n\n|$)/);
    const projectMatch = context.match(/SELECTED PROJECT:\n([\s\S]*?)(\n\n|$)/);
    const knowledgeMatch = context.match(/\[C1\][^\n]*/);

    const factsSection = [
      '### 1. Verified Workspace Facts',
      workspaceLine ? `- ${workspaceLine}` : '- No live workspace summary metrics matched in context.',
      clientMatch ? `- Client Context: ${clientMatch[1].replace(/\n/g, ' | ')}` : '- Client Context: None selected (specify a client to personalize).',
      projectMatch ? `- Project Context: ${projectMatch[1].replace(/\n/g, ' | ')}` : '- Project Context: None selected.',
      knowledgeMatch ? `- Knowledge Grounding: ${knowledgeMatch[0]}` : '- Knowledge Grounding: No matching Knowledge Hub passage attached (load the 14 Knowledge Packs in Knowledge Hub for richer grounding).',
    ].join('\n');

    let recommendationSection = '';
    if (lower.includes('proposal')) {
      recommendationSection = [
        '### 2. Recommended Proposal Draft',
        '1. **Project Understanding**: Summarize the client objective, audience, and measurable target outcomes.',
        '2. **Scope & Deliverables**: Break work into 2–4 milestones with explicit acceptance checks and 2 revision rounds per milestone.',
        '3. **Timeline & Payment Schedule**: State kickoff requirements, weekly checkpoint cadence, and 40% kickoff / 60% delivery billing.',
        '4. **Exclusions**: Note that unpriced out-of-scope additions require a separate change quotation.',
      ].join('\n');
    } else if (
      lower.includes('follow-up') ||
      lower.includes('follow up') ||
      lower.includes('invoice') ||
      lower.includes('payment') ||
      lower.includes('aging')
    ) {
      recommendationSection = [
        '### 2. Recommended Follow-Up Email Draft',
        'Subject: Friendly reminder regarding Invoice [Invoice Number]',
        '',
        'Hi [Client Name],',
        '',
        'I hope your week is going well. Sharing a quick reminder regarding our open invoice / milestone balance.',
        'Please let me know if you need the PDF re-sent or have any questions about the line items or payment instructions.',
        '',
        'Best regards,',
        '[Your Name / Business Name]',
      ].join('\n');
    } else if (lower.includes('email')) {
      recommendationSection = [
        '### 2. Recommended Client Update Email Draft',
        'Subject: Project Update & Next Milestone',
        '',
        'Hi [Client Name],',
        '',
        'Here is a concise status update:',
        '- Completed this week: [Summarize completed tasks]',
        '- Next milestone: [Next deliverable + target date]',
        '- Needed from you: [Any feedback or assets needed]',
        '',
        'Best regards,',
        '[Your Name]',
      ].join('\n');
    } else if (lower.includes('profit') || lower.includes('report') || lower.includes('finance') || lower.includes('margin')) {
      recommendationSection = [
        '### 2. Financial & Profitability Analysis (Informational Estimate)',
        '- Compare recorded income minus direct project expenses divided by total logged hours to check effective hourly rate.',
        '- Review unpaid receivables by aging bucket (Current, 1–30d, 31–60d, 61+d) and schedule reminders for aged balances.',
        '- Disclaimer: All workspace summaries are informational estimates, not certified accounting.',
      ].join('\n');
    } else {
      recommendationSection = [
        '### 2. Recommended Next Steps (Offline Local Draft)',
        `Request received: "${prompt}"`,
        '- Review the verified facts and attached Knowledge Hub citations below.',
        '- Confirm missing parameters (target client, budget, or deadline) before creating permanent records.',
      ].join('\n');
    }

    const missingInfoHints: string[] = [];
    if (!clientMatch) missingInfoHints.push('target Client');
    if (!projectMatch && (lower.includes('project') || lower.includes('proposal'))) {
      missingInfoHints.push('target Project');
    }

    const clarificationSection =
      missingInfoHints.length > 0
        ? `\n\n### 3. Missing Information to Confirm\n- To tailor this further, select or specify: ${missingInfoHints.join(', ')}.`
        : '';

    const draft = `${factsSection}\n\n${recommendationSection}${clarificationSection}`;

    return {
      text: draft,
      model: this.modelId,
      providerId: 'mock',
      isOfflineDraft: true,
    };
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: 'Offline template provider is always ready.' };
  }
}
