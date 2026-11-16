import type { AIGenerateRequest, AIGenerateResponse, AIProvider } from './AIProvider';

export class MockProvider implements AIProvider {
  readonly id = 'mock' as const;
  readonly label = 'Offline Deterministic Drafts';
  readonly modelId = 'local-offline-template-v1';

  isConfigured(): boolean {
    return true;
  }

  async generateText(request: AIGenerateRequest): Promise<AIGenerateResponse> {
    const prompt = request.prompt.trim();
    const lower = prompt.toLowerCase();

    let draft = '';
    if (lower.includes('proposal')) {
      draft = [
        '### Proposal Outline (Offline Local Draft)',
        '',
        '1. **Project Understanding**: Summarize the client goal, target audience, and measurable outcomes.',
        '2. **Scope & Deliverables**: Break work into clear milestones with acceptance criteria.',
        '3. **Timeline & Investment**: Specify sprint duration, kickoff requirements, and 50/50 milestone billing.',
        '4. **Next Steps**: Confirm scope approval and issue quotation or kickoff deposit invoice.',
      ].join('\n');
    } else if (lower.includes('follow-up') || lower.includes('follow up') || lower.includes('invoice') || lower.includes('payment')) {
      draft = [
        'Subject: Friendly Follow-Up on Open Invoice / Next Steps',
        '',
        'Hi [Client Name],',
        '',
        'I hope your week is going well. Sharing a quick reminder regarding our recent invoice / milestone deliverable.',
        'Please let me know if you need any clarification or updated payment details.',
        '',
        'Best regards,',
        '[Your Name / Business Name]',
      ].join('\n');
    } else if (lower.includes('email')) {
      draft = [
        'Subject: Project Update & Next Milestone',
        '',
        'Hi [Client Name],',
        '',
        'Here is a brief update on current progress. Completed items are ready for your review, and the next milestone is on schedule.',
        '',
        'Best regards,',
        '[Your Name]',
      ].join('\n');
    } else {
      const contextHint = request.context
        ? `\n\nMatched local context snippet:\n${request.context.slice(0, 320)}...`
        : '';
      draft = `Offline Local Draft (No Gemini API call made)\n\nRequest noted: "${prompt}"\n\nRecommended next action: Review your linked project milestones, open tasks, or Knowledge Hub citations.${contextHint}`;
    }

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
