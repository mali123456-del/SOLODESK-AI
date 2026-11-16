import Dexie, { type Table } from 'dexie';
import type {
  ActivityEvent,
  Appointment,
  AppSettings,
  BusinessProfile,
  Client,
  Contract,
  DocumentChunk,
  FinanceEntry,
  Invoice,
  KnowledgeDocument,
  NotificationItem,
  Payment,
  Project,
  Proposal,
  Quotation,
  ReusableTemplate,
  ServiceCatalogItem,
  Task,
  TimeEntry,
  WorkflowRun,
  WorkspaceGoal,
} from '../domain/schemas/entities';

export const SOLODESK_DB_NAME = 'solodesk_ai_workspace';
export const SOLODESK_SCHEMA_VERSION = 4;

export class SolodeskDatabase extends Dexie {
  businessProfile!: Table<BusinessProfile, string>;
  appSettings!: Table<AppSettings, string>;
  clients!: Table<Client, string>;
  projects!: Table<Project, string>;
  tasks!: Table<Task, string>;
  proposals!: Table<Proposal, string>;
  quotations!: Table<Quotation, string>;
  contracts!: Table<Contract, string>;
  invoices!: Table<Invoice, string>;
  payments!: Table<Payment, string>;
  financeEntries!: Table<FinanceEntry, string>;
  timeEntries!: Table<TimeEntry, string>;
  knowledgeDocs!: Table<KnowledgeDocument, string>;
  documentChunks!: Table<DocumentChunk, string>;
  templates!: Table<ReusableTemplate, string>;
  workflowRuns!: Table<WorkflowRun, string>;
  serviceCatalog!: Table<ServiceCatalogItem, string>;
  appointments!: Table<Appointment, string>;
  workspaceGoals!: Table<WorkspaceGoal, string>;
  activities!: Table<ActivityEvent, string>;
  notifications!: Table<NotificationItem, string>;

  constructor(dbName = SOLODESK_DB_NAME) {
    super(dbName);

    // v1 baseline schema
    this.version(1).stores({
      businessProfile: 'id',
      appSettings: 'id',
      clients: 'id, status, email, name, updatedAt',
      projects: 'id, clientId, status, dueDate, updatedAt',
      tasks: 'id, projectId, clientId, status, priority, dueDate, updatedAt',
      proposals: 'id, number, clientId, projectId, status, updatedAt',
      quotations: 'id, number, clientId, projectId, status, issueDate, updatedAt',
      contracts: 'id, number, clientId, projectId, status, updatedAt',
      invoices: 'id, &number, clientId, projectId, quotationId, status, dueDate, updatedAt',
      payments: 'id, invoiceId, clientId, paymentDate, updatedAt',
      financeEntries: 'id, type, category, date, clientId, projectId, invoiceId, paymentId',
      timeEntries: 'id, projectId, taskId, isRunning, startTime',
      knowledgeDocs: 'id, title, sourceType, updatedAt',
      documentChunks: 'id, documentId, chunkIndex',
      templates: 'id, kind, name',
      activities: 'id, entityType, entityId, createdAt',
      notifications: 'id, read, createdAt',
    });

    // v2 non-destructive migration: add compound/category index support & ensure default flags exist
    this.version(2)
      .stores({
        businessProfile: 'id',
        appSettings: 'id',
        clients: 'id, status, category, email, name, updatedAt',
        projects: 'id, clientId, status, dueDate, updatedAt',
        tasks: 'id, projectId, clientId, status, priority, dueDate, updatedAt',
        proposals: 'id, number, clientId, projectId, status, updatedAt',
        quotations: 'id, number, clientId, projectId, status, issueDate, updatedAt',
        contracts: 'id, number, clientId, projectId, status, updatedAt',
        invoices: 'id, &number, clientId, projectId, quotationId, status, dueDate, updatedAt',
        payments: 'id, invoiceId, clientId, paymentDate, updatedAt',
        financeEntries: 'id, type, category, date, clientId, projectId, invoiceId, paymentId',
        timeEntries: 'id, projectId, taskId, isRunning, startTime',
        knowledgeDocs: 'id, title, sourceType, updatedAt',
        documentChunks: 'id, documentId, chunkIndex, *keywords',
        templates: 'id, kind, name',
        activities: 'id, entityType, entityId, createdAt',
        notifications: 'id, read, createdAt',
      })
      .upgrade(async (tx) => {
        await tx
          .table('clients')
          .toCollection()
          .modify((client: Partial<Client>) => {
            if (!client.category) client.category = 'General';
            if (!Array.isArray(client.tags)) client.tags = [];
          });
      });

    // v3 non-destructive migration: knowledge provenance/hash/collection indexes + workflowRuns audit table
    this.version(3)
      .stores({
        businessProfile: 'id',
        appSettings: 'id',
        clients: 'id, status, category, email, name, updatedAt',
        projects: 'id, clientId, status, dueDate, updatedAt',
        tasks: 'id, projectId, clientId, status, priority, dueDate, updatedAt',
        proposals: 'id, number, clientId, projectId, status, updatedAt',
        quotations: 'id, number, clientId, projectId, status, issueDate, updatedAt',
        contracts: 'id, number, clientId, projectId, status, updatedAt',
        invoices: 'id, &number, clientId, projectId, quotationId, status, dueDate, updatedAt',
        payments: 'id, invoiceId, clientId, paymentDate, updatedAt',
        financeEntries: 'id, type, category, date, clientId, projectId, invoiceId, paymentId',
        timeEntries: 'id, projectId, taskId, isRunning, startTime',
        knowledgeDocs: 'id, title, sourceType, collection, contentHash, updatedAt',
        documentChunks: 'id, documentId, chunkIndex, *keywords',
        templates: 'id, kind, name',
        workflowRuns: 'id, workflowType, triggerEntityId, status, createdAt',
        activities: 'id, entityType, entityId, createdAt',
        notifications: 'id, read, createdAt',
      })
      .upgrade(async (tx) => {
        await tx
          .table('knowledgeDocs')
          .toCollection()
          .modify((doc: Partial<KnowledgeDocument>) => {
            if (!doc.collection) doc.collection = 'General';
            if (!doc.processingStatus) doc.processingStatus = 'indexed';
            if (typeof doc.sourceUrl !== 'string') doc.sourceUrl = '';
            if (typeof doc.contentHash !== 'string') doc.contentHash = '';
            if (typeof doc.licenseOrRights !== 'string') doc.licenseOrRights = '';
          });
      });

    // v4 non-destructive migration: Service Catalog, Appointments & Meeting Notes, Monthly Workspace Goals
    this.version(4).stores({
      businessProfile: 'id',
      appSettings: 'id',
      clients: 'id, status, category, email, name, updatedAt',
      projects: 'id, clientId, status, dueDate, updatedAt',
      tasks: 'id, projectId, clientId, status, priority, dueDate, updatedAt',
      proposals: 'id, number, clientId, projectId, status, updatedAt',
      quotations: 'id, number, clientId, projectId, status, issueDate, updatedAt',
      contracts: 'id, number, clientId, projectId, status, updatedAt',
      invoices: 'id, &number, clientId, projectId, quotationId, status, dueDate, updatedAt',
      payments: 'id, invoiceId, clientId, paymentDate, updatedAt',
      financeEntries: 'id, type, category, date, clientId, projectId, invoiceId, paymentId',
      timeEntries: 'id, projectId, taskId, isRunning, startTime',
      knowledgeDocs: 'id, title, sourceType, collection, contentHash, updatedAt',
      documentChunks: 'id, documentId, chunkIndex, *keywords',
      templates: 'id, kind, name',
      workflowRuns: 'id, workflowType, triggerEntityId, status, createdAt',
      serviceCatalog: 'id, category, active, updatedAt',
      appointments: 'id, clientId, projectId, date, status, updatedAt',
      workspaceGoals: 'id, &monthPrefix, updatedAt',
      activities: 'id, entityType, entityId, createdAt',
      notifications: 'id, read, createdAt',
    });
  }
}

export const db = new SolodeskDatabase();

export interface StorageHealth {
  supported: boolean;
  persisted: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
}

export async function getStorageHealth(): Promise<StorageHealth> {
  if (typeof navigator === 'undefined' || !navigator.storage) {
    return { supported: false, persisted: false, usageBytes: null, quotaBytes: null };
  }
  let persisted = false;
  let usageBytes: number | null = null;
  let quotaBytes: number | null = null;
  try {
    if (typeof navigator.storage.persisted === 'function') {
      persisted = await navigator.storage.persisted();
    }
    if (typeof navigator.storage.estimate === 'function') {
      const est = await navigator.storage.estimate();
      usageBytes = typeof est.usage === 'number' ? est.usage : null;
      quotaBytes = typeof est.quota === 'number' ? est.quota : null;
    }
  } catch {
    // Graceful fallback in restricted browser contexts
  }
  return { supported: true, persisted, usageBytes, quotaBytes };
}

export async function requestPersistentBrowserStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return false;
  }
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
