import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/database/db';
import { repositories } from '../../src/database/repositories/dexieRepositories';
import {
  clearSessionGeminiKey,
  createAIProvider,
  getSessionGeminiKey,
  hasSessionGeminiKey,
  maskApiKey,
  setSessionGeminiKey,
} from '../../src/ai/providers/providerFactory';
import { addKnowledgeNote, searchKnowledgeBase } from '../../src/ai/knowledge/knowledgeService';
import { runActionWithApproval } from '../../src/ai/agent/actionApproval';
import { extractProposedActions, runCopilotPrompt } from '../../src/ai/agent/agent';
import { validateDatasetManifest } from '../../src/ai/datasets/validation/validateManifest';
import manifestJson from '../../src/ai/datasets/manifests/templates_manifest.json';
import { runLocalRagBenchmark } from '../../src/ai/evaluation/evaluation';

async function clearDb() {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}

describe('Phase 9: AI Copilot, Local RAG, Approval Gating & Datasets', () => {
  beforeEach(async () => {
    await clearDb();
    clearSessionGeminiKey();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('keeps Gemini API keys strictly in memory and never persists them to browser storage', () => {
    expect(hasSessionGeminiKey()).toBe(false);
    expect(maskApiKey('')).toBe('Not set');

    setSessionGeminiKey('AIzaSyTestSecretKey123456');
    expect(hasSessionGeminiKey()).toBe(true);
    expect(getSessionGeminiKey()).toBe('AIzaSyTestSecretKey123456');
    expect(maskApiKey(getSessionGeminiKey())).toBe('AIza••••3456');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    const provider = createAIProvider('auto');
    expect(provider.id).toBe('gemini');
    expect(provider.modelId).toBe('gemini-4-hydrogen');

    clearSessionGeminiKey();
    expect(hasSessionGeminiKey()).toBe(false);
    expect(createAIProvider('auto').id).toBe('mock');
  });

  it('indexes local knowledge notes deterministically and retrieves offline citations', async () => {
    const longContent = [
      'SOLODESK Standard Retainer Agreement requires a 40% kickoff deposit prior to sprint 1.',
      'All milestone invoices carry Net-14 payment terms and include two rounds of revisions.',
      'Out-of-scope additions are billed separately as a written change request at the hourly studio rate.',
    ].join('\n\n');

    const { document, chunks } = await addKnowledgeNote({
      title: 'Standard Retainer & Payment Terms',
      content: longContent,
      tags: ['billing', 'terms'],
    });

    expect(document.chunkCount).toBe(chunks.length);
    const search = await searchKnowledgeBase('payment terms deposit', 3);
    expect(search.citations.length).toBeGreaterThan(0);
    expect(search.citations[0].documentTitle).toBe('Standard Retainer & Payment Terms');
    expect(search.contextText).toContain('[1] Source: Standard Retainer & Payment Terms');
  });

  it('requires explicit external transmission consent when a Gemini key is active with local context', async () => {
    await addKnowledgeNote({
      title: 'Client Brief',
      content: 'Northwind Studio redesign includes checkout optimization and accessibility audit.',
    });
    setSessionGeminiKey('AIzaSyTestKey987654');

    await expect(
      runCopilotPrompt({
        prompt: 'Draft a proposal for Northwind Studio checkout optimization',
        useKnowledgeRag: true,
        includeWorkspaceContext: true,
        allowExternalContextTransmission: false,
      })
    ).rejects.toThrow(/External context consent required/i);
  });

  it('runs offline Copilot drafts cleanly and gates workspace writes behind explicit approval', async () => {
    await addKnowledgeNote({
      title: 'Revision Policy',
      content: 'Two revision rounds are included per milestone; extra rounds bill hourly.',
    });

    const response = await runCopilotPrompt({
      prompt: 'Write an invoice follow-up referencing our revision and payment policy',
      preset: 'invoice_followup',
      useKnowledgeRag: true,
      includeWorkspaceContext: true,
    });

    expect(response.isOfflineDraft).toBe(true);
    expect(response.providerId).toBe('mock');
    expect(response.text.length).toBeGreaterThan(20);
    expect(response.proposedActions.length).toBe(1);

    const action = response.proposedActions[0];
    const blocked = await runActionWithApproval(action, false);
    expect(blocked.executed).toBe(false);
    expect((await repositories.listTasks()).length).toBe(0);

    const approved = await runActionWithApproval(action, true);
    expect(approved.executed).toBe(true);
    const tasks = await repositories.listTasks();
    expect(tasks.length).toBe(1);
    expect(tasks[0].title).toContain('follow-up');
  });

  it('extracts valid proposed_action tags safely and ignores invalid tools', () => {
    const raw = `Here is your draft.\n<proposed_action>{"tool":"create_client_draft","title":"Add Horizon Lead","summary":"Save Horizon as a lead","args":{"name":"Horizon Commerce"}}</proposed_action>`;
    const parsed = extractProposedActions(raw);
    expect(parsed.cleanedText).toBe('Here is your draft.');
    expect(parsed.proposedActions).toHaveLength(1);
    expect(parsed.proposedActions[0].tool).toBe('create_client_draft');
  });

  it('validates dataset manifest provenance and passes deterministic local RAG benchmark', () => {
    const validated = validateDatasetManifest(manifestJson);
    expect(validated.datasets[0].containsPersonalData).toBe(false);
    expect(validated.datasets[0].clearedForCommercialUse).toBe(true);

    const bench = runLocalRagBenchmark();
    expect(bench.totalCases).toBe(2);
    expect(bench.passedCases).toBe(2);
    expect(bench.passRatePercent).toBe(100);
  });
});
