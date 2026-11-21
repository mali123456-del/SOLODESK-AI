import Big from 'big.js';
import { ReferentialIntegrityError } from '../../core/errors';
import { trackSyncOperation } from '../../core/syncEvents';
import {
  addDaysToDateStr,
  todayDateStr,
} from '../../domain/calculations/dates';
import {
  calculateDocumentTotals,
  calculatePaymentSummary,
  getCurrencyDecimals,
  roundMoney,
} from '../../domain/calculations/money';
import {
  activityEventSchema,
  appointmentSchema,
  appSettingsSchema,
  auditEventSchema,
  businessProfileSchema,
  clientPortalLinkSchema,
  clientSchema,
  contractSchema,
  createId,
  customWorkflowSchema,
  financeEntrySchema,
  integrationConnectionSchema,
  invoiceSchema,
  knowledgeDocumentSchema,
  notificationItemSchema,
  paymentSchema,
  privacyConsentSchema,
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
  VOICE_NOTE_ALLOWED_MIME_TYPES,
  VOICE_NOTE_MAX_BYTES,
  voiceNoteSchema,
  webhookConfigSchema,
  workflowRunSchema,
  workspaceGoalSchema,
  type ActivityEvent,
  type Appointment,
  type AppSettings,
  type AuditEvent,
  type BusinessProfile,
  type Client,
  type ClientPortalLink,
  type Contract,
  type CustomWorkflow,
  type DocumentChunk,
  type FinanceEntry,
  type IntegrationConnection,
  type Invoice,
  type KnowledgeDocument,
  type NotificationItem,
  type Payment,
  type PrivacyConsent,
  type Project,
  type Proposal,
  type Quotation,
  type Retainer,
  type ReusableTemplate,
  type SavedView,
  type SecurityAuditLog,
  type ServiceCatalogItem,
  type SyncQueueItem,
  type Task,
  type TimeEntry,
  type VaultFile,
  type VoiceNote,
  type WebhookConfig,
  type WorkflowRun,
  type WorkflowType,
  type WorkspaceGoal,
} from '../../domain/schemas/entities';
import { type SolodeskDatabase } from '../solodeskDatabase';
import { getActiveWorkspaceDatabase, getActiveWorkspaceIdSync } from '../workspaceManager';
import type { ISolodeskRepositories } from './interfaces';

function nowIso(): string {
  return new Date().toISOString();
}

const AUDIT_SENSITIVE_KEY_RE = /(api[_-]?key|token|secret|password|authorization|gemini|passphrase|cookie)/i;

function scrubAuditMetadataJson(rawJson: string): string {
  try {
    const parsed = JSON.parse(rawJson) as unknown;
    const redact = (val: unknown): unknown => {
      if (Array.isArray(val)) return val.slice(0, 25).map(redact);
      if (val && typeof val === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
          if (AUDIT_SENSITIVE_KEY_RE.test(k)) {
            out[k] = '[REDACTED]';
          } else {
            out[k] = redact(v);
          }
        }
        return out;
      }
      if (typeof val === 'string' && val.length > 400) {
        return `${val.slice(0, 400)}…`;
      }
      return val;
    };
    const serialized = JSON.stringify(redact(parsed));
    return serialized.length > 2048 ? `${serialized.slice(0, 2040)}...` : serialized;
  } catch {
    return '{}';
  }
}

export class DexieSolodeskRepositories implements ISolodeskRepositories {
  private readonly explicitDb: SolodeskDatabase | null;
  private readonly emitSyncEvents: boolean;

  constructor(database?: SolodeskDatabase, emitSyncEvents = !database) {
    this.explicitDb = database ?? null;
    this.emitSyncEvents = emitSyncEvents;
  }

  protected get db(): SolodeskDatabase {
    return this.explicitDb ?? getActiveWorkspaceDatabase();
  }

  withDatabase(database: SolodeskDatabase): DexieSolodeskRepositories {
    if (this.explicitDb === database) return this;
    return new DexieSolodeskRepositories(database, this.emitSyncEvents);
  }

  private runWrite<T>(
    label: string,
    fn: (scoped: DexieSolodeskRepositories, db: SolodeskDatabase) => Promise<T>
  ): Promise<T> {
    const database = this.db;
    const scoped = this.withDatabase(database);
    const exec = () => fn(scoped, database);
    if (!this.emitSyncEvents) return exec();
    return trackSyncOperation(label, exec);
  }

  // --- Profile & Settings ---

  async getBusinessProfile(): Promise<BusinessProfile> {
    const database = this.db;
    const existing = await database.businessProfile.get('default');
    if (existing) return existing;
    const created = businessProfileSchema.parse({
      id: 'default',
      businessName: 'My Freelance Studio',
      ownerName: '',
      email: '',
      phone: '',
      website: '',
      address: '',
      taxIdLabel: '',
      invoiceFooterNote: 'Thank you for your business.',
      paymentInstructions: '',
      updatedAt: nowIso(),
    });
    await database.businessProfile.put(created);
    return created;
  }

  async saveBusinessProfile(input: Partial<BusinessProfile>): Promise<BusinessProfile> {
    const database = this.db;
    return this.runWrite('Save business profile', async () => {
      const scoped = this.withDatabase(database);
      const current = await scoped.getBusinessProfile();
      const updated = businessProfileSchema.parse({
        ...current,
        ...input,
        id: 'default',
        updatedAt: nowIso(),
      });
      await database.businessProfile.put(updated);
      await scoped.logActivity({
        entityType: 'settings',
        entityId: 'default',
        action: 'updated',
        summary: `Updated business profile (${updated.businessName})`,
      });
      return updated;
    });
  }

  async getSettings(databaseOverride?: SolodeskDatabase): Promise<AppSettings> {
    const database = databaseOverride ?? this.db;
    const existing = await database.appSettings.get('default');
    if (existing) return existing;
    const created = appSettingsSchema.parse({
      id: 'default',
      updatedAt: nowIso(),
    });
    await database.appSettings.put(created);
    return created;
  }

  async saveSettings(
    input: Partial<AppSettings>,
    databaseOverride?: SolodeskDatabase
  ): Promise<AppSettings> {
    const database = databaseOverride ?? this.db;
    return this.runWrite('Save workspace settings', async () => {
      const current = await this.getSettings(database);
      const updated = appSettingsSchema.parse({
        ...current,
        ...input,
        id: 'default',
        updatedAt: nowIso(),
      });
      await database.appSettings.put(updated);
      return updated;
    });
  }

  // --- Clients ---

  async listClients(): Promise<Client[]> {
    const all = await this.db.clients.toArray();
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getClient(id: string): Promise<Client | undefined> {
    return this.db.clients.get(id);
  }

  async findDuplicateClients(input: {
    email?: string;
    name?: string;
    excludeId?: string;
  }): Promise<Client[]> {
    const emailNorm = input.email?.trim().toLowerCase() ?? '';
    const nameNorm = input.name?.trim().toLowerCase() ?? '';
    if (!emailNorm && !nameNorm) return [];
    const all = await this.db.clients.toArray();
    return all.filter((c) => {
      if (input.excludeId && c.id === input.excludeId) return false;
      const emailMatch = emailNorm !== '' && c.email.trim().toLowerCase() === emailNorm;
      const nameMatch = nameNorm !== '' && c.name.trim().toLowerCase() === nameNorm;
      return emailMatch || nameMatch;
    });
  }

  async createClient(
    input: Omit<Client, 'id' | 'createdAt' | 'updatedAt' | 'leadStage' | 'contacts'> &
      Partial<Pick<Client, 'leadStage' | 'contacts'>>
  ): Promise<Client> {
    return this.runWrite('Create client', async (scoped, db) => {
      const ts = nowIso();
      const record = clientSchema.parse({
        ...input,
        id: createId('cli'),
        createdAt: ts,
        updatedAt: ts,
      });
      await db.clients.add(record);
      await scoped.logActivity({
        entityType: 'client',
        entityId: record.id,
        action: 'created',
        summary: `Added client ${record.name}${record.company ? ` (${record.company})` : ''}`,
      });
      return record;
    });
  }

  async updateClient(id: string, patch: Partial<Client>): Promise<Client> {
    return this.runWrite('Update client', async (scoped, db) => {
      const existing = await db.clients.get(id);
      if (!existing) throw new Error(`Client ${id} not found.`);
      const updated = clientSchema.parse({
        ...existing,
        ...patch,
        id,
        createdAt: existing.createdAt,
        updatedAt: nowIso(),
      });
      await db.clients.put(updated);
      await scoped.logActivity({
        entityType: 'client',
        entityId: id,
        action: 'updated',
        summary: `Updated client ${updated.name}`,
      });
      return updated;
    });
  }

  async archiveClient(id: string): Promise<Client> {
    return this.updateClient(id, { status: 'archived' });
  }

  // --- Projects ---

  async listProjects(): Promise<Project[]> {
    const all = await this.db.projects.toArray();
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getProject(id: string): Promise<Project | undefined> {
    return this.db.projects.get(id);
  }

  async createProject(
    input: Omit<
      Project,
      | 'id'
      | 'createdAt'
      | 'updatedAt'
      | 'risks'
      | 'okrs'
      | 'members'
      | 'comments'
      | 'attachmentVaultIds'
      | 'isTemplate'
    > &
      Partial<
        Pick<
          Project,
          'risks' | 'okrs' | 'members' | 'comments' | 'attachmentVaultIds' | 'isTemplate'
        >
      >
  ): Promise<Project> {
    return this.runWrite('Create project', async (scoped, db) => {
      const client = await db.clients.get(input.clientId);
      if (!client) throw new Error('Referenced client does not exist.');
      const ts = nowIso();
      const record = projectSchema.parse({
        ...input,
        id: createId('prj'),
        createdAt: ts,
        updatedAt: ts,
      });
      await db.projects.add(record);
      await scoped.logActivity({
        entityType: 'project',
        entityId: record.id,
        action: 'created',
        summary: `Created project "${record.name}" for ${client.name}`,
      });
      return record;
    });
  }

  async updateProject(id: string, patch: Partial<Project>): Promise<Project> {
    return this.runWrite('Update project', async (scoped, db) => {
      const existing = await db.projects.get(id);
      if (!existing) throw new Error(`Project ${id} not found.`);
      if (patch.clientId && patch.clientId !== existing.clientId) {
        const client = await db.clients.get(patch.clientId);
        if (!client) throw new Error('Referenced client does not exist.');
      }
      const updated = projectSchema.parse({
        ...existing,
        ...patch,
        id,
        createdAt: existing.createdAt,
        updatedAt: nowIso(),
      });
      await db.projects.put(updated);
      await scoped.logActivity({
        entityType: 'project',
        entityId: id,
        action: 'updated',
        summary: `Updated project "${updated.name}" (${updated.status})`,
      });
      return updated;
    });
  }

  async deleteProject(id: string): Promise<void> {
    return this.runWrite('Delete project', async (scoped, db) => db.transaction(
      'rw',
      [
        db.projects,
        db.tasks,
        db.timeEntries,
        db.invoices,
        db.proposals,
        db.quotations,
        db.contracts,
        db.financeEntries,
        db.activities,
        db.voiceNotes,
      ],
      async () => {
        const existing = await db.projects.get(id);
        if (!existing) return;

        const linkedInvoices = await db.invoices.where('projectId').equals(id).toArray();
        const blockingInvoices = linkedInvoices.filter((inv) => inv.status !== 'cancelled');
        if (blockingInvoices.length > 0) {
          throw new ReferentialIntegrityError(
            `Cannot delete project "${existing.name}" because ${blockingInvoices.length} active invoice(s) reference it. Archive the project instead.`
          );
        }

        // Safely unlink optional projectId references on child records inside the same atomic transaction
        await Promise.all([
          db.tasks.where('projectId').equals(id).modify({ projectId: '' }),
          db.timeEntries.where('projectId').equals(id).modify({ projectId: '' }),
          db.proposals.where('projectId').equals(id).modify({ projectId: '' }),
          db.quotations.where('projectId').equals(id).modify({ projectId: '' }),
          db.contracts.where('projectId').equals(id).modify({ projectId: '' }),
          db.financeEntries.where('projectId').equals(id).modify({ projectId: '' }),
          db.invoices.where('projectId').equals(id).modify({ projectId: '' }),
          db.voiceNotes.where('[parentType+parentId]').equals(['project', id]).delete(),
        ]);

        await db.projects.delete(id);
        await scoped.logActivity({
          entityType: 'project',
          entityId: id,
          action: 'deleted',
          summary: `Deleted project "${existing.name}" and unlinked child references`,
        });
      }
    ));
  }

  // --- Tasks ---

  async listTasks(): Promise<Task[]> {
    const all = await this.db.tasks.toArray();
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createTask(
    input: Omit<
      Task,
      | 'id'
      | 'createdAt'
      | 'updatedAt'
      | 'assignee'
      | 'comments'
      | 'attachmentVaultIds'
      | 'dependsOnIds'
      | 'estimatedHours'
      | 'recurrenceRule'
      | 'autoPriorityScore'
    > &
      Partial<
        Pick<
          Task,
          | 'assignee'
          | 'comments'
          | 'attachmentVaultIds'
          | 'dependsOnIds'
          | 'estimatedHours'
          | 'recurrenceRule'
          | 'autoPriorityScore'
        >
      >
  ): Promise<Task> {
    return this.runWrite('Create task', async (scoped, db) => {
      if (input.projectId) {
        const prj = await db.projects.get(input.projectId);
        if (!prj) throw new ReferentialIntegrityError('Referenced project does not exist.');
      }
      if (input.clientId) {
        const cli = await db.clients.get(input.clientId);
        if (!cli) throw new ReferentialIntegrityError('Referenced client does not exist.');
      }
      const ts = nowIso();
      const record = taskSchema.parse({
        ...input,
        id: createId('tsk'),
        completedAt: input.status === 'done' ? input.completedAt?.trim() || ts : '',
        createdAt: ts,
        updatedAt: ts,
      });
      await db.tasks.add(record);
      await scoped.logActivity({
        entityType: 'task',
        entityId: record.id,
        action: 'created',
        summary: `Created task "${record.title}"`,
      });
      return record;
    });
  }

  async updateTask(id: string, patch: Partial<Task>): Promise<Task> {
    return this.runWrite('Update task', async (scoped, db) => {
      const existing = await db.tasks.get(id);
      if (!existing) throw new Error(`Task ${id} not found.`);
      if (patch.projectId && patch.projectId !== existing.projectId) {
        const prj = await db.projects.get(patch.projectId);
        if (!prj) throw new ReferentialIntegrityError('Referenced project does not exist.');
      }
      if (patch.clientId && patch.clientId !== existing.clientId) {
        const cli = await db.clients.get(patch.clientId);
        if (!cli) throw new ReferentialIntegrityError('Referenced client does not exist.');
      }
      const ts = nowIso();
      const nextStatus = patch.status ?? existing.status;
      let completedAt = existing.completedAt;
      if (nextStatus === 'done' && existing.status !== 'done') {
        completedAt = patch.completedAt?.trim() || ts;
      } else if (nextStatus === 'done' && existing.status === 'done') {
        completedAt = patch.completedAt !== undefined ? patch.completedAt : existing.completedAt;
      } else if (nextStatus !== 'done') {
        completedAt = '';
      }
      const updated = taskSchema.parse({
        ...existing,
        ...patch,
        id,
        completedAt,
        createdAt: existing.createdAt,
        updatedAt: ts,
      });
      await db.tasks.put(updated);
      if (nextStatus === 'done' && existing.status !== 'done') {
        await scoped.logActivity({
          entityType: 'task',
          entityId: id,
          action: 'completed',
          summary: `Completed task "${updated.title}"`,
        });
      }
      return updated;
    });
  }

  async deleteTask(id: string): Promise<void> {
    return this.runWrite('Delete task', async (_scoped, db) =>
      db.transaction('rw', [db.tasks, db.timeEntries, db.voiceNotes], async () => {
        const existing = await db.tasks.get(id);
        if (!existing) return;
        await db.timeEntries.where('taskId').equals(id).modify({ taskId: '' });
        await db.voiceNotes.where('[parentType+parentId]').equals(['task', id]).delete();
        await db.tasks.delete(id);
      })
    );
  }

  // --- Proposals ---

  async listProposals(): Promise<Proposal[]> {
    const all = await this.db.proposals.toArray();
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createProposal(
    input: Omit<
      Proposal,
      'id' | 'number' | 'createdAt' | 'updatedAt' | 'revision' | 'revisionHistory' | 'attachmentVaultIds'
    > &
      Partial<Pick<Proposal, 'revision' | 'revisionHistory' | 'attachmentVaultIds'>> & {
        number?: string;
      }
  ): Promise<Proposal> {
    return this.runWrite('Create proposal', async (scoped, db) => {
      const client = await db.clients.get(input.clientId);
      if (!client) throw new Error('Referenced client does not exist.');
      return db.transaction(
        'rw',
        db.proposals,
        db.appSettings,
        db.activities,
        async () => {
          const settings = await scoped.getSettings();
          const assignedNumber =
            input.number?.trim() ||
            `${settings.proposalPrefix}${String(settings.nextProposalSequence).padStart(4, '0')}`;
          const ts = nowIso();
          const record = proposalSchema.parse({
            ...input,
            id: createId('prp'),
            number: assignedNumber,
            revision: input.revision ?? 1,
            revisionHistory: input.revisionHistory ?? [
              { version: 1, summary: 'Initial proposal created', savedAt: ts },
            ],
            createdAt: ts,
            updatedAt: ts,
          });
          await db.proposals.add(record);
          if (!input.number?.trim()) {
            await db.appSettings.put({
              ...settings,
              nextProposalSequence: settings.nextProposalSequence + 1,
              updatedAt: ts,
            });
          }
          await scoped.logActivity({
            entityType: 'proposal',
            entityId: record.id,
            action: 'created',
            summary: `Created proposal ${record.number} ("${record.title}")`,
          });
          return record;
        }
      );
    });
  }

  async updateProposal(id: string, patch: Partial<Proposal>): Promise<Proposal> {
    return this.runWrite('Update proposal', async (scoped, db) => {
      const existing = await db.proposals.get(id);
      if (!existing) throw new Error(`Proposal ${id} not found.`);
      const ts = nowIso();
      const substantiveChange =
        patch.title !== undefined ||
        patch.overview !== undefined ||
        patch.scopeOfWork !== undefined ||
        patch.pricingAmount !== undefined ||
        patch.terms !== undefined ||
        patch.deliverables !== undefined ||
        patch.status !== undefined;
      const nextRevision =
        patch.revision ?? (substantiveChange ? (existing.revision ?? 1) + 1 : existing.revision ?? 1);
      const nextHistory =
        patch.revisionHistory ??
        (substantiveChange
          ? [
              ...(existing.revisionHistory ?? []),
              {
                version: nextRevision,
                summary: patch.status && patch.status !== existing.status
                  ? `Status changed to ${patch.status}`
                  : 'Updated proposal scope or pricing',
                savedAt: ts,
              },
            ].slice(-20)
          : existing.revisionHistory ?? []);
      const updated = proposalSchema.parse({
        ...existing,
        ...patch,
        id,
        revision: nextRevision,
        revisionHistory: nextHistory,
        createdAt: existing.createdAt,
        updatedAt: ts,
      });
      await db.proposals.put(updated);
      await scoped.recordAuditEvent({
        eventType: 'PROPOSAL_UPDATED',
        action: 'proposal.updated',
        resourceType: 'proposal',
        resourceId: id,
        detail: `Proposal ${updated.number} updated to v${updated.revision} (${updated.status})`,
      });
      return updated;
    });
  }

  async deleteProposal(id: string): Promise<void> {
    return this.runWrite('Delete proposal', async (_scoped, db) => {
      await db.proposals.delete(id);
    });
  }

  // --- Quotations ---

  async listQuotations(): Promise<Quotation[]> {
    const all = await this.db.quotations.toArray();
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createQuotation(
    input: Omit<Quotation, 'id' | 'number' | 'createdAt' | 'updatedAt'> & { number?: string }
  ): Promise<Quotation> {
    return this.runWrite('Create quotation', async (scoped, db) => {
      const client = await db.clients.get(input.clientId);
      if (!client) throw new Error('Referenced client does not exist.');

      const totals = calculateDocumentTotals(
        {
          lineItems: input.lineItems,
          discountType: input.discountType,
          discountValue: input.discountValue,
          taxRate: input.taxRate,
          taxInclusive: input.taxInclusive,
        },
        getCurrencyDecimals(input.currency)
      );

      return db.transaction(
        'rw',
        db.quotations,
        db.appSettings,
        db.activities,
        async () => {
          const settings = await scoped.getSettings();
          const assignedNumber =
            input.number?.trim() ||
            `${settings.quotationPrefix}${String(settings.nextQuotationSequence).padStart(4, '0')}`;
          const ts = nowIso();
          const record = quotationSchema.parse({
            ...input,
            ...totals,
            id: createId('quo'),
            number: assignedNumber,
            createdAt: ts,
            updatedAt: ts,
          });
          await db.quotations.add(record);
          if (!input.number?.trim()) {
            await db.appSettings.put({
              ...settings,
              nextQuotationSequence: settings.nextQuotationSequence + 1,
              updatedAt: ts,
            });
          }
          await scoped.logActivity({
            entityType: 'quotation',
            entityId: record.id,
            action: 'created',
            summary: `Created quotation ${record.number} for ${client.name}`,
          });
          return record;
        }
      );
    });
  }

  async updateQuotation(id: string, patch: Partial<Quotation>): Promise<Quotation> {
    return this.runWrite('Update quotation', async (_scoped, db) => {
      const existing = await db.quotations.get(id);
      if (!existing) throw new Error(`Quotation ${id} not found.`);
      const merged = { ...existing, ...patch };
      const totals = calculateDocumentTotals(
        {
          lineItems: merged.lineItems,
          discountType: merged.discountType,
          discountValue: merged.discountValue,
          taxRate: merged.taxRate,
          taxInclusive: merged.taxInclusive,
        },
        getCurrencyDecimals(merged.currency)
      );
      const updated = quotationSchema.parse({
        ...merged,
        ...totals,
        id,
        createdAt: existing.createdAt,
        updatedAt: nowIso(),
      });
      await db.quotations.put(updated);
      return updated;
    });
  }

  async convertQuotationToInvoice(
    quotationId: string,
    dueDate: string
  ): Promise<{ quotation: Quotation; invoice: Invoice }> {
    return this.runWrite('Convert quotation to invoice', async (scoped, db) =>
      db.transaction(
        'rw',
        [db.quotations, db.invoices, db.appSettings, db.businessProfile, db.activities],
        async () => {
          const quotation = await db.quotations.get(quotationId);
          if (!quotation) throw new Error(`Quotation ${quotationId} not found.`);
          if (quotation.convertedInvoiceId || quotation.status === 'converted') {
            throw new Error('This quotation has already been converted into an invoice.');
          }

          const existingLinked = await db.invoices
            .where('quotationId')
            .equals(quotationId)
            .first();
          if (existingLinked) {
            throw new Error(`Quotation already linked to invoice ${existingLinked.number}.`);
          }

          const settings = await scoped.getSettings();
          const profile = await scoped.getBusinessProfile();
          let seq = settings.nextInvoiceSequence;
          let invoiceNumber = `${settings.invoicePrefix}${String(seq).padStart(4, '0')}`;
          while (await db.invoices.where('number').equals(invoiceNumber).first()) {
            seq += 1;
            invoiceNumber = `${settings.invoicePrefix}${String(seq).padStart(4, '0')}`;
          }

          const issueDate = todayDateStr();
          const resolvedDue = dueDate || addDaysToDateStr(issueDate, 14);
          const ts = nowIso();
          const invoice = invoiceSchema.parse({
            id: createId('inv'),
            number: invoiceNumber,
            clientId: quotation.clientId,
            projectId: quotation.projectId,
            quotationId: quotation.id,
            issueDate,
            dueDate: resolvedDue,
            currency: quotation.currency,
            lineItems: quotation.lineItems,
            discountType: quotation.discountType,
            discountValue: quotation.discountValue,
            taxRate: quotation.taxRate,
            taxInclusive: quotation.taxInclusive,
            subtotal: quotation.subtotal,
            discountAmount: quotation.discountAmount,
            taxAmount: quotation.taxAmount,
            total: quotation.total,
            amountPaid: 0,
            balanceDue: quotation.total,
            notes: quotation.notes,
            paymentInstructions: profile.paymentInstructions,
            status: 'draft',
            isDemo: quotation.isDemo,
            createdAt: ts,
            updatedAt: ts,
          });

          const updatedQuotation = quotationSchema.parse({
            ...quotation,
            status: 'converted',
            convertedInvoiceId: invoice.id,
            updatedAt: ts,
          });

          await db.invoices.add(invoice);
          await db.quotations.put(updatedQuotation);
          await db.appSettings.put({
            ...settings,
            nextInvoiceSequence: seq + 1,
            updatedAt: ts,
          });
          await scoped.logActivity({
            entityType: 'quotation',
            entityId: quotation.id,
            action: 'converted',
            summary: `Converted quotation ${quotation.number} into invoice ${invoice.number}`,
          });

          return { quotation: updatedQuotation, invoice };
        }
      )
    );
  }

  async deleteQuotation(id: string): Promise<void> {
    return this.runWrite('Delete quotation', async (_scoped, db) => {
      await db.quotations.delete(id);
    });
  }

  // --- Contracts ---

  async listContracts(): Promise<Contract[]> {
    const all = await this.db.contracts.toArray();
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createContract(
    input: Omit<
      Contract,
      'id' | 'number' | 'createdAt' | 'updatedAt' | 'revision' | 'revisionHistory' | 'attachmentVaultIds'
    > &
      Partial<Pick<Contract, 'revision' | 'revisionHistory' | 'attachmentVaultIds'>> & {
        number?: string;
      }
  ): Promise<Contract> {
    return this.runWrite('Create contract', async (scoped, db) => {
      const client = await db.clients.get(input.clientId);
      if (!client) throw new Error('Referenced client does not exist.');
      return db.transaction(
        'rw',
        db.contracts,
        db.appSettings,
        db.activities,
        async () => {
          const settings = await scoped.getSettings();
          const assignedNumber =
            input.number?.trim() ||
            `${settings.contractPrefix}${String(settings.nextContractSequence).padStart(4, '0')}`;
          const ts = nowIso();
          const record = contractSchema.parse({
            ...input,
            id: createId('ctr'),
            number: assignedNumber,
            revision: input.revision ?? 1,
            revisionHistory: input.revisionHistory ?? [
              { version: 1, summary: 'Initial agreement drafted', savedAt: ts },
            ],
            createdAt: ts,
            updatedAt: ts,
          });
          await db.contracts.add(record);
          if (!input.number?.trim()) {
            await db.appSettings.put({
              ...settings,
              nextContractSequence: settings.nextContractSequence + 1,
              updatedAt: ts,
            });
          }
          await scoped.logActivity({
            entityType: 'contract',
            entityId: record.id,
            action: 'created',
            summary: `Created contract ${record.number} ("${record.title}")`,
          });
          return record;
        }
      );
    });
  }

  async updateContract(id: string, patch: Partial<Contract>): Promise<Contract> {
    return this.runWrite('Update contract', async (scoped, db) => {
      const existing = await db.contracts.get(id);
      if (!existing) throw new Error(`Contract ${id} not found.`);
      const ts = nowIso();
      const nextStatus = patch.status ?? existing.status;
      const acceptedAt =
        nextStatus === 'accepted' && !existing.acceptedAt
          ? ts
          : nextStatus !== 'accepted'
            ? ''
            : existing.acceptedAt;
      const substantiveChange =
        patch.title !== undefined ||
        patch.sections !== undefined ||
        patch.status !== undefined ||
        patch.effectiveDate !== undefined;
      const nextRevision =
        patch.revision ?? (substantiveChange ? (existing.revision ?? 1) + 1 : existing.revision ?? 1);
      const nextHistory =
        patch.revisionHistory ??
        (substantiveChange
          ? [
              ...(existing.revisionHistory ?? []),
              {
                version: nextRevision,
                summary: patch.status && patch.status !== existing.status
                  ? `Status changed to ${patch.status}`
                  : 'Updated contract clauses or metadata',
                savedAt: ts,
              },
            ].slice(-20)
          : existing.revisionHistory ?? []);
      const updated = contractSchema.parse({
        ...existing,
        ...patch,
        id,
        acceptedAt,
        revision: nextRevision,
        revisionHistory: nextHistory,
        createdAt: existing.createdAt,
        updatedAt: ts,
      });
      await db.contracts.put(updated);
      await scoped.recordAuditEvent({
        eventType: 'CONTRACT_UPDATED',
        action: 'contract.updated',
        resourceType: 'contract',
        resourceId: id,
        detail: `Contract ${updated.number} updated to v${updated.revision} (${updated.status})`,
      });
      return updated;
    });
  }

  async deleteContract(id: string): Promise<void> {
    return this.runWrite('Delete contract', async (_scoped, db) => {
      await db.contracts.delete(id);
    });
  }

  // --- Invoices & Payments ---

  async listInvoices(): Promise<Invoice[]> {
    const all = await this.db.invoices.toArray();
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    return this.db.invoices.get(id);
  }

  async createInvoice(
    input: Omit<
      Invoice,
      | 'id'
      | 'number'
      | 'amountPaid'
      | 'balanceDue'
      | 'createdAt'
      | 'updatedAt'
      | 'recurrenceRule'
      | 'nextRecurrenceDate'
      | 'exchangeRateToBase'
      | 'paymentSchedule'
    > & { number?: string } & Partial<
        Pick<Invoice, 'recurrenceRule' | 'nextRecurrenceDate' | 'exchangeRateToBase' | 'paymentSchedule'>
      >
  ): Promise<Invoice> {
    return this.runWrite('Create invoice', async (scoped, db) => {
      const client = await db.clients.get(input.clientId);
      if (!client) throw new Error('Referenced client does not exist.');

      if (input.projectId) {
        const prj = await db.projects.get(input.projectId);
        if (!prj) throw new ReferentialIntegrityError('Referenced project does not exist.');
      }

      const decimals = getCurrencyDecimals(input.currency);
      const totals = calculateDocumentTotals(
        {
          lineItems: input.lineItems,
          discountType: input.discountType,
          discountValue: input.discountValue,
          taxRate: input.taxRate,
          taxInclusive: input.taxInclusive,
        },
        decimals
      );

      return db.transaction(
        'rw',
        db.invoices,
        db.appSettings,
        db.activities,
        async () => {
          const settings = await scoped.getSettings();
          let invoiceNumber = input.number?.trim() ?? '';
          let bumpSequence = false;

          if (invoiceNumber) {
            const dup = await db.invoices.where('number').equals(invoiceNumber).first();
            if (dup) {
              throw new Error(`Invoice number "${invoiceNumber}" already exists.`);
            }
          } else {
            let seq = settings.nextInvoiceSequence;
            invoiceNumber = `${settings.invoicePrefix}${String(seq).padStart(4, '0')}`;
            while (await db.invoices.where('number').equals(invoiceNumber).first()) {
              seq += 1;
              invoiceNumber = `${settings.invoicePrefix}${String(seq).padStart(4, '0')}`;
            }
            bumpSequence = true;
            await db.appSettings.put({
              ...settings,
              nextInvoiceSequence: seq + 1,
              updatedAt: nowIso(),
            });
          }

          const ts = nowIso();
          const record = invoiceSchema.parse({
            ...input,
            ...totals,
            id: createId('inv'),
            number: invoiceNumber,
            amountPaid: 0,
            balanceDue: totals.total,
            createdAt: ts,
            updatedAt: ts,
          });
          await db.invoices.add(record);
          await scoped.logActivity({
            entityType: 'invoice',
            entityId: record.id,
            action: bumpSequence ? 'created' : 'created_custom_number',
            summary: `Created invoice ${record.number} for ${client.name}`,
          });
          return record;
        }
      );
    });
  }

  async updateInvoice(id: string, patch: Partial<Invoice>): Promise<Invoice> {
    return this.runWrite('Update invoice', async (scoped, db) =>
      db.transaction(
        'rw',
        [db.invoices, db.payments, db.clients, db.projects, db.activities],
        async () => {
          const existing = await db.invoices.get(id);
          if (!existing) throw new Error(`Invoice ${id} not found.`);

          if (patch.clientId && patch.clientId !== existing.clientId) {
            const cli = await db.clients.get(patch.clientId);
            if (!cli) throw new ReferentialIntegrityError('Referenced client does not exist.');
          }
          if (patch.projectId && patch.projectId !== existing.projectId) {
            const prj = await db.projects.get(patch.projectId);
            if (!prj) throw new ReferentialIntegrityError('Referenced project does not exist.');
          }

          if (patch.number && patch.number.trim() !== existing.number) {
            const dup = await db.invoices.where('number').equals(patch.number.trim()).first();
            if (dup && dup.id !== id) {
              throw new Error(`Invoice number "${patch.number.trim()}" is already in use.`);
            }
          }

          const merged = { ...existing, ...patch };
          const decimals = getCurrencyDecimals(merged.currency);
          const totals = calculateDocumentTotals(
            {
              lineItems: merged.lineItems,
              discountType: merged.discountType,
              discountValue: merged.discountValue,
              taxRate: merged.taxRate,
              taxInclusive: merged.taxInclusive,
            },
            decimals
          );

          const payments = await db.payments.where('invoiceId').equals(id).toArray();
          const summary = calculatePaymentSummary(
            totals.total,
            payments.map((p) => p.amount),
            decimals
          );

          let nextStatus = merged.status;
          if (nextStatus !== 'cancelled' && nextStatus !== 'draft') {
            if (summary.isFullyPaid) nextStatus = 'paid';
            else if (summary.isPartiallyPaid) nextStatus = 'partially_paid';
          }

          const updated = invoiceSchema.parse({
            ...merged,
            ...totals,
            id,
            amountPaid: summary.paidAmount,
            balanceDue: summary.balanceDue,
            status: nextStatus,
            createdAt: existing.createdAt,
            updatedAt: nowIso(),
          });
          await db.invoices.put(updated);
          await scoped.logActivity({
            entityType: 'invoice',
            entityId: id,
            action: 'updated',
            summary: `Updated invoice ${updated.number} (${updated.status})`,
          });
          return updated;
        }
      )
    );
  }

  async refreshOverdueInvoices(referenceDate = todayDateStr()): Promise<number> {
    const database = this.db;
    return database.transaction('rw', [database.invoices], async () => {
      const candidates = await database.invoices
        .where('status')
        .anyOf(['sent', 'partially_paid'])
        .toArray();
      let updatedCount = 0;
      const ts = nowIso();
      for (const inv of candidates) {
        if (inv.dueDate < referenceDate && inv.balanceDue > 0) {
          await database.invoices.put({ ...inv, status: 'overdue', updatedAt: ts });
          updatedCount += 1;
        }
      }
      return updatedCount;
    });
  }

  async deleteInvoice(id: string): Promise<void> {
    return this.runWrite('Delete invoice', async (_scoped, db) => {
      await db.transaction('rw', [db.invoices, db.payments], async () => {
        const linkedPayments = await db.payments.where('invoiceId').equals(id).count();
        if (linkedPayments > 0) {
          throw new Error('Cannot delete an invoice that has recorded payments. Cancel it instead.');
        }
        await db.invoices.delete(id);
      });
    });
  }

  async listPayments(invoiceId?: string): Promise<Payment[]> {
    const list = invoiceId
      ? await this.db.payments.where('invoiceId').equals(invoiceId).toArray()
      : await this.db.payments.toArray();
    return list.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  }

  async recordPayment(
    input: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<{ payment: Payment; invoice: Invoice }> {
    return this.runWrite('Record payment', async (scoped, db) =>
      db.transaction(
        'rw',
        [db.invoices, db.payments, db.financeEntries, db.activities],
        async () => {
          const invoice = await db.invoices.get(input.invoiceId);
          if (!invoice) throw new Error('Selected invoice does not exist.');
          if (invoice.status === 'cancelled') {
            throw new Error('Cannot record payment against a cancelled invoice.');
          }

          const existingPayments = await db.payments
            .where('invoiceId')
            .equals(invoice.id)
            .toArray();

          if (input.reference.trim()) {
            const dupRef = existingPayments.find(
              (p) =>
                p.reference.trim().toLowerCase() === input.reference.trim().toLowerCase() &&
                p.amount === input.amount &&
                p.paymentDate === input.paymentDate
            );
            if (dupRef) {
              throw new Error('A payment with the same reference, amount, and date already exists.');
            }
          }

          const decimals = getCurrencyDecimals(invoice.currency);
          const normalizedAmount = roundMoney(input.amount, decimals);
          const currentSummary = calculatePaymentSummary(
            invoice.total,
            existingPayments.map((p) => p.amount),
            decimals
          );
          if (new Big(normalizedAmount).gt(new Big(currentSummary.balanceDue))) {
            throw new Error(
              `Payment amount exceeds remaining invoice balance (${currentSummary.balanceDue.toFixed(decimals)} ${invoice.currency}).`
            );
          }

          const ts = nowIso();
          const payment = paymentSchema.parse({
            ...input,
            amount: normalizedAmount,
            clientId: invoice.clientId,
            currency: invoice.currency,
            id: createId('pay'),
            createdAt: ts,
            updatedAt: ts,
          });
          await db.payments.add(payment);

          const nextSummary = calculatePaymentSummary(
            invoice.total,
            [...existingPayments.map((p) => p.amount), payment.amount],
            decimals
          );

          const nextStatus = nextSummary.isFullyPaid
            ? 'paid'
            : nextSummary.isPartiallyPaid
              ? 'partially_paid'
              : invoice.status;

          const updatedInvoice = invoiceSchema.parse({
            ...invoice,
            amountPaid: nextSummary.paidAmount,
            balanceDue: nextSummary.balanceDue,
            status: nextStatus,
            updatedAt: ts,
          });
          await db.invoices.put(updatedInvoice);

          const incomeEntry = financeEntrySchema.parse({
            id: createId('fin'),
            type: 'income',
            category: 'Invoice Payment',
            amount: payment.amount,
            currency: invoice.currency,
            date: payment.paymentDate,
            clientId: invoice.clientId,
            projectId: invoice.projectId,
            invoiceId: invoice.id,
            paymentId: payment.id,
            description: `Payment for Invoice ${invoice.number}`,
            notes: payment.reference ? `Ref: ${payment.reference}` : payment.notes,
            isDemo: invoice.isDemo,
            createdAt: ts,
            updatedAt: ts,
          });
          await db.financeEntries.add(incomeEntry);

          await scoped.logActivity({
            entityType: 'payment',
            entityId: payment.id,
            action: 'recorded',
            summary: `Recorded payment of ${payment.amount.toFixed(2)} ${invoice.currency} for ${invoice.number}`,
          });

          return { payment, invoice: updatedInvoice };
        }
      )
    );
  }

  async deletePayment(paymentId: string): Promise<void> {
    return this.runWrite('Delete payment', async (_scoped, db) => {
      await db.transaction(
        'rw',
        [db.payments, db.invoices, db.financeEntries],
        async () => {
          const payment = await db.payments.get(paymentId);
          if (!payment) return;
          await db.payments.delete(paymentId);
          await db.financeEntries.where('paymentId').equals(paymentId).delete();

          const invoice = await db.invoices.get(payment.invoiceId);
          if (invoice) {
            const remaining = await db.payments.where('invoiceId').equals(invoice.id).toArray();
            const summary = calculatePaymentSummary(
              invoice.total,
              remaining.map((p) => p.amount)
            );
            const nextStatus = summary.isFullyPaid
              ? 'paid'
              : summary.isPartiallyPaid
                ? 'partially_paid'
                : invoice.status === 'paid' || invoice.status === 'partially_paid'
                  ? 'sent'
                  : invoice.status;
            await db.invoices.put({
              ...invoice,
              amountPaid: summary.paidAmount,
              balanceDue: summary.balanceDue,
              status: nextStatus,
              updatedAt: nowIso(),
            });
          }
        }
      );
    });
  }

  // --- Finance Entries ---

  async listFinanceEntries(): Promise<FinanceEntry[]> {
    const all = await this.db.financeEntries.toArray();
    return all.sort((a, b) => b.date.localeCompare(a.date));
  }

  async createFinanceEntry(
    input: Omit<
      FinanceEntry,
      | 'id'
      | 'createdAt'
      | 'updatedAt'
      | 'receiptFileName'
      | 'receiptMimeType'
      | 'receiptDataUrl'
      | 'taxProfileName'
      | 'exchangeRateToBase'
    > &
      Partial<
        Pick<
          FinanceEntry,
          'receiptFileName' | 'receiptMimeType' | 'receiptDataUrl' | 'taxProfileName' | 'exchangeRateToBase'
        >
      >
  ): Promise<FinanceEntry> {
    return this.runWrite('Create finance entry', async (scoped, db) => {
      const ts = nowIso();
      const record = financeEntrySchema.parse({
        ...input,
        id: createId('fin'),
        createdAt: ts,
        updatedAt: ts,
      });
      await db.financeEntries.add(record);
      await scoped.logActivity({
        entityType: 'finance',
        entityId: record.id,
        action: 'created',
        summary: `Logged ${record.type}: ${record.description} (${record.amount} ${record.currency})`,
      });
      return record;
    });
  }

  async updateFinanceEntry(id: string, patch: Partial<FinanceEntry>): Promise<FinanceEntry> {
    return this.runWrite('Update finance entry', async (_scoped, db) => {
      const existing = await db.financeEntries.get(id);
      if (!existing) throw new Error(`Finance entry ${id} not found.`);
      const updated = financeEntrySchema.parse({
        ...existing,
        ...patch,
        id,
        createdAt: existing.createdAt,
        updatedAt: nowIso(),
      });
      await db.financeEntries.put(updated);
      return updated;
    });
  }

  async deleteFinanceEntry(id: string): Promise<void> {
    return this.runWrite('Delete finance entry', async (_scoped, db) => {
      await db.financeEntries.delete(id);
    });
  }

  // --- Time Tracking ---

  async listTimeEntries(): Promise<TimeEntry[]> {
    const all = await this.db.timeEntries.toArray();
    return all.sort((a, b) => b.startTime.localeCompare(a.startTime));
  }

  async getRunningTimer(): Promise<TimeEntry | undefined> {
    const all = await this.db.timeEntries.toArray();
    return all.find((t) => t.isRunning);
  }

  async startTimer(input: {
    projectId?: string;
    taskId?: string;
    description: string;
    hourlyRate: number;
    billable: boolean;
  }): Promise<TimeEntry> {
    return this.runWrite('Start timer', async (_scoped, db) =>
      db.transaction(
        'rw',
        [db.timeEntries, db.projects, db.tasks, db.activities],
        async () => {
          if (input.projectId) {
            const prj = await db.projects.get(input.projectId);
            if (!prj) throw new ReferentialIntegrityError('Referenced project does not exist.');
          }
          if (input.taskId) {
            const tsk = await db.tasks.get(input.taskId);
            if (!tsk) throw new ReferentialIntegrityError('Referenced task does not exist.');
          }
          const existingRunning = (await db.timeEntries.toArray()).find((t) => t.isRunning);
          if (existingRunning) {
            throw new Error(
              `A timer is already running ("${existingRunning.description}"). Stop it before starting a new timer.`
            );
          }
          const ts = nowIso();
          const record = timeEntrySchema.parse({
            id: createId('tim'),
            projectId: input.projectId ?? '',
            taskId: input.taskId ?? '',
            description: input.description,
            startTime: ts,
            endTime: '',
            durationSeconds: 0,
            hourlyRate: input.hourlyRate,
            billable: input.billable,
            isRunning: true,
            createdAt: ts,
            updatedAt: ts,
          });
          await db.timeEntries.add(record);
          return record;
        }
      )
    );
  }

  async stopTimer(entryId: string): Promise<TimeEntry> {
    return this.runWrite('Stop timer', async (scoped, db) =>
      db.transaction('rw', [db.timeEntries, db.activities], async () => {
        const entry = await db.timeEntries.get(entryId);
        if (!entry) throw new Error('Timer entry not found.');
        if (!entry.isRunning) return entry;
        const endIso = nowIso();
        const elapsedSec = Math.max(
          1,
          Math.floor((Date.parse(endIso) - Date.parse(entry.startTime)) / 1000)
        );
        const updated = timeEntrySchema.parse({
          ...entry,
          endTime: endIso,
          durationSeconds: elapsedSec,
          isRunning: false,
          updatedAt: endIso,
        });
        await db.timeEntries.put(updated);
        await scoped.logActivity({
          entityType: 'time',
          entityId: updated.id,
          action: 'stopped',
          summary: `Tracked ${Math.round(elapsedSec / 60)}m on "${updated.description}"`,
        });
        return updated;
      })
    );
  }

  async createManualTimeEntry(
    input: Omit<TimeEntry, 'id' | 'isRunning' | 'createdAt' | 'updatedAt'>
  ): Promise<TimeEntry> {
    return this.runWrite('Log manual time entry', async (scoped, db) => {
      if (input.projectId) {
        const prj = await db.projects.get(input.projectId);
        if (!prj) throw new ReferentialIntegrityError('Referenced project does not exist.');
      }
      if (input.taskId) {
        const tsk = await db.tasks.get(input.taskId);
        if (!tsk) throw new ReferentialIntegrityError('Referenced task does not exist.');
      }
      const ts = nowIso();
      const record = timeEntrySchema.parse({
        ...input,
        id: createId('tim'),
        isRunning: false,
        createdAt: ts,
        updatedAt: ts,
      });
      await db.timeEntries.add(record);
      await scoped.logActivity({
        entityType: 'time',
        entityId: record.id,
        action: 'logged',
        summary: `Logged time entry "${record.description}"`,
      });
      return record;
    });
  }

  async deleteTimeEntry(id: string): Promise<void> {
    return this.runWrite('Delete time entry', async (_scoped, db) => {
      await db.timeEntries.delete(id);
    });
  }

  // --- Templates & Knowledge ---

  async listTemplates(): Promise<ReusableTemplate[]> {
    return this.db.templates.toArray();
  }

  async saveTemplate(
    input: Omit<ReusableTemplate, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<ReusableTemplate> {
    return this.runWrite('Save template', async (_scoped, db) => {
      const ts = nowIso();
      const existing = input.id ? await db.templates.get(input.id) : undefined;
      const record = reusableTemplateSchema.parse({
        ...input,
        id: existing?.id ?? input.id ?? createId('tpl'),
        createdAt: existing?.createdAt ?? ts,
        updatedAt: ts,
      });
      await db.templates.put(record);
      return record;
    });
  }

  async deleteTemplate(id: string): Promise<void> {
    return this.runWrite('Delete template', async (_scoped, db) => {
      await db.templates.delete(id);
    });
  }

  async listKnowledgeDocs(): Promise<KnowledgeDocument[]> {
    const all = await this.db.knowledgeDocs.toArray();
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async findKnowledgeDocByHash(contentHash: string): Promise<KnowledgeDocument | undefined> {
    if (!contentHash) return undefined;
    return this.db.knowledgeDocs.where('contentHash').equals(contentHash).first();
  }

  async listDocumentChunks(): Promise<DocumentChunk[]> {
    return this.db.documentChunks.toArray();
  }

  async saveKnowledgeDocWithChunks(
    doc: KnowledgeDocument,
    chunks: DocumentChunk[]
  ): Promise<void> {
    return this.runWrite('Index knowledge document', async (scoped, db) => {
      const parsedDoc = knowledgeDocumentSchema.parse(doc);
      await db.transaction(
        'rw',
        [db.knowledgeDocs, db.documentChunks, db.activities],
        async () => {
          await db.knowledgeDocs.put(parsedDoc);
          await db.documentChunks.where('documentId').equals(parsedDoc.id).delete();
          if (chunks.length > 0) {
            await db.documentChunks.bulkPut(chunks);
          }
          await scoped.logActivity({
            entityType: 'knowledge',
            entityId: parsedDoc.id,
            action: 'indexed',
            summary: `Indexed knowledge document "${parsedDoc.title}" (${chunks.length} chunks)`,
          });
        }
      );
    });
  }

  async deleteKnowledgeDoc(docId: string): Promise<void> {
    return this.runWrite('Delete knowledge document', async (_scoped, db) => {
      await db.transaction('rw', [db.knowledgeDocs, db.documentChunks], async () => {
        await db.documentChunks.where('documentId').equals(docId).delete();
        await db.knowledgeDocs.delete(docId);
      });
    });
  }

  // --- Workflows ---

  async listWorkflowRuns(): Promise<WorkflowRun[]> {
    const all = await this.db.workflowRuns.toArray();
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findExecutedWorkflowRun(
    workflowType: WorkflowType,
    triggerEntityId: string
  ): Promise<WorkflowRun | undefined> {
    const candidates = await this.db.workflowRuns
      .where('triggerEntityId')
      .equals(triggerEntityId)
      .toArray();
    return candidates.find(
      (r) => r.workflowType === workflowType && r.status === 'executed'
    );
  }

  async saveWorkflowRun(run: WorkflowRun): Promise<WorkflowRun> {
    return this.runWrite('Save workflow run', async (_scoped, db) => {
      const parsed = workflowRunSchema.parse(run);
      await db.workflowRuns.put(parsed);
      return parsed;
    });
  }

  // --- Service Catalog ---

  async listServiceCatalog(): Promise<ServiceCatalogItem[]> {
    const all = await this.db.serviceCatalog.toArray();
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }

  async createServiceItem(
    input: Omit<ServiceCatalogItem, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ServiceCatalogItem> {
    return this.runWrite('Create service catalog item', async (scoped, db) => {
      const ts = nowIso();
      const record = serviceCatalogItemSchema.parse({
        ...input,
        id: createId('svc'),
        createdAt: ts,
        updatedAt: ts,
      });
      await db.serviceCatalog.add(record);
      await scoped.logActivity({
        entityType: 'service',
        entityId: record.id,
        action: 'created',
        summary: `Added service package "${record.name}" (${record.currency} ${record.defaultUnitPrice})`,
      });
      return record;
    });
  }

  async updateServiceItem(
    id: string,
    patch: Partial<ServiceCatalogItem>
  ): Promise<ServiceCatalogItem> {
    return this.runWrite('Update service catalog item', async (_scoped, db) => {
      const existing = await db.serviceCatalog.get(id);
      if (!existing) throw new Error(`Service item ${id} not found.`);
      const updated = serviceCatalogItemSchema.parse({
        ...existing,
        ...patch,
        id,
        createdAt: existing.createdAt,
        updatedAt: nowIso(),
      });
      await db.serviceCatalog.put(updated);
      return updated;
    });
  }

  async deleteServiceItem(id: string): Promise<void> {
    return this.runWrite('Delete service catalog item', async (_scoped, db) => {
      await db.serviceCatalog.delete(id);
    });
  }

  // --- Appointments & Meeting Notes ---

  async listAppointments(): Promise<Appointment[]> {
    const all = await this.db.appointments.toArray();
    return all.sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
  }

  async createAppointment(
    input: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Appointment> {
    return this.runWrite('Create appointment', async (scoped, db) => {
      if (input.clientId) {
        const cli = await db.clients.get(input.clientId);
        if (!cli) throw new ReferentialIntegrityError('Referenced client does not exist.');
      }
      if (input.projectId) {
        const prj = await db.projects.get(input.projectId);
        if (!prj) throw new ReferentialIntegrityError('Referenced project does not exist.');
      }
      const ts = nowIso();
      const record = appointmentSchema.parse({
        ...input,
        id: createId('apt'),
        createdAt: ts,
        updatedAt: ts,
      });
      await db.appointments.add(record);
      await scoped.logActivity({
        entityType: 'appointment',
        entityId: record.id,
        action: 'scheduled',
        summary: `Scheduled "${record.title}" on ${record.date} at ${record.startTime}`,
      });
      return record;
    });
  }

  async updateAppointment(id: string, patch: Partial<Appointment>): Promise<Appointment> {
    return this.runWrite('Update appointment', async (_scoped, db) => {
      const existing = await db.appointments.get(id);
      if (!existing) throw new Error(`Appointment ${id} not found.`);
      if (patch.clientId && patch.clientId !== existing.clientId) {
        const cli = await db.clients.get(patch.clientId);
        if (!cli) throw new ReferentialIntegrityError('Referenced client does not exist.');
      }
      if (patch.projectId && patch.projectId !== existing.projectId) {
        const prj = await db.projects.get(patch.projectId);
        if (!prj) throw new ReferentialIntegrityError('Referenced project does not exist.');
      }
      const updated = appointmentSchema.parse({
        ...existing,
        ...patch,
        id,
        createdAt: existing.createdAt,
        updatedAt: nowIso(),
      });
      await db.appointments.put(updated);
      return updated;
    });
  }

  async deleteAppointment(id: string): Promise<void> {
    return this.runWrite('Delete appointment', async (_scoped, db) => {
      await db.appointments.delete(id);
    });
  }

  // --- Monthly Workspace Goals ---

  async listWorkspaceGoals(): Promise<WorkspaceGoal[]> {
    const all = await this.db.workspaceGoals.toArray();
    return all.sort((a, b) => b.monthPrefix.localeCompare(a.monthPrefix));
  }

  async saveWorkspaceGoal(
    input: Omit<WorkspaceGoal, 'id' | 'updatedAt'> & { id?: string }
  ): Promise<WorkspaceGoal> {
    return this.runWrite('Save monthly business goal', async (scoped, db) => {
      const existing = await db.workspaceGoals
        .where('monthPrefix')
        .equals(input.monthPrefix)
        .first();
      const record = workspaceGoalSchema.parse({
        ...existing,
        ...input,
        id: existing?.id ?? input.id ?? createId('gol'),
        updatedAt: nowIso(),
      });
      await db.workspaceGoals.put(record);
      await scoped.logActivity({
        entityType: 'goal',
        entityId: record.id,
        action: existing ? 'updated' : 'created',
        summary: `Set ${record.monthPrefix} revenue goal (${record.currency} ${record.targetRevenue})`,
      });
      return record;
    });
  }

  // --- Activities & Notifications ---

  async listActivities(limit = 100): Promise<ActivityEvent[]> {
    const all = await this.db.activities.toArray();
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  async logActivity(input: Omit<ActivityEvent, 'id' | 'createdAt'>): Promise<ActivityEvent> {
    const event = activityEventSchema.parse({
      ...input,
      id: createId('act'),
      createdAt: nowIso(),
    });
    await this.db.activities.add(event);
    return event;
  }

  async listNotifications(): Promise<NotificationItem[]> {
    const all = await this.db.notifications.toArray();
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async pushNotification(
    input: Omit<NotificationItem, 'id' | 'createdAt' | 'snoozedUntil'> &
      Partial<Pick<NotificationItem, 'snoozedUntil'>>
  ): Promise<NotificationItem> {
    const item = notificationItemSchema.parse({
      ...input,
      id: createId('ntf'),
      createdAt: nowIso(),
    });
    await this.db.notifications.add(item);
    return item;
  }

  async markNotificationRead(id: string): Promise<void> {
    await this.db.notifications.update(id, { read: true });
  }

  async snoozeNotification(id: string, snoozedUntil: string): Promise<void> {
    await this.db.notifications.update(id, { snoozedUntil });
  }

  async markAllNotificationsRead(): Promise<void> {
    await this.db.notifications.toCollection().modify({ read: true });
  }

  // --- Phase 15: Saved Views ---

  async listSavedViews(): Promise<SavedView[]> {
    const all = await this.db.savedViews.toArray();
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async saveSavedView(
    input: Omit<SavedView, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<SavedView> {
    return this.runWrite('Save custom view', async (_scoped, db) => {
      const ts = nowIso();
      const existing = input.id ? await db.savedViews.get(input.id) : undefined;
      const record = savedViewSchema.parse({
        ...existing,
        ...input,
        id: existing?.id ?? input.id ?? createId('viw'),
        createdAt: existing?.createdAt ?? ts,
        updatedAt: ts,
      });
      await db.savedViews.put(record);
      return record;
    });
  }

  async deleteSavedView(id: string): Promise<void> {
    return this.runWrite('Delete custom view', async (_scoped, db) => {
      await db.savedViews.delete(id);
    });
  }

  // --- Phase 16: Client Portal Links ---

  async listClientPortalLinks(): Promise<ClientPortalLink[]> {
    const all = await this.db.clientPortalLinks.toArray();
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getClientPortalLinkByToken(token: string): Promise<ClientPortalLink | undefined> {
    return this.db.clientPortalLinks.where('token').equals(token).first();
  }

  async saveClientPortalLink(
    input: Omit<ClientPortalLink, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<ClientPortalLink> {
    return this.runWrite('Save client portal link', async (scoped, db) => {
      const cli = await db.clients.get(input.clientId);
      if (!cli) throw new ReferentialIntegrityError('Referenced client does not exist.');
      const ts = nowIso();
      const existing = input.id ? await db.clientPortalLinks.get(input.id) : undefined;
      const record = clientPortalLinkSchema.parse({
        ...existing,
        ...input,
        id: existing?.id ?? input.id ?? createId('cpl'),
        createdAt: existing?.createdAt ?? ts,
        updatedAt: ts,
      });
      await db.clientPortalLinks.put(record);
      await scoped.logActivity({
        entityType: 'portal',
        entityId: record.id,
        action: existing ? 'updated' : 'created',
        summary: `${existing ? 'Updated' : 'Created'} client portal link "${record.label}" for ${cli.name}`,
      });
      return record;
    });
  }

  async deleteClientPortalLink(id: string): Promise<void> {
    return this.runWrite('Delete client portal link', async (_scoped, db) => {
      await db.clientPortalLinks.delete(id);
    });
  }

  // --- Phase 18: Retainers ---

  async listRetainers(): Promise<Retainer[]> {
    const all = await this.db.retainers.toArray();
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async saveRetainer(
    input: Omit<Retainer, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<Retainer> {
    return this.runWrite('Save retainer', async (scoped, db) => {
      const cli = await db.clients.get(input.clientId);
      if (!cli) throw new ReferentialIntegrityError('Referenced client does not exist.');
      const ts = nowIso();
      const existing = input.id ? await db.retainers.get(input.id) : undefined;
      const record = retainerSchema.parse({
        ...existing,
        ...input,
        id: existing?.id ?? input.id ?? createId('ret'),
        createdAt: existing?.createdAt ?? ts,
        updatedAt: ts,
      });
      await db.retainers.put(record);
      await scoped.logActivity({
        entityType: 'retainer',
        entityId: record.id,
        action: existing ? 'updated' : 'created',
        summary: `${existing ? 'Updated' : 'Created'} retainer "${record.title}" (${record.currency} ${record.monthlyAmount}/mo)`,
      });
      return record;
    });
  }

  async deleteRetainer(id: string): Promise<void> {
    return this.runWrite('Delete retainer', async (_scoped, db) => {
      await db.retainers.delete(id);
    });
  }

  // --- Phase 19: Document Vault ---

  async listVaultFiles(): Promise<VaultFile[]> {
    const all = await this.db.vaultFiles.toArray();
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async saveVaultFile(
    input: Omit<VaultFile, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<VaultFile> {
    return this.runWrite('Save vault document', async (scoped, db) => {
      const ts = nowIso();
      const existing = input.id ? await db.vaultFiles.get(input.id) : undefined;
      const record = vaultFileSchema.parse({
        ...existing,
        ...input,
        id: existing?.id ?? input.id ?? createId('vlt'),
        createdAt: existing?.createdAt ?? ts,
        updatedAt: ts,
      });
      await db.vaultFiles.put(record);
      await scoped.logActivity({
        entityType: 'vault',
        entityId: record.id,
        action: existing ? 'updated' : 'uploaded',
        summary: `${existing ? 'Updated' : 'Stored'} vault file "${record.name}" (v${record.version})`,
      });
      return record;
    });
  }

  async deleteVaultFile(id: string): Promise<void> {
    return this.runWrite('Delete vault document', async (_scoped, db) => {
      await db.vaultFiles.delete(id);
    });
  }

  // --- Phase 21: Custom Workflows & Webhooks ---

  async listCustomWorkflows(): Promise<CustomWorkflow[]> {
    const all = await this.db.customWorkflows.toArray();
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async saveCustomWorkflow(
    input: Omit<CustomWorkflow, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<CustomWorkflow> {
    return this.runWrite('Save custom workflow', async (_scoped, db) => {
      const ts = nowIso();
      const existing = input.id ? await db.customWorkflows.get(input.id) : undefined;
      const record = customWorkflowSchema.parse({
        ...existing,
        ...input,
        id: existing?.id ?? input.id ?? createId('cwf'),
        createdAt: existing?.createdAt ?? ts,
        updatedAt: ts,
      });
      await db.customWorkflows.put(record);
      return record;
    });
  }

  async deleteCustomWorkflow(id: string): Promise<void> {
    return this.runWrite('Delete custom workflow', async (_scoped, db) => {
      await db.customWorkflows.delete(id);
    });
  }

  async listWebhooks(): Promise<WebhookConfig[]> {
    const all = await this.db.webhooks.toArray();
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async saveWebhook(
    input: Omit<WebhookConfig, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<WebhookConfig> {
    return this.runWrite('Save webhook config', async (_scoped, db) => {
      const ts = nowIso();
      const existing = input.id ? await db.webhooks.get(input.id) : undefined;
      const record = webhookConfigSchema.parse({
        ...existing,
        ...input,
        id: existing?.id ?? input.id ?? createId('whk'),
        createdAt: existing?.createdAt ?? ts,
        updatedAt: ts,
      });
      await db.webhooks.put(record);
      return record;
    });
  }

  async deleteWebhook(id: string): Promise<void> {
    return this.runWrite('Delete webhook config', async (_scoped, db) => {
      await db.webhooks.delete(id);
    });
  }

  // --- Phase 23: Cloud Sync Queue ---

  async listSyncQueue(): Promise<SyncQueueItem[]> {
    const all = await this.db.syncQueue.toArray();
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async enqueueSyncItem(
    input: Omit<SyncQueueItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<SyncQueueItem> {
    const ts = nowIso();
    const record = syncQueueItemSchema.parse({
      ...input,
      id: input.id ?? createId('syq'),
      createdAt: ts,
      updatedAt: ts,
    });
    await this.db.syncQueue.put(record);
    return record;
  }

  async updateSyncQueueItem(id: string, patch: Partial<SyncQueueItem>): Promise<SyncQueueItem> {
    const database = this.db;
    const existing = await database.syncQueue.get(id);
    if (!existing) throw new Error(`Sync queue item ${id} not found.`);
    const updated = syncQueueItemSchema.parse({
      ...existing,
      ...patch,
      id,
      createdAt: existing.createdAt,
      updatedAt: nowIso(),
    });
    await database.syncQueue.put(updated);
    return updated;
  }

  async clearAckedSyncItems(): Promise<void> {
    await this.db.syncQueue.where('status').equals('acked').delete();
  }

  // --- Phase 24: Security Audit Logs ---

  async listSecurityAuditLogs(limit = 200): Promise<SecurityAuditLog[]> {
    const all = await this.db.securityAuditLogs.toArray();
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  async logSecurityEvent(
    input: Omit<SecurityAuditLog, 'id' | 'createdAt'>
  ): Promise<SecurityAuditLog> {
    const record = securityAuditLogSchema.parse({
      ...input,
      id: createId('sec'),
      createdAt: nowIso(),
    });
    await this.db.securityAuditLogs.add(record);
    return record;
  }

  // --- Phase 82.1: Voice Notes ---

  async listVoiceNotes(parentType?: 'project' | 'task', parentId?: string): Promise<VoiceNote[]> {
    const all =
      parentType && parentId
        ? await this.db.voiceNotes.where('[parentType+parentId]').equals([parentType, parentId]).toArray()
        : await this.db.voiceNotes.toArray();
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createVoiceNote(
    input: Omit<VoiceNote, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<VoiceNote> {
    return this.runWrite('Save voice note', async (scoped, db) => {
      const normalizedMime = input.mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
      if (
        !(VOICE_NOTE_ALLOWED_MIME_TYPES as readonly string[]).includes(normalizedMime)
      ) {
        throw new ReferentialIntegrityError(
          `Unsupported audio format "${input.mimeType}". Allowed: ${VOICE_NOTE_ALLOWED_MIME_TYPES.join(', ')}.`
        );
      }
      if (input.sizeBytes <= 0 || input.sizeBytes > VOICE_NOTE_MAX_BYTES) {
        throw new ReferentialIntegrityError(
          `Voice note size (${input.sizeBytes} bytes) exceeds the 5 MB limit.`
        );
      }
      if (input.parentType === 'project') {
        const prj = await db.projects.get(input.parentId);
        if (!prj) throw new ReferentialIntegrityError('Referenced project does not exist.');
      } else {
        const tsk = await db.tasks.get(input.parentId);
        if (!tsk) throw new ReferentialIntegrityError('Referenced task does not exist.');
      }
      const ts = nowIso();
      const record = voiceNoteSchema.parse({
        ...input,
        mimeType: normalizedMime,
        id: createId('vcn'),
        createdAt: ts,
        updatedAt: ts,
      });
      await db.voiceNotes.add(record);
      await scoped.recordAuditEvent({
        eventType: 'VOICE_NOTE_CREATED',
        action: 'voice_note.created',
        resourceType: input.parentType,
        resourceId: input.parentId,
        detail: `Recorded voice note "${record.title}" (${Math.round(record.durationSeconds)}s)`,
      });
      return record;
    });
  }

  async deleteVoiceNote(id: string): Promise<void> {
    return this.runWrite('Delete voice note', async (scoped, db) => {
      const existing = await db.voiceNotes.get(id);
      if (!existing) return;
      await db.voiceNotes.delete(id);
      await scoped.recordAuditEvent({
        eventType: 'VOICE_NOTE_DELETED',
        action: 'voice_note.deleted',
        resourceType: existing.parentType,
        resourceId: existing.parentId,
        detail: `Deleted voice note "${existing.title}"`,
      });
    });
  }

  // --- Phase 85: Centralized Audit Events (Immutable Append-Only) ---

  async listAuditEvents(limit = 500): Promise<AuditEvent[]> {
    const all = await this.db.auditEvents.toArray();
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  async recordAuditEvent(
    input: Omit<
      AuditEvent,
      | 'id'
      | 'createdAt'
      | 'workspaceId'
      | 'actorId'
      | 'actorEmail'
      | 'outcome'
      | 'correlationId'
      | 'severity'
      | 'metadataJson'
    > &
      Partial<
        Pick<
          AuditEvent,
          'workspaceId' | 'actorId' | 'actorEmail' | 'outcome' | 'correlationId' | 'severity' | 'metadataJson'
        >
      >
  ): Promise<AuditEvent> {
    const wsId = input.workspaceId?.trim() || getActiveWorkspaceIdSync();
    const record = auditEventSchema.parse({
      ...input,
      workspaceId: wsId,
      actorId: input.actorId ?? 'local-owner',
      actorEmail: input.actorEmail ?? 'owner@local.workspace',
      outcome: input.outcome ?? 'success',
      correlationId: input.correlationId ?? createId('cor'),
      severity: input.severity ?? 'info',
      metadataJson: scrubAuditMetadataJson(input.metadataJson ?? '{}'),
      id: createId('aud'),
      createdAt: nowIso(),
    });
    await this.db.auditEvents.add(record);
    return record;
  }

  // --- Phase 89: Integration Hub Connections ---

  async listIntegrationConnections(): Promise<IntegrationConnection[]> {
    const all = await this.db.integrationConnections.toArray();
    return all.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  async saveIntegrationConnection(
    input: Omit<IntegrationConnection, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<IntegrationConnection> {
    return this.runWrite('Save integration connection', async (scoped, db) => {
      const ts = nowIso();
      const existing =
        (input.id ? await db.integrationConnections.get(input.id) : undefined) ??
        (await db.integrationConnections.where('provider').equals(input.provider).first());
      const record = integrationConnectionSchema.parse({
        ...existing,
        ...input,
        id: existing?.id ?? input.id ?? createId('int'),
        createdAt: existing?.createdAt ?? ts,
        updatedAt: ts,
      });
      await db.integrationConnections.put(record);
      await scoped.recordAuditEvent({
        eventType: 'INTEGRATION_UPDATED',
        action: 'integration.updated',
        resourceType: 'integration',
        resourceId: record.provider,
        detail: `Integration "${record.displayName}" status set to ${record.status}`,
      });
      return record;
    });
  }

  async deleteIntegrationConnection(id: string): Promise<void> {
    return this.runWrite('Delete integration connection', async (_scoped, db) => {
      await db.integrationConnections.delete(id);
    });
  }

  // --- Phase 93: Privacy Consents ---

  async listPrivacyConsents(): Promise<PrivacyConsent[]> {
    const all = await this.db.privacyConsents.toArray();
    return all.sort((a, b) => a.consentKey.localeCompare(b.consentKey));
  }

  async savePrivacyConsent(
    input: Omit<PrivacyConsent, 'id' | 'updatedAt'> & { id?: string }
  ): Promise<PrivacyConsent> {
    return this.runWrite('Save privacy consent', async (scoped, db) => {
      const existing =
        (input.id ? await db.privacyConsents.get(input.id) : undefined) ??
        (await db.privacyConsents.where('consentKey').equals(input.consentKey).first());
      const ts = nowIso();
      const record = privacyConsentSchema.parse({
        ...existing,
        ...input,
        id: existing?.id ?? input.id ?? createId('pvc'),
        updatedAt: ts,
      });
      await db.privacyConsents.put(record);
      await scoped.recordAuditEvent({
        eventType: 'PRIVACY_CONSENT_UPDATED',
        action: 'privacy.consent_updated',
        resourceType: 'privacy_consent',
        resourceId: record.consentKey,
        detail: `Privacy consent "${record.consentKey}" ${record.granted ? 'granted' : 'revoked'}`,
      });
      return record;
    });
  }
}

export const repositories = new DexieSolodeskRepositories();
