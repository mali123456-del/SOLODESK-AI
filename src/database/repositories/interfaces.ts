import type {
  ActivityEvent,
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
  Task,
  TimeEntry,
} from '../../domain/schemas/entities';

export interface ISolodeskRepositories {
  // Profile & Settings
  getBusinessProfile(): Promise<BusinessProfile>;
  saveBusinessProfile(input: Partial<BusinessProfile>): Promise<BusinessProfile>;
  getSettings(): Promise<AppSettings>;
  saveSettings(input: Partial<AppSettings>): Promise<AppSettings>;

  // Clients
  listClients(): Promise<Client[]>;
  getClient(id: string): Promise<Client | undefined>;
  findDuplicateClients(input: { email?: string; name?: string; excludeId?: string }): Promise<Client[]>;
  createClient(input: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>): Promise<Client>;
  updateClient(id: string, patch: Partial<Client>): Promise<Client>;
  archiveClient(id: string): Promise<Client>;

  // Projects
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(input: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project>;
  updateProject(id: string, patch: Partial<Project>): Promise<Project>;
  deleteProject(id: string): Promise<void>;

  // Tasks
  listTasks(): Promise<Task[]>;
  createTask(input: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task>;
  updateTask(id: string, patch: Partial<Task>): Promise<Task>;
  deleteTask(id: string): Promise<void>;

  // Proposals, Quotations, Contracts
  listProposals(): Promise<Proposal[]>;
  createProposal(input: Omit<Proposal, 'id' | 'number' | 'createdAt' | 'updatedAt'> & { number?: string }): Promise<Proposal>;
  updateProposal(id: string, patch: Partial<Proposal>): Promise<Proposal>;
  deleteProposal(id: string): Promise<void>;

  listQuotations(): Promise<Quotation[]>;
  createQuotation(input: Omit<Quotation, 'id' | 'number' | 'createdAt' | 'updatedAt'> & { number?: string }): Promise<Quotation>;
  updateQuotation(id: string, patch: Partial<Quotation>): Promise<Quotation>;
  convertQuotationToInvoice(quotationId: string, dueDate: string): Promise<{ quotation: Quotation; invoice: Invoice }>;
  deleteQuotation(id: string): Promise<void>;

  listContracts(): Promise<Contract[]>;
  createContract(input: Omit<Contract, 'id' | 'number' | 'createdAt' | 'updatedAt'> & { number?: string }): Promise<Contract>;
  updateContract(id: string, patch: Partial<Contract>): Promise<Contract>;
  deleteContract(id: string): Promise<void>;

  // Invoices & Payments
  listInvoices(): Promise<Invoice[]>;
  getInvoice(id: string): Promise<Invoice | undefined>;
  createInvoice(input: Omit<Invoice, 'id' | 'number' | 'amountPaid' | 'balanceDue' | 'createdAt' | 'updatedAt'> & { number?: string }): Promise<Invoice>;
  updateInvoice(id: string, patch: Partial<Invoice>): Promise<Invoice>;
  refreshOverdueInvoices(referenceDate?: string): Promise<number>;
  deleteInvoice(id: string): Promise<void>;

  listPayments(invoiceId?: string): Promise<Payment[]>;
  recordPayment(input: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ payment: Payment; invoice: Invoice }>;
  deletePayment(paymentId: string): Promise<void>;

  // Finance (Income & Expenses)
  listFinanceEntries(): Promise<FinanceEntry[]>;
  createFinanceEntry(input: Omit<FinanceEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<FinanceEntry>;
  updateFinanceEntry(id: string, patch: Partial<FinanceEntry>): Promise<FinanceEntry>;
  deleteFinanceEntry(id: string): Promise<void>;

  // Time Tracking
  listTimeEntries(): Promise<TimeEntry[]>;
  getRunningTimer(): Promise<TimeEntry | undefined>;
  startTimer(input: { projectId?: string; taskId?: string; description: string; hourlyRate: number; billable: boolean }): Promise<TimeEntry>;
  stopTimer(entryId: string): Promise<TimeEntry>;
  createManualTimeEntry(input: Omit<TimeEntry, 'id' | 'isRunning' | 'createdAt' | 'updatedAt'>): Promise<TimeEntry>;
  deleteTimeEntry(id: string): Promise<void>;

  // Templates, Knowledge, Activities, Notifications
  listTemplates(): Promise<ReusableTemplate[]>;
  saveTemplate(input: Omit<ReusableTemplate, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<ReusableTemplate>;
  deleteTemplate(id: string): Promise<void>;

  listKnowledgeDocs(): Promise<KnowledgeDocument[]>;
  listDocumentChunks(): Promise<DocumentChunk[]>;
  saveKnowledgeDocWithChunks(doc: KnowledgeDocument, chunks: DocumentChunk[]): Promise<void>;
  deleteKnowledgeDoc(docId: string): Promise<void>;

  listActivities(limit?: number): Promise<ActivityEvent[]>;
  logActivity(input: Omit<ActivityEvent, 'id' | 'createdAt'>): Promise<ActivityEvent>;

  listNotifications(): Promise<NotificationItem[]>;
  pushNotification(input: Omit<NotificationItem, 'id' | 'createdAt'>): Promise<NotificationItem>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
}
