import {
  addDaysToDateStr,
  todayDateStr,
} from '../../domain/calculations/dates';
import {
  calculateDocumentTotals,
  calculatePaymentSummary,
} from '../../domain/calculations/money';
import {
  activityEventSchema,
  appSettingsSchema,
  businessProfileSchema,
  clientSchema,
  contractSchema,
  createId,
  financeEntrySchema,
  invoiceSchema,
  knowledgeDocumentSchema,
  notificationItemSchema,
  paymentSchema,
  projectSchema,
  proposalSchema,
  quotationSchema,
  reusableTemplateSchema,
  taskSchema,
  timeEntrySchema,
  type ActivityEvent,
  type AppSettings,
  type BusinessProfile,
  type Client,
  type Contract,
  type DocumentChunk,
  type FinanceEntry,
  type Invoice,
  type KnowledgeDocument,
  type NotificationItem,
  type Payment,
  type Project,
  type Proposal,
  type Quotation,
  type ReusableTemplate,
  type Task,
  type TimeEntry,
} from '../../domain/schemas/entities';
import { db as defaultDb, type SolodeskDatabase } from '../db';
import type { ISolodeskRepositories } from './interfaces';

function nowIso(): string {
  return new Date().toISOString();
}

export class DexieSolodeskRepositories implements ISolodeskRepositories {
  private readonly db: SolodeskDatabase;

  constructor(database: SolodeskDatabase = defaultDb) {
    this.db = database;
  }

  // --- Profile & Settings ---

  async getBusinessProfile(): Promise<BusinessProfile> {
    const existing = await this.db.businessProfile.get('default');
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
    await this.db.businessProfile.put(created);
    return created;
  }

  async saveBusinessProfile(input: Partial<BusinessProfile>): Promise<BusinessProfile> {
    const current = await this.getBusinessProfile();
    const updated = businessProfileSchema.parse({
      ...current,
      ...input,
      id: 'default',
      updatedAt: nowIso(),
    });
    await this.db.businessProfile.put(updated);
    await this.logActivity({
      entityType: 'settings',
      entityId: 'default',
      action: 'updated',
      summary: `Updated business profile (${updated.businessName})`,
    });
    return updated;
  }

  async getSettings(): Promise<AppSettings> {
    const existing = await this.db.appSettings.get('default');
    if (existing) return existing;
    const created = appSettingsSchema.parse({
      id: 'default',
      updatedAt: nowIso(),
    });
    await this.db.appSettings.put(created);
    return created;
  }

  async saveSettings(input: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    const updated = appSettingsSchema.parse({
      ...current,
      ...input,
      id: 'default',
      updatedAt: nowIso(),
    });
    await this.db.appSettings.put(updated);
    return updated;
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

  async createClient(input: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>): Promise<Client> {
    const ts = nowIso();
    const record = clientSchema.parse({
      ...input,
      id: createId('cli'),
      createdAt: ts,
      updatedAt: ts,
    });
    await this.db.clients.add(record);
    await this.logActivity({
      entityType: 'client',
      entityId: record.id,
      action: 'created',
      summary: `Added client ${record.name}${record.company ? ` (${record.company})` : ''}`,
    });
    return record;
  }

  async updateClient(id: string, patch: Partial<Client>): Promise<Client> {
    const existing = await this.db.clients.get(id);
    if (!existing) throw new Error(`Client ${id} not found.`);
    const updated = clientSchema.parse({
      ...existing,
      ...patch,
      id,
      createdAt: existing.createdAt,
      updatedAt: nowIso(),
    });
    await this.db.clients.put(updated);
    await this.logActivity({
      entityType: 'client',
      entityId: id,
      action: 'updated',
      summary: `Updated client ${updated.name}`,
    });
    return updated;
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

  async createProject(input: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const client = await this.db.clients.get(input.clientId);
    if (!client) throw new Error('Referenced client does not exist.');
    const ts = nowIso();
    const record = projectSchema.parse({
      ...input,
      id: createId('prj'),
      createdAt: ts,
      updatedAt: ts,
    });
    await this.db.projects.add(record);
    await this.logActivity({
      entityType: 'project',
      entityId: record.id,
      action: 'created',
      summary: `Created project "${record.name}" for ${client.name}`,
    });
    return record;
  }

  async updateProject(id: string, patch: Partial<Project>): Promise<Project> {
    const existing = await this.db.projects.get(id);
    if (!existing) throw new Error(`Project ${id} not found.`);
    if (patch.clientId && patch.clientId !== existing.clientId) {
      const client = await this.db.clients.get(patch.clientId);
      if (!client) throw new Error('Referenced client does not exist.');
    }
    const updated = projectSchema.parse({
      ...existing,
      ...patch,
      id,
      createdAt: existing.createdAt,
      updatedAt: nowIso(),
    });
    await this.db.projects.put(updated);
    await this.logActivity({
      entityType: 'project',
      entityId: id,
      action: 'updated',
      summary: `Updated project "${updated.name}" (${updated.status})`,
    });
    return updated;
  }

  async deleteProject(id: string): Promise<void> {
    const existing = await this.db.projects.get(id);
    if (!existing) return;
    await this.db.projects.delete(id);
    await this.logActivity({
      entityType: 'project',
      entityId: id,
      action: 'deleted',
      summary: `Deleted project "${existing.name}"`,
    });
  }

  // --- Tasks ---

  async listTasks(): Promise<Task[]> {
    const all = await this.db.tasks.toArray();
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createTask(input: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    if (input.projectId) {
      const prj = await this.db.projects.get(input.projectId);
      if (!prj) throw new Error('Referenced project does not exist.');
    }
    const ts = nowIso();
    const record = taskSchema.parse({
      ...input,
      id: createId('tsk'),
      completedAt: input.status === 'done' ? ts : '',
      createdAt: ts,
      updatedAt: ts,
    });
    await this.db.tasks.add(record);
    await this.logActivity({
      entityType: 'task',
      entityId: record.id,
      action: 'created',
      summary: `Created task "${record.title}"`,
    });
    return record;
  }

  async updateTask(id: string, patch: Partial<Task>): Promise<Task> {
    const existing = await this.db.tasks.get(id);
    if (!existing) throw new Error(`Task ${id} not found.`);
    const ts = nowIso();
    const nextStatus = patch.status ?? existing.status;
    let completedAt = existing.completedAt;
    if (nextStatus === 'done' && existing.status !== 'done') {
      completedAt = ts;
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
    await this.db.tasks.put(updated);
    if (nextStatus === 'done' && existing.status !== 'done') {
      await this.logActivity({
        entityType: 'task',
        entityId: id,
        action: 'completed',
        summary: `Completed task "${updated.title}"`,
      });
    }
    return updated;
  }

  async deleteTask(id: string): Promise<void> {
    const existing = await this.db.tasks.get(id);
    if (!existing) return;
    await this.db.tasks.delete(id);
  }

  // --- Proposals ---

  async listProposals(): Promise<Proposal[]> {
    const all = await this.db.proposals.toArray();
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createProposal(
    input: Omit<Proposal, 'id' | 'number' | 'createdAt' | 'updatedAt'> & { number?: string }
  ): Promise<Proposal> {
    const client = await this.db.clients.get(input.clientId);
    if (!client) throw new Error('Referenced client does not exist.');
    return this.db.transaction(
      'rw',
      this.db.proposals,
      this.db.appSettings,
      this.db.activities,
      async () => {
        const settings = await this.getSettings();
        const assignedNumber =
          input.number?.trim() ||
          `${settings.proposalPrefix}${String(settings.nextProposalSequence).padStart(4, '0')}`;
        const ts = nowIso();
        const record = proposalSchema.parse({
          ...input,
          id: createId('prp'),
          number: assignedNumber,
          createdAt: ts,
          updatedAt: ts,
        });
        await this.db.proposals.add(record);
        if (!input.number?.trim()) {
          await this.db.appSettings.put({
            ...settings,
            nextProposalSequence: settings.nextProposalSequence + 1,
            updatedAt: ts,
          });
        }
        await this.logActivity({
          entityType: 'proposal',
          entityId: record.id,
          action: 'created',
          summary: `Created proposal ${record.number} ("${record.title}")`,
        });
        return record;
      }
    );
  }

  async updateProposal(id: string, patch: Partial<Proposal>): Promise<Proposal> {
    const existing = await this.db.proposals.get(id);
    if (!existing) throw new Error(`Proposal ${id} not found.`);
    const updated = proposalSchema.parse({
      ...existing,
      ...patch,
      id,
      createdAt: existing.createdAt,
      updatedAt: nowIso(),
    });
    await this.db.proposals.put(updated);
    return updated;
  }

  async deleteProposal(id: string): Promise<void> {
    await this.db.proposals.delete(id);
  }

  // --- Quotations ---

  async listQuotations(): Promise<Quotation[]> {
    const all = await this.db.quotations.toArray();
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createQuotation(
    input: Omit<Quotation, 'id' | 'number' | 'createdAt' | 'updatedAt'> & { number?: string }
  ): Promise<Quotation> {
    const client = await this.db.clients.get(input.clientId);
    if (!client) throw new Error('Referenced client does not exist.');

    const totals = calculateDocumentTotals({
      lineItems: input.lineItems,
      discountType: input.discountType,
      discountValue: input.discountValue,
      taxRate: input.taxRate,
      taxInclusive: input.taxInclusive,
    });

    return this.db.transaction(
      'rw',
      this.db.quotations,
      this.db.appSettings,
      this.db.activities,
      async () => {
        const settings = await this.getSettings();
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
        await this.db.quotations.add(record);
        if (!input.number?.trim()) {
          await this.db.appSettings.put({
            ...settings,
            nextQuotationSequence: settings.nextQuotationSequence + 1,
            updatedAt: ts,
          });
        }
        await this.logActivity({
          entityType: 'quotation',
          entityId: record.id,
          action: 'created',
          summary: `Created quotation ${record.number} for ${client.name}`,
        });
        return record;
      }
    );
  }

  async updateQuotation(id: string, patch: Partial<Quotation>): Promise<Quotation> {
    const existing = await this.db.quotations.get(id);
    if (!existing) throw new Error(`Quotation ${id} not found.`);
    const merged = { ...existing, ...patch };
    const totals = calculateDocumentTotals({
      lineItems: merged.lineItems,
      discountType: merged.discountType,
      discountValue: merged.discountValue,
      taxRate: merged.taxRate,
      taxInclusive: merged.taxInclusive,
    });
    const updated = quotationSchema.parse({
      ...merged,
      ...totals,
      id,
      createdAt: existing.createdAt,
      updatedAt: nowIso(),
    });
    await this.db.quotations.put(updated);
    return updated;
  }

  async convertQuotationToInvoice(
    quotationId: string,
    dueDate: string
  ): Promise<{ quotation: Quotation; invoice: Invoice }> {
    return this.db.transaction(
      'rw',
      [this.db.quotations, this.db.invoices, this.db.appSettings, this.db.businessProfile, this.db.activities],
      async () => {
        const quotation = await this.db.quotations.get(quotationId);
        if (!quotation) throw new Error(`Quotation ${quotationId} not found.`);
        if (quotation.convertedInvoiceId || quotation.status === 'converted') {
          throw new Error('This quotation has already been converted into an invoice.');
        }

        const existingLinked = await this.db.invoices
          .where('quotationId')
          .equals(quotationId)
          .first();
        if (existingLinked) {
          throw new Error(`Quotation already linked to invoice ${existingLinked.number}.`);
        }

        const settings = await this.getSettings();
        const profile = await this.getBusinessProfile();
        let seq = settings.nextInvoiceSequence;
        let invoiceNumber = `${settings.invoicePrefix}${String(seq).padStart(4, '0')}`;
        while (await this.db.invoices.where('number').equals(invoiceNumber).first()) {
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

        await this.db.invoices.add(invoice);
        await this.db.quotations.put(updatedQuotation);
        await this.db.appSettings.put({
          ...settings,
          nextInvoiceSequence: seq + 1,
          updatedAt: ts,
        });
        await this.logActivity({
          entityType: 'quotation',
          entityId: quotation.id,
          action: 'converted',
          summary: `Converted quotation ${quotation.number} into invoice ${invoice.number}`,
        });

        return { quotation: updatedQuotation, invoice };
      }
    );
  }

  async deleteQuotation(id: string): Promise<void> {
    await this.db.quotations.delete(id);
  }

  // --- Contracts ---

  async listContracts(): Promise<Contract[]> {
    const all = await this.db.contracts.toArray();
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createContract(
    input: Omit<Contract, 'id' | 'number' | 'createdAt' | 'updatedAt'> & { number?: string }
  ): Promise<Contract> {
    const client = await this.db.clients.get(input.clientId);
    if (!client) throw new Error('Referenced client does not exist.');
    return this.db.transaction(
      'rw',
      this.db.contracts,
      this.db.appSettings,
      this.db.activities,
      async () => {
        const settings = await this.getSettings();
        const assignedNumber =
          input.number?.trim() ||
          `${settings.contractPrefix}${String(settings.nextContractSequence).padStart(4, '0')}`;
        const ts = nowIso();
        const record = contractSchema.parse({
          ...input,
          id: createId('ctr'),
          number: assignedNumber,
          createdAt: ts,
          updatedAt: ts,
        });
        await this.db.contracts.add(record);
        if (!input.number?.trim()) {
          await this.db.appSettings.put({
            ...settings,
            nextContractSequence: settings.nextContractSequence + 1,
            updatedAt: ts,
          });
        }
        await this.logActivity({
          entityType: 'contract',
          entityId: record.id,
          action: 'created',
          summary: `Created contract ${record.number} ("${record.title}")`,
        });
        return record;
      }
    );
  }

  async updateContract(id: string, patch: Partial<Contract>): Promise<Contract> {
    const existing = await this.db.contracts.get(id);
    if (!existing) throw new Error(`Contract ${id} not found.`);
    const ts = nowIso();
    const nextStatus = patch.status ?? existing.status;
    const acceptedAt =
      nextStatus === 'accepted' && !existing.acceptedAt
        ? ts
        : nextStatus !== 'accepted'
          ? ''
          : existing.acceptedAt;
    const updated = contractSchema.parse({
      ...existing,
      ...patch,
      id,
      acceptedAt,
      createdAt: existing.createdAt,
      updatedAt: ts,
    });
    await this.db.contracts.put(updated);
    return updated;
  }

  async deleteContract(id: string): Promise<void> {
    await this.db.contracts.delete(id);
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
      'id' | 'number' | 'amountPaid' | 'balanceDue' | 'createdAt' | 'updatedAt'
    > & { number?: string }
  ): Promise<Invoice> {
    const client = await this.db.clients.get(input.clientId);
    if (!client) throw new Error('Referenced client does not exist.');

    const totals = calculateDocumentTotals({
      lineItems: input.lineItems,
      discountType: input.discountType,
      discountValue: input.discountValue,
      taxRate: input.taxRate,
      taxInclusive: input.taxInclusive,
    });

    return this.db.transaction(
      'rw',
      this.db.invoices,
      this.db.appSettings,
      this.db.activities,
      async () => {
        const settings = await this.getSettings();
        let invoiceNumber = input.number?.trim() ?? '';
        let bumpSequence = false;

        if (invoiceNumber) {
          const dup = await this.db.invoices.where('number').equals(invoiceNumber).first();
          if (dup) {
            throw new Error(`Invoice number "${invoiceNumber}" already exists.`);
          }
        } else {
          let seq = settings.nextInvoiceSequence;
          invoiceNumber = `${settings.invoicePrefix}${String(seq).padStart(4, '0')}`;
          while (await this.db.invoices.where('number').equals(invoiceNumber).first()) {
            seq += 1;
            invoiceNumber = `${settings.invoicePrefix}${String(seq).padStart(4, '0')}`;
          }
          bumpSequence = true;
          await this.db.appSettings.put({
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
        await this.db.invoices.add(record);
        await this.logActivity({
          entityType: 'invoice',
          entityId: record.id,
          action: bumpSequence ? 'created' : 'created_custom_number',
          summary: `Created invoice ${record.number} for ${client.name}`,
        });
        return record;
      }
    );
  }

  async updateInvoice(id: string, patch: Partial<Invoice>): Promise<Invoice> {
    const existing = await this.db.invoices.get(id);
    if (!existing) throw new Error(`Invoice ${id} not found.`);

    if (patch.number && patch.number.trim() !== existing.number) {
      const dup = await this.db.invoices.where('number').equals(patch.number.trim()).first();
      if (dup && dup.id !== id) {
        throw new Error(`Invoice number "${patch.number.trim()}" is already in use.`);
      }
    }

    const merged = { ...existing, ...patch };
    const totals = calculateDocumentTotals({
      lineItems: merged.lineItems,
      discountType: merged.discountType,
      discountValue: merged.discountValue,
      taxRate: merged.taxRate,
      taxInclusive: merged.taxInclusive,
    });

    const payments = await this.db.payments.where('invoiceId').equals(id).toArray();
    const summary = calculatePaymentSummary(
      totals.total,
      payments.map((p) => p.amount)
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
    await this.db.invoices.put(updated);
    return updated;
  }

  async refreshOverdueInvoices(referenceDate = todayDateStr()): Promise<number> {
    const candidates = await this.db.invoices
      .where('status')
      .anyOf(['sent', 'partially_paid'])
      .toArray();
    let updatedCount = 0;
    const ts = nowIso();
    for (const inv of candidates) {
      if (inv.dueDate < referenceDate && inv.balanceDue > 0) {
        await this.db.invoices.put({ ...inv, status: 'overdue', updatedAt: ts });
        updatedCount += 1;
      }
    }
    return updatedCount;
  }

  async deleteInvoice(id: string): Promise<void> {
    await this.db.transaction('rw', [this.db.invoices, this.db.payments], async () => {
      const linkedPayments = await this.db.payments.where('invoiceId').equals(id).count();
      if (linkedPayments > 0) {
        throw new Error('Cannot delete an invoice that has recorded payments. Cancel it instead.');
      }
      await this.db.invoices.delete(id);
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
    return this.db.transaction(
      'rw',
      [this.db.invoices, this.db.payments, this.db.financeEntries, this.db.activities],
      async () => {
        const invoice = await this.db.invoices.get(input.invoiceId);
        if (!invoice) throw new Error('Selected invoice does not exist.');
        if (invoice.status === 'cancelled') {
          throw new Error('Cannot record payment against a cancelled invoice.');
        }

        const existingPayments = await this.db.payments
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

        const currentSummary = calculatePaymentSummary(
          invoice.total,
          existingPayments.map((p) => p.amount)
        );
        if (input.amount > currentSummary.balanceDue + 0.0001) {
          throw new Error(
            `Payment amount exceeds remaining invoice balance (${currentSummary.balanceDue.toFixed(2)} ${invoice.currency}).`
          );
        }

        const ts = nowIso();
        const payment = paymentSchema.parse({
          ...input,
          clientId: invoice.clientId,
          currency: invoice.currency,
          id: createId('pay'),
          createdAt: ts,
          updatedAt: ts,
        });
        await this.db.payments.add(payment);

        const nextSummary = calculatePaymentSummary(invoice.total, [
          ...existingPayments.map((p) => p.amount),
          payment.amount,
        ]);

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
        await this.db.invoices.put(updatedInvoice);

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
        await this.db.financeEntries.add(incomeEntry);

        await this.logActivity({
          entityType: 'payment',
          entityId: payment.id,
          action: 'recorded',
          summary: `Recorded payment of ${payment.amount.toFixed(2)} ${invoice.currency} for ${invoice.number}`,
        });

        return { payment, invoice: updatedInvoice };
      }
    );
  }

  async deletePayment(paymentId: string): Promise<void> {
    await this.db.transaction(
      'rw',
      [this.db.payments, this.db.invoices, this.db.financeEntries],
      async () => {
        const payment = await this.db.payments.get(paymentId);
        if (!payment) return;
        await this.db.payments.delete(paymentId);
        await this.db.financeEntries.where('paymentId').equals(paymentId).delete();

        const invoice = await this.db.invoices.get(payment.invoiceId);
        if (invoice) {
          const remaining = await this.db.payments.where('invoiceId').equals(invoice.id).toArray();
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
          await this.db.invoices.put({
            ...invoice,
            amountPaid: summary.paidAmount,
            balanceDue: summary.balanceDue,
            status: nextStatus,
            updatedAt: nowIso(),
          });
        }
      }
    );
  }

  // --- Finance Entries ---

  async listFinanceEntries(): Promise<FinanceEntry[]> {
    const all = await this.db.financeEntries.toArray();
    return all.sort((a, b) => b.date.localeCompare(a.date));
  }

  async createFinanceEntry(
    input: Omit<FinanceEntry, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<FinanceEntry> {
    const ts = nowIso();
    const record = financeEntrySchema.parse({
      ...input,
      id: createId('fin'),
      createdAt: ts,
      updatedAt: ts,
    });
    await this.db.financeEntries.add(record);
    await this.logActivity({
      entityType: 'finance',
      entityId: record.id,
      action: 'created',
      summary: `Logged ${record.type}: ${record.description} (${record.amount} ${record.currency})`,
    });
    return record;
  }

  async updateFinanceEntry(id: string, patch: Partial<FinanceEntry>): Promise<FinanceEntry> {
    const existing = await this.db.financeEntries.get(id);
    if (!existing) throw new Error(`Finance entry ${id} not found.`);
    const updated = financeEntrySchema.parse({
      ...existing,
      ...patch,
      id,
      createdAt: existing.createdAt,
      updatedAt: nowIso(),
    });
    await this.db.financeEntries.put(updated);
    return updated;
  }

  async deleteFinanceEntry(id: string): Promise<void> {
    await this.db.financeEntries.delete(id);
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
    return this.db.transaction('rw', [this.db.timeEntries, this.db.activities], async () => {
      const existingRunning = (await this.db.timeEntries.toArray()).find((t) => t.isRunning);
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
      await this.db.timeEntries.add(record);
      return record;
    });
  }

  async stopTimer(entryId: string): Promise<TimeEntry> {
    const entry = await this.db.timeEntries.get(entryId);
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
    await this.db.timeEntries.put(updated);
    await this.logActivity({
      entityType: 'time',
      entityId: updated.id,
      action: 'stopped',
      summary: `Tracked ${Math.round(elapsedSec / 60)}m on "${updated.description}"`,
    });
    return updated;
  }

  async createManualTimeEntry(
    input: Omit<TimeEntry, 'id' | 'isRunning' | 'createdAt' | 'updatedAt'>
  ): Promise<TimeEntry> {
    const ts = nowIso();
    const record = timeEntrySchema.parse({
      ...input,
      id: createId('tim'),
      isRunning: false,
      createdAt: ts,
      updatedAt: ts,
    });
    await this.db.timeEntries.add(record);
    await this.logActivity({
      entityType: 'time',
      entityId: record.id,
      action: 'logged',
      summary: `Logged time entry "${record.description}"`,
    });
    return record;
  }

  async deleteTimeEntry(id: string): Promise<void> {
    await this.db.timeEntries.delete(id);
  }

  // --- Templates & Knowledge ---

  async listTemplates(): Promise<ReusableTemplate[]> {
    return this.db.templates.toArray();
  }

  async saveTemplate(
    input: Omit<ReusableTemplate, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<ReusableTemplate> {
    const ts = nowIso();
    const existing = input.id ? await this.db.templates.get(input.id) : undefined;
    const record = reusableTemplateSchema.parse({
      ...input,
      id: existing?.id ?? input.id ?? createId('tpl'),
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    });
    await this.db.templates.put(record);
    return record;
  }

  async deleteTemplate(id: string): Promise<void> {
    await this.db.templates.delete(id);
  }

  async listKnowledgeDocs(): Promise<KnowledgeDocument[]> {
    const all = await this.db.knowledgeDocs.toArray();
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listDocumentChunks(): Promise<DocumentChunk[]> {
    return this.db.documentChunks.toArray();
  }

  async saveKnowledgeDocWithChunks(
    doc: KnowledgeDocument,
    chunks: DocumentChunk[]
  ): Promise<void> {
    const parsedDoc = knowledgeDocumentSchema.parse(doc);
    await this.db.transaction(
      'rw',
      [this.db.knowledgeDocs, this.db.documentChunks, this.db.activities],
      async () => {
        await this.db.knowledgeDocs.put(parsedDoc);
        await this.db.documentChunks.where('documentId').equals(parsedDoc.id).delete();
        if (chunks.length > 0) {
          await this.db.documentChunks.bulkPut(chunks);
        }
        await this.logActivity({
          entityType: 'knowledge',
          entityId: parsedDoc.id,
          action: 'indexed',
          summary: `Indexed knowledge document "${parsedDoc.title}" (${chunks.length} chunks)`,
        });
      }
    );
  }

  async deleteKnowledgeDoc(docId: string): Promise<void> {
    await this.db.transaction('rw', [this.db.knowledgeDocs, this.db.documentChunks], async () => {
      await this.db.documentChunks.where('documentId').equals(docId).delete();
      await this.db.knowledgeDocs.delete(docId);
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
    input: Omit<NotificationItem, 'id' | 'createdAt'>
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

  async markAllNotificationsRead(): Promise<void> {
    await this.db.notifications.toCollection().modify({ read: true });
  }
}

export const repositories = new DexieSolodeskRepositories();
