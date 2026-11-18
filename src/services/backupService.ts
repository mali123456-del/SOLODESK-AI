import { z } from 'zod';
import { db } from '../database/db';
import {
  activityEventSchema,
  appointmentSchema,
  appSettingsSchema,
  businessProfileSchema,
  clientPortalLinkSchema,
  clientSchema,
  contractSchema,
  customWorkflowSchema,
  documentChunkSchema,
  financeEntrySchema,
  invoiceSchema,
  knowledgeDocumentSchema,
  notificationItemSchema,
  paymentSchema,
  projectSchema,
  proposalSchema,
  quotationSchema,
  retainerSchema,
  reusableTemplateSchema,
  savedViewSchema,
  securityAuditLogSchema,
  serviceCatalogItemSchema,
  syncQueueItemSchema,
  taskSchema,
  timeEntrySchema,
  vaultFileSchema,
  webhookConfigSchema,
  workflowRunSchema,
  workspaceGoalSchema,
} from '../domain/schemas/entities';

export const CURRENT_BACKUP_SCHEMA_VERSION = 5;
export const DEFAULT_PBKDF2_ITERATIONS = 210_000;

export const backupDataSchema = z.object({
  businessProfile: z.array(businessProfileSchema).default([]),
  appSettings: z.array(appSettingsSchema).default([]),
  clients: z.array(clientSchema).default([]),
  projects: z.array(projectSchema).default([]),
  tasks: z.array(taskSchema).default([]),
  proposals: z.array(proposalSchema).default([]),
  quotations: z.array(quotationSchema).default([]),
  contracts: z.array(contractSchema).default([]),
  invoices: z.array(invoiceSchema).default([]),
  payments: z.array(paymentSchema).default([]),
  financeEntries: z.array(financeEntrySchema).default([]),
  timeEntries: z.array(timeEntrySchema).default([]),
  templates: z.array(reusableTemplateSchema).default([]),
  knowledgeDocs: z.array(knowledgeDocumentSchema).default([]),
  documentChunks: z.array(documentChunkSchema).default([]),
  workflowRuns: z.array(workflowRunSchema).default([]),
  serviceCatalog: z.array(serviceCatalogItemSchema).default([]),
  appointments: z.array(appointmentSchema).default([]),
  workspaceGoals: z.array(workspaceGoalSchema).default([]),
  activities: z.array(activityEventSchema).default([]),
  notifications: z.array(notificationItemSchema).default([]),
  vaultFiles: z.array(vaultFileSchema).optional().default([]),
  clientPortalLinks: z.array(clientPortalLinkSchema).optional().default([]),
  retainers: z.array(retainerSchema).optional().default([]),
  customWorkflows: z.array(customWorkflowSchema).optional().default([]),
  webhooks: z.array(webhookConfigSchema).optional().default([]),
  syncQueue: z.array(syncQueueItemSchema).optional().default([]),
  securityAuditLogs: z.array(securityAuditLogSchema).optional().default([]),
  savedViews: z.array(savedViewSchema).optional().default([]),
});

export const backupPayloadSchema = z.object({
  format: z.literal('solodesk-backup'),
  schemaVersion: z.number().int().min(1).max(CURRENT_BACKUP_SCHEMA_VERSION),
  exportedAt: z.string().min(1),
  recordCounts: z.record(z.string(), z.number().int().min(0)),
  data: backupDataSchema,
});

export type BackupPayload = z.infer<typeof backupPayloadSchema>;

const encryptedEnvelopeSchema = z.object({
  format: z.literal('solodesk-encrypted-backup'),
  version: z.literal(1),
  kdf: z.literal('PBKDF2-SHA256'),
  iterations: z.number().int().min(10000),
  saltB64: z.string().min(1),
  ivB64: z.string().min(1),
  ciphertextB64: z.string().min(1),
});

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array,
  iterations = DEFAULT_PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API is unavailable in this environment.');
  }
  const enc = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptBackupJson(plainJson: string, passphrase: string): Promise<string> {
  if (!passphrase || passphrase.length < 4) {
    throw new Error('Passphrase must be at least 4 characters.');
  }
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const iterations = DEFAULT_PBKDF2_ITERATIONS;
  const key = await deriveAesKey(passphrase, salt, iterations);
  const encoded = new TextEncoder().encode(plainJson);
  const cipherBuf = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    encoded
  );
  const envelope = {
    format: 'solodesk-encrypted-backup' as const,
    version: 1 as const,
    kdf: 'PBKDF2-SHA256' as const,
    iterations,
    saltB64: bytesToBase64(salt),
    ivB64: bytesToBase64(iv),
    ciphertextB64: bytesToBase64(new Uint8Array(cipherBuf)),
  };
  return JSON.stringify(envelope, null, 2);
}

export async function decryptBackupJson(encryptedJson: string, passphrase: string): Promise<string> {
  const parsed = encryptedEnvelopeSchema.parse(JSON.parse(encryptedJson));
  const salt = base64ToBytes(parsed.saltB64);
  const iv = base64ToBytes(parsed.ivB64);
  const ciphertext = base64ToBytes(parsed.ciphertextB64);

  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length === 0) {
    throw new Error('Corrupted encrypted backup metadata (invalid salt or IV length).');
  }

  const key = await deriveAesKey(passphrase, salt, parsed.iterations);
  try {
    const plainBuf = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      ciphertext as unknown as BufferSource
    );
    return new TextDecoder().decode(plainBuf);
  } catch {
    throw new Error('Invalid passphrase or corrupted encrypted backup file.');
  }
}

export async function createBackupPayload(): Promise<BackupPayload> {
  const [
    businessProfile,
    appSettings,
    clients,
    projects,
    tasks,
    proposals,
    quotations,
    contracts,
    invoices,
    payments,
    financeEntries,
    timeEntries,
    templates,
    knowledgeDocs,
    documentChunks,
    workflowRuns,
    serviceCatalog,
    appointments,
    workspaceGoals,
    activities,
    notifications,
    vaultFiles,
    clientPortalLinks,
    retainers,
    customWorkflows,
    webhooks,
    syncQueue,
    securityAuditLogs,
    savedViews,
  ] = await Promise.all([
    db.businessProfile.toArray(),
    db.appSettings.toArray(),
    db.clients.toArray(),
    db.projects.toArray(),
    db.tasks.toArray(),
    db.proposals.toArray(),
    db.quotations.toArray(),
    db.contracts.toArray(),
    db.invoices.toArray(),
    db.payments.toArray(),
    db.financeEntries.toArray(),
    db.timeEntries.toArray(),
    db.templates.toArray(),
    db.knowledgeDocs.toArray(),
    db.documentChunks.toArray(),
    db.workflowRuns.toArray(),
    db.serviceCatalog.toArray(),
    db.appointments.toArray(),
    db.workspaceGoals.toArray(),
    db.activities.toArray(),
    db.notifications.toArray(),
    db.vaultFiles.toArray(),
    db.clientPortalLinks.toArray(),
    db.retainers.toArray(),
    db.customWorkflows.toArray(),
    db.webhooks.toArray(),
    db.syncQueue.toArray(),
    db.securityAuditLogs.toArray(),
    db.savedViews.toArray(),
  ]);

  const data = {
    businessProfile,
    appSettings,
    clients,
    projects,
    tasks,
    proposals,
    quotations,
    contracts,
    invoices,
    payments,
    financeEntries,
    timeEntries,
    templates,
    knowledgeDocs,
    documentChunks,
    workflowRuns,
    serviceCatalog,
    appointments,
    workspaceGoals,
    activities,
    notifications,
    vaultFiles,
    clientPortalLinks,
    retainers,
    customWorkflows,
    webhooks,
    syncQueue,
    securityAuditLogs,
    savedViews,
  };

  const recordCounts: Record<string, number> = {
    clients: clients.length,
    projects: projects.length,
    tasks: tasks.length,
    proposals: proposals.length,
    quotations: quotations.length,
    contracts: contracts.length,
    invoices: invoices.length,
    payments: payments.length,
    financeEntries: financeEntries.length,
    timeEntries: timeEntries.length,
    templates: templates.length,
    knowledgeDocs: knowledgeDocs.length,
    workflowRuns: workflowRuns.length,
    serviceCatalog: serviceCatalog.length,
    appointments: appointments.length,
    workspaceGoals: workspaceGoals.length,
    vaultFiles: vaultFiles.length,
    clientPortalLinks: clientPortalLinks.length,
    retainers: retainers.length,
    customWorkflows: customWorkflows.length,
    webhooks: webhooks.length,
    syncQueue: syncQueue.length,
    securityAuditLogs: securityAuditLogs.length,
    savedViews: savedViews.length,
  };

  return backupPayloadSchema.parse({
    format: 'solodesk-backup',
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    recordCounts,
    data,
  });
}

export interface BackupInspectionResult {
  requiresPassphrase: boolean;
  payload?: BackupPayload;
  conflicts: {
    matchingClientIds: number;
    duplicateInvoiceNumbers: string[];
    invoiceNumberCollisionsAcrossIds: string[];
    matchingProjectIds: number;
    matchingTaskIds: number;
    matchingQuotationIds: number;
    matchingProposalIds: number;
    matchingContractIds: number;
    matchingKnowledgeDocIds: number;
  };
}

export async function inspectBackupText(
  rawText: string,
  passphrase?: string
): Promise<BackupInspectionResult> {
  let rawObj: unknown;
  try {
    rawObj = JSON.parse(rawText);
  } catch {
    throw new Error('Selected file is not valid JSON.');
  }

  const isEncrypted =
    typeof rawObj === 'object' &&
    rawObj !== null &&
    (rawObj as { format?: string }).format === 'solodesk-encrypted-backup';

  let plainText = rawText;
  if (isEncrypted) {
    if (!passphrase) {
      return {
        requiresPassphrase: true,
        conflicts: {
          matchingClientIds: 0,
          duplicateInvoiceNumbers: [],
          invoiceNumberCollisionsAcrossIds: [],
          matchingProjectIds: 0,
          matchingTaskIds: 0,
          matchingQuotationIds: 0,
          matchingProposalIds: 0,
          matchingContractIds: 0,
          matchingKnowledgeDocIds: 0,
        },
      };
    }
    plainText = await decryptBackupJson(rawText, passphrase);
    rawObj = JSON.parse(plainText);
  }

  const payload = backupPayloadSchema.parse(rawObj);

  const [
    existingClients,
    existingInvoices,
    existingProjects,
    existingTasks,
    existingQuotations,
    existingProposals,
    existingContracts,
    existingDocs,
  ] = await Promise.all([
    db.clients.toArray(),
    db.invoices.toArray(),
    db.projects.toArray(),
    db.tasks.toArray(),
    db.quotations.toArray(),
    db.proposals.toArray(),
    db.contracts.toArray(),
    db.knowledgeDocs.toArray(),
  ]);

  const existingClientIds = new Set(existingClients.map((c) => c.id));
  const existingInvoiceByNumber = new Map(existingInvoices.map((i) => [i.number, i.id]));
  const existingProjectIds = new Set(existingProjects.map((p) => p.id));
  const existingTaskIds = new Set(existingTasks.map((t) => t.id));
  const existingQuotationIds = new Set(existingQuotations.map((q) => q.id));
  const existingProposalIds = new Set(existingProposals.map((p) => p.id));
  const existingContractIds = new Set(existingContracts.map((c) => c.id));
  const existingDocIds = new Set(existingDocs.map((d) => d.id));

  const duplicateInvoiceNumbers = payload.data.invoices
    .filter((i) => existingInvoiceByNumber.has(i.number))
    .map((i) => i.number);

  const invoiceNumberCollisionsAcrossIds = payload.data.invoices
    .filter((i) => {
      const existingId = existingInvoiceByNumber.get(i.number);
      return existingId !== undefined && existingId !== i.id;
    })
    .map((i) => i.number);

  return {
    requiresPassphrase: false,
    payload,
    conflicts: {
      matchingClientIds: payload.data.clients.filter((c) => existingClientIds.has(c.id)).length,
      duplicateInvoiceNumbers,
      invoiceNumberCollisionsAcrossIds,
      matchingProjectIds: payload.data.projects.filter((p) => existingProjectIds.has(p.id)).length,
      matchingTaskIds: payload.data.tasks.filter((t) => existingTaskIds.has(t.id)).length,
      matchingQuotationIds: payload.data.quotations.filter((q) => existingQuotationIds.has(q.id)).length,
      matchingProposalIds: payload.data.proposals.filter((p) => existingProposalIds.has(p.id)).length,
      matchingContractIds: payload.data.contracts.filter((c) => existingContractIds.has(c.id)).length,
      matchingKnowledgeDocIds: payload.data.knowledgeDocs.filter((d) => existingDocIds.has(d.id)).length,
    },
  };
}

export async function restoreBackupPayload(
  payload: BackupPayload,
  mode: 'replace' | 'merge'
): Promise<{ safetySnapshot: BackupPayload; renamedInvoiceNumbers: string[] }> {
  const validated = backupPayloadSchema.parse(payload);
  const safetySnapshot = await createBackupPayload();
  const renamedInvoiceNumbers: string[] = [];

  await db.transaction(
    'rw',
    [
      db.businessProfile,
      db.appSettings,
      db.clients,
      db.projects,
      db.tasks,
      db.proposals,
      db.quotations,
      db.contracts,
      db.invoices,
      db.payments,
      db.financeEntries,
      db.timeEntries,
      db.templates,
      db.knowledgeDocs,
      db.documentChunks,
      db.workflowRuns,
      db.serviceCatalog,
      db.appointments,
      db.workspaceGoals,
      db.activities,
      db.notifications,
      db.vaultFiles,
      db.clientPortalLinks,
      db.retainers,
      db.customWorkflows,
      db.webhooks,
      db.syncQueue,
      db.securityAuditLogs,
      db.savedViews,
    ],
    async () => {
      if (mode === 'replace') {
        await Promise.all([
          db.businessProfile.clear(),
          db.appSettings.clear(),
          db.clients.clear(),
          db.projects.clear(),
          db.tasks.clear(),
          db.proposals.clear(),
          db.quotations.clear(),
          db.contracts.clear(),
          db.invoices.clear(),
          db.payments.clear(),
          db.financeEntries.clear(),
          db.timeEntries.clear(),
          db.templates.clear(),
          db.knowledgeDocs.clear(),
          db.documentChunks.clear(),
          db.workflowRuns.clear(),
          db.serviceCatalog.clear(),
          db.appointments.clear(),
          db.workspaceGoals.clear(),
          db.activities.clear(),
          db.notifications.clear(),
          db.vaultFiles.clear(),
          db.clientPortalLinks.clear(),
          db.retainers.clear(),
          db.customWorkflows.clear(),
          db.webhooks.clear(),
          db.syncQueue.clear(),
          db.securityAuditLogs.clear(),
          db.savedViews.clear(),
        ]);
      }

      const d = validated.data;

      // Reconcile unique `&number` index collisions on invoices before bulkPut so merge never aborts with ConstraintError
      let invoicesToWrite = d.invoices;
      if (d.invoices.length > 0) {
        const existingInvoices = mode === 'merge' ? await db.invoices.toArray() : [];
        const usedNumbers = new Map<string, string>(
          existingInvoices.map((inv) => [inv.number, inv.id])
        );
        invoicesToWrite = d.invoices.map((inv) => {
          const ownerId = usedNumbers.get(inv.number);
          if (!ownerId || ownerId === inv.id) {
            usedNumbers.set(inv.number, inv.id);
            return inv;
          }
          let suffix = 1;
          let candidate = `${inv.number}-IMPORT-${suffix}`;
          while (usedNumbers.has(candidate)) {
            suffix += 1;
            candidate = `${inv.number}-IMPORT-${suffix}`;
          }
          usedNumbers.set(candidate, inv.id);
          renamedInvoiceNumbers.push(`${inv.number} -> ${candidate}`);
          return { ...inv, number: candidate };
        });
      }

      if (d.businessProfile.length) await db.businessProfile.bulkPut(d.businessProfile);
      if (d.appSettings.length) await db.appSettings.bulkPut(d.appSettings);
      if (d.clients.length) await db.clients.bulkPut(d.clients);
      if (d.projects.length) await db.projects.bulkPut(d.projects);
      if (d.tasks.length) await db.tasks.bulkPut(d.tasks);
      if (d.proposals.length) await db.proposals.bulkPut(d.proposals);
      if (d.quotations.length) await db.quotations.bulkPut(d.quotations);
      if (d.contracts.length) await db.contracts.bulkPut(d.contracts);
      if (invoicesToWrite.length) await db.invoices.bulkPut(invoicesToWrite);
      if (d.payments.length) await db.payments.bulkPut(d.payments);
      if (d.financeEntries.length) await db.financeEntries.bulkPut(d.financeEntries);
      if (d.timeEntries.length) await db.timeEntries.bulkPut(d.timeEntries);
      if (d.templates.length) await db.templates.bulkPut(d.templates);
      if (d.knowledgeDocs.length) await db.knowledgeDocs.bulkPut(d.knowledgeDocs);
      if (d.documentChunks.length) await db.documentChunks.bulkPut(d.documentChunks);
      if (d.workflowRuns.length) await db.workflowRuns.bulkPut(d.workflowRuns);
      if (d.serviceCatalog.length) await db.serviceCatalog.bulkPut(d.serviceCatalog);
      if (d.appointments.length) await db.appointments.bulkPut(d.appointments);
      if (d.workspaceGoals.length) await db.workspaceGoals.bulkPut(d.workspaceGoals);
      if (d.activities.length) await db.activities.bulkPut(d.activities);
      if (d.notifications.length) await db.notifications.bulkPut(d.notifications);
      if (d.vaultFiles.length) await db.vaultFiles.bulkPut(d.vaultFiles);
      if (d.clientPortalLinks.length) await db.clientPortalLinks.bulkPut(d.clientPortalLinks);
      if (d.retainers.length) await db.retainers.bulkPut(d.retainers);
      if (d.customWorkflows.length) await db.customWorkflows.bulkPut(d.customWorkflows);
      if (d.webhooks.length) await db.webhooks.bulkPut(d.webhooks);
      if (d.syncQueue.length) await db.syncQueue.bulkPut(d.syncQueue);
      if (d.securityAuditLogs.length) await db.securityAuditLogs.bulkPut(d.securityAuditLogs);
      if (d.savedViews.length) await db.savedViews.bulkPut(d.savedViews);
    }
  );

  return { safetySnapshot, renamedInvoiceNumbers };
}

export async function markBackupCompleted(): Promise<void> {
  const existing = await db.appSettings.get('default');
  const now = new Date().toISOString();
  if (existing) {
    await db.appSettings.put({ ...existing, lastBackupAt: now, updatedAt: now });
  }
}
