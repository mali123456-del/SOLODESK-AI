import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/database/db';
import { repositories } from '../../src/database/repositories/dexieRepositories';
import { App } from '../../src/app/App';
import { addKnowledgeNote, searchKnowledgeBase } from '../../src/ai/knowledge/knowledgeService';
import { retrieveRelevantChunks } from '../../src/ai/rag/retrieval';
import { chunkTextDeterministic } from '../../src/ai/rag/chunking';
import { buildDocumentChunks } from '../../src/ai/rag/indexing';
import { GeminiProvider } from '../../src/ai/providers/GeminiProvider';
import {
  buildResolvedPendingPatch,
  pushSyncQueueToServer,
  resolveSyncConflict,
} from '../../src/services/cloudSyncService';
import { runWorkspaceBackgroundJobs } from '../../src/services/backgroundJobRunner';
import { registerValidatedWebhook, signWebhookPayload } from '../../src/workflows/workflowEngine';
import { ValidationError } from '../../src/core/errors';
import { addDaysToDateStr, todayDateStr } from '../../src/domain/calculations/dates';

async function clearDb() {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}

describe('Phase 26-A: Audit Stabilization & Critical Defect Fixes', () => {
  beforeEach(async () => {
    await clearDb();
    localStorage.clear();
    sessionStorage.clear();
    window.location.hash = '#/dashboard';
  });

  it('routes GeminiProvider to /api/v1/ai/generate without sampling params or browser @google/genai usage', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ text: 'Verified gateway response', model: 'gemini-4-hydrogen' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const prevFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const provider = new GeminiProvider(() => 'AIzaSyGatewayKey12345');
      const res = await provider.generateText({
        prompt: 'Summarize Q4 status',
        temperature: 0.7,
        maxOutputTokens: 256,
      });

      expect(res.text).toBe('Verified gateway response');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/v1/ai/generate');
      const parsedBody = JSON.parse(String(init?.body ?? '{}'));
      expect(parsedBody.model).toBe('gemini-4-hydrogen');
      expect('temperature' in parsedBody).toBe(false);
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  it('excludes internal_only documents from default searchKnowledgeBase and supports semantic fallback cleanly', async () => {
    await addKnowledgeNote({
      title: 'Private Pricing Floor',
      content: 'Internal margin floor is 55 percent; confidential discount authority only.',
      accessScope: 'internal_only',
    });
    await addKnowledgeNote({
      title: 'Public Retainer SOP',
      content: 'Standard invoicing cadence uses Net-14 settlement terms.',
      accessScope: 'workspace',
    });

    const defaultSearch = await searchKnowledgeBase('margin floor discount authority', 5);
    expect(defaultSearch.appliedAccessScope).toBe('workspace');
    expect(defaultSearch.matches).toHaveLength(0);

    const authorizedSearch = await searchKnowledgeBase('margin floor discount authority', 5, {
      includeInternalOnly: true,
    });
    expect(authorizedSearch.matches.length).toBeGreaterThan(0);
    expect(authorizedSearch.matches[0].chunk.documentTitle).toBe('Private Pricing Floor');
    expect(authorizedSearch.provenance.embeddingKind).toBe('lexical-hash-projection');

    // Morphological trigram semantic retrieval when exact stopworded/inflected query has zero exact keyword hits
    const chunks = buildDocumentChunks(
      'doc_morph',
      'Cryptographic Vault',
      chunkTextDeterministic('Encrypted recovery archive uses strong passphrase key wrapping.')
    );
    const hits = retrieveRelevantChunks('encryption passphrases', chunks, 2, {
      minSemanticOnlyThreshold: 0.7,
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].vectorModel).toContain('fnv1a');
    expect(retrieveRelevantChunks('quantum astrophysics telescope', chunks, 2)).toHaveLength(0);
  });

  it('prevents fake local ACK on conflict resolution and transitions sync items to acked only after server confirmation', async () => {
    const item = await repositories.enqueueSyncItem({
      entityType: 'project',
      entityId: 'prj_sync_test',
      operation: 'upsert',
      revision: 2,
      status: 'conflict',
      conflictReason: 'Revision mismatch',
      payloadJson: '{"name":"Alpha"}',
    });

    const decision = resolveSyncConflict({
      localUpdatedAt: '2026-11-18T10:00:00.000Z',
      remoteUpdatedAt: '2026-11-18T09:00:00.000Z',
      strategy: 'latest_timestamp',
    });
    const pendingPatch = buildResolvedPendingPatch(decision);
    expect(pendingPatch.status).toBe('pending');
    const updated = await repositories.updateSyncQueueItem(item.id, pendingPatch);
    expect(updated.status).toBe('pending');

    const serverResult = await pushSyncQueueToServer({
      workspaceId: 'ws_1',
      items: [updated],
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({ ackedIds: [updated.id], conflicts: [], serverTimestamp: '2026-11-18T10:01:00.000Z' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )) as typeof fetch,
    });

    expect(serverResult.ok).toBe(true);
    expect(serverResult.ackedIds).toEqual([updated.id]);
  });

  it('blocks SSRF webhook targets, logs security audit events, and signs valid payloads with HMAC-SHA256', async () => {
    await expect(
      registerValidatedWebhook({
        name: 'Metadata Leak',
        url: 'http://169.254.169.254/latest/meta-data',
        eventType: 'invoice_overdue',
      })
    ).rejects.toThrow(ValidationError);

    await expect(
      registerValidatedWebhook({
        name: 'Loopback Probe',
        url: 'http://127.0.0.1:8080/admin',
        eventType: 'invoice_overdue',
      })
    ).rejects.toThrow(ValidationError);

    const logs = await repositories.listSecurityAuditLogs(20);
    expect(logs.some((l) => l.eventType === 'webhook_ssrf_blocked')).toBe(true);

    const hook = await registerValidatedWebhook({
      name: 'Valid Automation Hook',
      url: 'https://hooks.example.com/solodesk-events',
      eventType: 'invoice_created',
    });
    expect(hook.url).toBe('https://hooks.example.com/solodesk-events');

    const sig = await signWebhookPayload('whsec_test_123', '{"hello":"world"}');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('isolates external #/client-portal?token=... sessions from workspace AppShell navigation', async () => {
    const cli = await repositories.createClient({
      name: 'Portal Client',
      company: 'Acme Co',
      email: 'portal@acme.invalid',
      phone: '',
      website: '',
      location: '',
      status: 'active',
      category: 'SaaS',
      tags: [],
      notes: 'SECRET INTERNAL MARGIN NOTE',
      isDemo: false,
    });
    const link = await repositories.saveClientPortalLink({
      clientId: cli.id,
      projectId: '',
      token: 'portal_isolated_tok_123',
      label: 'Acme Delivery Portal',
      status: 'active',
      expiresAt: addDaysToDateStr(todayDateStr(), 14),
      permissions: {
        showMilestones: true,
        showInvoices: true,
        showSharedFiles: true,
        allowApprovals: true,
        allowFeedback: true,
      },
      onboardingChecklist: [],
      approvals: [],
      feedbackNotes: [],
      surveyComment: '',
    });

    window.location.hash = `#/client-portal?token=${link.token}`;
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('SOLODESK AI · Scoped Client Portal')).toBeInTheDocument();
      expect(screen.getByText('Portal Client')).toBeInTheDocument();
    });
    // Admin sidebar & private internal note must NEVER be rendered
    expect(screen.queryByText('Security Center')).not.toBeInTheDocument();
    expect(screen.queryByText('Portal Links & Permissions')).not.toBeInTheDocument();
    expect(screen.queryByText('SECRET INTERNAL MARGIN NOTE')).not.toBeInTheDocument();
  });

  it('executes recurring invoices idempotently in backgroundJobRunner without duplicate spawns', async () => {
    const cli = await repositories.createClient({
      name: 'Retainer Client',
      company: 'Recurring Co',
      email: 'billing@recurring.invalid',
      phone: '',
      website: '',
      location: '',
      status: 'active',
      category: 'Consulting',
      tags: [],
      notes: '',
      isDemo: false,
    });

    const today = '2026-11-18';
    const parent = await repositories.createInvoice({
      number: 'INV-REC-BASE',
      clientId: cli.id,
      projectId: '',
      quotationId: '',
      issueDate: '2026-10-18',
      dueDate: '2026-11-01',
      currency: 'USD',
      lineItems: [{ id: 'li1', description: 'Monthly Support', quantity: 1, unitPrice: 1500 }],
      discountType: 'none',
      discountValue: 0,
      taxRate: 0,
      taxInclusive: false,
      subtotal: 1500,
      discountAmount: 0,
      taxAmount: 0,
      total: 1500,
      notes: '',
      paymentInstructions: '',
      status: 'paid',
      recurrenceRule: 'monthly',
      nextRecurrenceDate: '2026-11-18',
      isDemo: false,
    });

    const firstRun = await runWorkspaceBackgroundJobs({ today, force: true });
    expect(firstRun.generatedRecurringInvoices).toHaveLength(1);
    expect(firstRun.generatedRecurringInvoices[0].total).toBe(1500);
    expect(firstRun.generatedRecurringInvoices[0].status).toBe('draft');

    const updatedParent = await repositories.getInvoice(parent.id);
    expect(updatedParent?.nextRecurrenceDate).toBe('2026-12-18');

    // Second run on the same date must be strictly idempotent (0 duplicates)
    const secondRun = await runWorkspaceBackgroundJobs({ today });
    expect(secondRun.generatedRecurringInvoices).toHaveLength(0);
  });
});
