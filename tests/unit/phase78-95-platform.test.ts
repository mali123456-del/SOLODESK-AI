import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COPILOT_PROMPT_TEMPLATES } from '../../src/ai/prompts/promptTemplates';
import { repositories } from '../../src/database/repositories/dexieRepositories';
import {
  DEFAULT_WORKSPACE_ID,
  createWorkspaceRecord,
  getDatabaseForWorkspace,
  resetWorkspaceManagerForTest,
  switchActiveWorkspace,
} from '../../src/database/workspaceManager';
import { VOICE_NOTE_MAX_BYTES } from '../../src/domain/schemas/entities';
import { buildCsvContent } from '../../src/export/csvUtils';
import { recordStructuredAudit } from '../../src/security/auditLogger';
import {
  configureIntegrationAdapter,
  testIntegrationConnection,
} from '../../src/services/integrationRegistryService';
import { validateAudioBlobMeta } from '../../src/services/voiceNoteService';
import { validateFeatureRegistry } from '../../src/types/featureRegistry';
import { evaluateCustomWorkflows } from '../../src/workflows/workflowEngine';

async function clearWorkspaceDbs() {
  await resetWorkspaceManagerForTest();
  const mainDb = getDatabaseForWorkspace(DEFAULT_WORKSPACE_ID);
  await mainDb.open();
  await mainDb.transaction('rw', mainDb.tables, async () => {
    await Promise.all(mainDb.tables.map((t) => t.clear()));
  });
}

describe('Phases 78–95 Platform: Voice Notes, Audit Logs, CRM/Docs Revisions, Workflow Guards & Integrations', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    await clearWorkspaceDbs();
  });

  afterEach(async () => {
    cleanup();
    await clearWorkspaceDbs();
  });

  it('validates voice note MIME allowlist, 5MB cap, project/task persistence, and cascade delete', async () => {
    const validMeta = validateAudioBlobMeta({
      mimeType: 'audio/webm;codecs=opus',
      sizeBytes: 2048,
    });
    expect(validMeta.valid).toBe(true);
    expect(validMeta.normalizedMime).toBe('audio/webm');

    const badMime = validateAudioBlobMeta({ mimeType: 'video/mp4', sizeBytes: 1024 });
    expect(badMime.valid).toBe(false);

    const emptyBlob = validateAudioBlobMeta({ mimeType: 'audio/webm', sizeBytes: 0 });
    expect(emptyBlob.valid).toBe(false);

    const oversized = validateAudioBlobMeta({
      mimeType: 'audio/ogg',
      sizeBytes: VOICE_NOTE_MAX_BYTES + 1,
    });
    expect(oversized.valid).toBe(false);

    const client = await repositories.createClient({
      name: 'Voice Client',
      company: 'Studio',
      email: 'voice@client.test',
      phone: '',
      website: '',
      location: '',
      status: 'active',
      leadStage: 'won',
      contacts: [],
      category: 'Design',
      tags: [],
      notes: '',
      isDemo: false,
    });

    const project = await repositories.createProject({
      clientId: client.id,
      name: 'Audio Brief Project',
      description: '',
      status: 'active',
      priority: 'medium',
      startDate: '2026-01-01',
      dueDate: '2026-02-01',
      budget: 1000,
      agreedValue: 1000,
      currency: 'USD',
      hourlyRate: 100,
      progress: 0,
      milestones: [],
      notes: '',
      isDemo: false,
    });

    const task = await repositories.createTask({
      projectId: project.id,
      clientId: client.id,
      title: 'Record kickoff recap',
      description: '',
      status: 'todo',
      priority: 'medium',
      dueDate: '2026-01-15',
      tags: [],
      subtasks: [],
      completedAt: '',
      isDemo: false,
    });

    const pNote = await repositories.createVoiceNote({
      parentType: 'project',
      parentId: project.id,
      title: 'Project kickoff brief',
      mimeType: 'audio/webm;codecs=opus',
      sizeBytes: 512,
      durationSeconds: 12,
      audioDataUrl: 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibQ==',
      transcript: '',
    });
    const tNote = await repositories.createVoiceNote({
      parentType: 'task',
      parentId: task.id,
      title: 'Task clarification',
      mimeType: 'audio/ogg',
      sizeBytes: 256,
      durationSeconds: 6,
      audioDataUrl: 'data:audio/ogg;base64,T2dnUwACAAAAAAAAAAA=',
      transcript: '',
    });

    expect((await repositories.listVoiceNotes('project', project.id)).map((n) => n.id)).toEqual([
      pNote.id,
    ]);
    expect((await repositories.listVoiceNotes('task', task.id)).map((n) => n.id)).toEqual([tNote.id]);

    // Deleting task removes its voice note cleanly
    await repositories.deleteTask(task.id);
    expect(await repositories.listVoiceNotes('task', task.id)).toHaveLength(0);

    // Deleting project cascades remaining project voice notes
    await repositories.deleteProject(project.id);
    expect(await repositories.listVoiceNotes('project', project.id)).toHaveLength(0);
  });

  it('scrubs secrets in centralized audit logs, enforces workspace isolation, and neutralizes CSV formulas', async () => {
    const evt = await recordStructuredAudit({
      eventType: 'SECURITY_SETTING_CHANGED',
      action: 'settings.test',
      resourceType: 'settings',
      detail: 'Updated webhook config',
      metadata: {
        geminiApiKey: 'AIza-FAKE-SECRET-VALUE',
        bearerToken: 'secret-token-123',
        safeField: 'enabled',
      },
    });

    expect(evt.metadataJson).not.toContain('AIza-FAKE-SECRET-VALUE');
    expect(evt.metadataJson).not.toContain('secret-token-123');
    expect(evt.metadataJson).toContain('[REDACTED]');
    expect(evt.metadataJson).toContain('enabled');

    // Workspace isolation check
    const secondary = await createWorkspaceRecord({ name: 'Secondary Audit WS' });
    await switchActiveWorkspace(secondary.id);
    await recordStructuredAudit({
      eventType: 'WORKSPACE_CREATED',
      action: 'workspace.created',
      resourceType: 'workspace',
      detail: 'Secondary workspace isolated audit entry',
    });
    const secDb = getDatabaseForWorkspace(secondary.id);
    await secDb.open();
    const secCount = await secDb.auditEvents.count();
    expect(secCount).toBeGreaterThanOrEqual(1);

    await switchActiveWorkspace(DEFAULT_WORKSPACE_ID);
    const defaultEvents = await repositories.listAuditEvents();
    expect(defaultEvents.some((e) => e.detail.includes('Secondary workspace isolated'))).toBe(false);

    // CSV formula neutralization
    const csv = buildCsvContent(
      ['eventType', 'detail'],
      [
        ['TEST_EVT', '=CMD("calc")'],
        ['TEST_EVT', '+1+1'],
        ['TEST_EVT', '@SUM(A1:A2)'],
      ]
    );
    expect(csv).toContain("'=CMD");
    expect(csv).toContain("'+1+1");
    expect(csv).toContain("'@SUM");
  });

  it('persists CRM leadStage & contacts, project/task comments & vault attachments, and proposal/contract revisions', async () => {
    const vault = await repositories.saveVaultFile({
      name: 'scope-v1.txt',
      folder: 'Proposals',
      mimeType: 'text/plain',
      sizeBytes: 18,
      classification: 'client_shared',
      sha256: 'abc123',
      version: 1,
      versions: [],
      clientId: '',
      projectId: '',
      shareToken: '',
      tags: [],
      contentDataUrl: 'data:text/plain;base64,U2NvcGU=',
      previewText: 'Scope',
      approvalStatus: 'pending_review',
    });

    const client = await repositories.createClient({
      name: 'Pipeline Lead Corp',
      company: 'Pipeline Co',
      email: 'lead@pipeline.test',
      phone: '',
      website: '',
      location: 'Lahore',
      status: 'lead',
      leadStage: 'proposal_sent',
      contacts: [
        {
          id: 'cnt_1',
          name: 'Ayesha Khan',
          role: 'Product Lead',
          email: 'ayesha@pipeline.test',
          phone: '+92-300-0000000',
          isPrimary: true,
        },
      ],
      category: 'SaaS',
      tags: ['priority'],
      notes: '',
      isDemo: false,
    });

    expect(client.leadStage).toBe('proposal_sent');
    expect(client.contacts).toHaveLength(1);

    const project = await repositories.createProject({
      clientId: client.id,
      name: 'CRM Modernization',
      description: '',
      status: 'active',
      priority: 'high',
      startDate: '2026-01-01',
      dueDate: '2026-03-01',
      budget: 4500,
      agreedValue: 4500,
      currency: 'USD',
      hourlyRate: 90,
      progress: 10,
      milestones: [],
      attachmentVaultIds: [vault.id],
      comments: [
        {
          id: 'cmt_p1',
          author: 'Owner',
          body: 'Initial scope reviewed.',
          createdAt: new Date().toISOString(),
        },
      ],
      notes: '',
      isDemo: false,
    });
    expect(project.attachmentVaultIds).toEqual([vault.id]);
    expect(project.comments).toHaveLength(1);

    const proposal = await repositories.createProposal({
      clientId: client.id,
      projectId: project.id,
      title: 'CRM Revamp Proposal',
      status: 'draft',
      validUntil: '2026-04-01',
      overview: 'Initial draft overview',
      scopeOfWork: 'Full CRM implementation',
      deliverables: ['CRM UI'],
      timeline: '4 weeks',
      pricingAmount: 4500,
      currency: 'USD',
      terms: 'Net 15',
      attachmentVaultIds: [vault.id],
      isDemo: false,
    });
    expect(proposal.revision).toBe(1);

    const updatedProposal = await repositories.updateProposal(proposal.id, {
      overview: 'Revised scope with milestone pricing',
      status: 'sent',
    });
    expect(updatedProposal.revision).toBe(2);
    expect(updatedProposal.revisionHistory.length).toBeGreaterThanOrEqual(1);

    const contract = await repositories.createContract({
      clientId: client.id,
      projectId: project.id,
      title: 'Master Services Agreement',
      templateName: 'Standard',
      effectiveDate: '2026-01-05',
      sections: [{ id: 'sec_1', heading: 'Scope', body: 'Initial terms' }],
      status: 'draft',
      acceptedAt: '',
      attachmentVaultIds: [vault.id],
      isDemo: false,
    });
    expect(contract.revision).toBe(1);

    const updatedContract = await repositories.updateContract(contract.id, {
      status: 'sent',
    });
    expect(updatedContract.revision).toBe(2);
    expect(updatedContract.revisionHistory.length).toBeGreaterThanOrEqual(1);
  });

  it('enforces workflow recursion depth/cycle/rate limits and SSRF-safe Integration Hub adapters', async () => {
    const wf = await repositories.saveCustomWorkflow({
      id: 'wf_guard_1',
      name: 'Overdue Alert',
      description: 'Alert when overdue balance exceeds $100',
      enabled: true,
      triggerType: 'invoice_overdue',
      conditionField: 'balanceDue',
      conditionOperator: 'greater_than',
      conditionValue: '100',
      actionType: 'log_activity',
      actionConfig: { label: 'Flagged overdue invoice' },
      requireApproval: false,
      version: 1,
      lastExecutedAt: '',
    });

    const visited = new Set<string>();
    const first = await evaluateCustomWorkflows({
      triggerType: 'invoice_overdue',
      entityId: 'inv_1',
      payload: { balanceDue: 500 },
      visitedKeys: visited,
      workspaceKey: 'ws_guard_test',
    });
    expect(first.executedWorkflowIds).toEqual([wf.id]);

    // Cycle deduplication skips already visited (workflowId, entityId)
    const cycleRepeat = await evaluateCustomWorkflows({
      triggerType: 'invoice_overdue',
      entityId: 'inv_1',
      payload: { balanceDue: 500 },
      visitedKeys: visited,
      workspaceKey: 'ws_guard_test',
    });
    expect(cycleRepeat.executedWorkflowIds).toEqual([]);
    expect(cycleRepeat.skippedForCycle).toEqual([wf.id]);

    // Depth limit blocks depth >= maxDepth
    const depthBlocked = await evaluateCustomWorkflows({
      triggerType: 'invoice_overdue',
      entityId: 'inv_2',
      payload: { balanceDue: 500 },
      depth: 3,
      maxDepth: 3,
      workspaceKey: 'ws_guard_test',
    });
    expect(depthBlocked.blockedByDepthLimit).toBe(true);

    // Rate limit blocks above maxPerMinute
    const rateBlocked = await evaluateCustomWorkflows({
      triggerType: 'invoice_overdue',
      entityId: 'inv_3',
      payload: { balanceDue: 500 },
      maxPerMinute: 1,
      workspaceKey: 'ws_guard_test',
    });
    expect(rateBlocked.blockedByRateLimit).toBe(true);

    // Integration Hub SSRF protection & honest blocked credentials
    await expect(
      configureIntegrationAdapter({
        provider: 'outbound_webhooks',
        endpointUrl: 'http://127.0.0.1:8080/webhook',
      })
    ).rejects.toThrow();

    await expect(
      configureIntegrationAdapter({
        provider: 'outbound_webhooks',
        endpointUrl: 'http://169.254.169.254/latest/meta-data',
      })
    ).rejects.toThrow();

    const webhookConn = await configureIntegrationAdapter({
      provider: 'outbound_webhooks',
      accountLabel: 'Production Hooks',
      endpointUrl: 'https://hooks.example.com/solodesk',
    });
    expect(webhookConn.status).toBe('configured');

    const oauthConn = await configureIntegrationAdapter({
      provider: 'google_workspace_oauth',
      accountLabel: 'studio@example.com',
    });
    expect(oauthConn.status).toBe('blocked_credentials');
    const retested = await testIntegrationConnection(oauthConn);
    expect(retested.status).toBe('blocked_credentials');
  });

  it('persists privacy consents, includes invoice_explanation/document_summary Copilot templates, and preserves 20-group feature registry', async () => {
    expect(COPILOT_PROMPT_TEMPLATES.invoice_explanation).toBeDefined();
    expect(COPILOT_PROMPT_TEMPLATES.document_summary).toBeDefined();

    const savedConsent = await repositories.savePrivacyConsent({
      consentKey: 'ai_external_processing',
      granted: true,
      purpose: 'Allow session-only Gemini calls',
    });
    expect(savedConsent.granted).toBe(true);

    const list = await repositories.listPrivacyConsents();
    expect(list.find((c) => c.consentKey === 'ai_external_processing')?.granted).toBe(true);

    const audit = await repositories.listAuditEvents();
    expect(audit.some((a) => a.eventType === 'PRIVACY_CONSENT_UPDATED')).toBe(true);

    const registry = validateFeatureRegistry();
    expect(registry.valid).toBe(true);
    expect(registry.totalGroups).toBe(20);
  });
});
