import type {
  ActivityEvent,
  Appointment,
  AppSettings,
  AuditEvent,
  BusinessProfile,
  Client,
  ClientPortalLink,
  Contract,
  CustomWorkflow,
  DocumentChunk,
  FinanceEntry,
  IntegrationConnection,
  Invoice,
  KnowledgeDocument,
  NotificationItem,
  Payment,
  PrivacyConsent,
  Project,
  Proposal,
  Quotation,
  Retainer,
  ReusableTemplate,
  SavedView,
  SecurityAuditLog,
  ServiceCatalogItem,
  SyncQueueItem,
  Task,
  TimeEntry,
  VaultFile,
  VoiceNote,
  WebhookConfig,
  WorkflowRun,
  WorkflowType,
  WorkspaceGoal,
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
  createClient(
    input: Omit<Client, 'id' | 'createdAt' | 'updatedAt' | 'leadStage' | 'contacts'> &
      Partial<Pick<Client, 'leadStage' | 'contacts'>>
  ): Promise<Client>;
  updateClient(id: string, patch: Partial<Client>): Promise<Client>;
  archiveClient(id: string): Promise<Client>;

  // Projects
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(
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
  ): Promise<Project>;
  updateProject(id: string, patch: Partial<Project>): Promise<Project>;
  deleteProject(id: string): Promise<void>;

  // Tasks
  listTasks(): Promise<Task[]>;
  createTask(
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
  ): Promise<Task>;
  updateTask(id: string, patch: Partial<Task>): Promise<Task>;
  deleteTask(id: string): Promise<void>;

  // Proposals, Quotations, Contracts
  listProposals(): Promise<Proposal[]>;
  createProposal(
    input: Omit<
      Proposal,
      'id' | 'number' | 'createdAt' | 'updatedAt' | 'revision' | 'revisionHistory' | 'attachmentVaultIds'
    > &
      Partial<Pick<Proposal, 'revision' | 'revisionHistory' | 'attachmentVaultIds'>> & {
        number?: string;
      }
  ): Promise<Proposal>;
  updateProposal(id: string, patch: Partial<Proposal>): Promise<Proposal>;
  deleteProposal(id: string): Promise<void>;

  listQuotations(): Promise<Quotation[]>;
  createQuotation(input: Omit<Quotation, 'id' | 'number' | 'createdAt' | 'updatedAt'> & { number?: string }): Promise<Quotation>;
  updateQuotation(id: string, patch: Partial<Quotation>): Promise<Quotation>;
  convertQuotationToInvoice(quotationId: string, dueDate: string): Promise<{ quotation: Quotation; invoice: Invoice }>;
  deleteQuotation(id: string): Promise<void>;

  listContracts(): Promise<Contract[]>;
  createContract(
    input: Omit<
      Contract,
      'id' | 'number' | 'createdAt' | 'updatedAt' | 'revision' | 'revisionHistory' | 'attachmentVaultIds'
    > &
      Partial<Pick<Contract, 'revision' | 'revisionHistory' | 'attachmentVaultIds'>> & {
        number?: string;
      }
  ): Promise<Contract>;
  updateContract(id: string, patch: Partial<Contract>): Promise<Contract>;
  deleteContract(id: string): Promise<void>;

  // Invoices & Payments
  listInvoices(): Promise<Invoice[]>;
  getInvoice(id: string): Promise<Invoice | undefined>;
  createInvoice(
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
  ): Promise<Invoice>;
  updateInvoice(id: string, patch: Partial<Invoice>): Promise<Invoice>;
  refreshOverdueInvoices(referenceDate?: string): Promise<number>;
  deleteInvoice(id: string): Promise<void>;

  listPayments(invoiceId?: string): Promise<Payment[]>;
  recordPayment(input: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ payment: Payment; invoice: Invoice }>;
  deletePayment(paymentId: string): Promise<void>;

  // Finance (Income & Expenses)
  listFinanceEntries(): Promise<FinanceEntry[]>;
  createFinanceEntry(
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
  ): Promise<FinanceEntry>;
  updateFinanceEntry(id: string, patch: Partial<FinanceEntry>): Promise<FinanceEntry>;
  deleteFinanceEntry(id: string): Promise<void>;

  // Time Tracking
  listTimeEntries(): Promise<TimeEntry[]>;
  getRunningTimer(): Promise<TimeEntry | undefined>;
  startTimer(input: { projectId?: string; taskId?: string; description: string; hourlyRate: number; billable: boolean }): Promise<TimeEntry>;
  stopTimer(entryId: string): Promise<TimeEntry>;
  createManualTimeEntry(input: Omit<TimeEntry, 'id' | 'isRunning' | 'createdAt' | 'updatedAt'>): Promise<TimeEntry>;
  deleteTimeEntry(id: string): Promise<void>;

  // Templates, Knowledge, Workflows, Activities, Notifications
  listTemplates(): Promise<ReusableTemplate[]>;
  saveTemplate(input: Omit<ReusableTemplate, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<ReusableTemplate>;
  deleteTemplate(id: string): Promise<void>;

  listKnowledgeDocs(): Promise<KnowledgeDocument[]>;
  findKnowledgeDocByHash(contentHash: string): Promise<KnowledgeDocument | undefined>;
  listDocumentChunks(): Promise<DocumentChunk[]>;
  saveKnowledgeDocWithChunks(doc: KnowledgeDocument, chunks: DocumentChunk[]): Promise<void>;
  deleteKnowledgeDoc(docId: string): Promise<void>;

  listWorkflowRuns(): Promise<WorkflowRun[]>;
  findExecutedWorkflowRun(workflowType: WorkflowType, triggerEntityId: string): Promise<WorkflowRun | undefined>;
  saveWorkflowRun(run: WorkflowRun): Promise<WorkflowRun>;

  // Service Catalog, Appointments & Workspace Goals
  listServiceCatalog(): Promise<ServiceCatalogItem[]>;
  createServiceItem(input: Omit<ServiceCatalogItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<ServiceCatalogItem>;
  updateServiceItem(id: string, patch: Partial<ServiceCatalogItem>): Promise<ServiceCatalogItem>;
  deleteServiceItem(id: string): Promise<void>;

  listAppointments(): Promise<Appointment[]>;
  createAppointment(input: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Appointment>;
  updateAppointment(id: string, patch: Partial<Appointment>): Promise<Appointment>;
  deleteAppointment(id: string): Promise<void>;

  listWorkspaceGoals(): Promise<WorkspaceGoal[]>;
  saveWorkspaceGoal(input: Omit<WorkspaceGoal, 'id' | 'updatedAt'> & { id?: string }): Promise<WorkspaceGoal>;

  listActivities(limit?: number): Promise<ActivityEvent[]>;
  logActivity(input: Omit<ActivityEvent, 'id' | 'createdAt'>): Promise<ActivityEvent>;

  listNotifications(): Promise<NotificationItem[]>;
  pushNotification(
    input: Omit<NotificationItem, 'id' | 'createdAt' | 'snoozedUntil'> &
      Partial<Pick<NotificationItem, 'snoozedUntil'>>
  ): Promise<NotificationItem>;
  markNotificationRead(id: string): Promise<void>;
  snoozeNotification(id: string, snoozedUntil: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;

  // Phase 15: Saved Views
  listSavedViews(): Promise<SavedView[]>;
  saveSavedView(input: Omit<SavedView, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<SavedView>;
  deleteSavedView(id: string): Promise<void>;

  // Phase 16: Client Portal Links
  listClientPortalLinks(): Promise<ClientPortalLink[]>;
  getClientPortalLinkByToken(token: string): Promise<ClientPortalLink | undefined>;
  saveClientPortalLink(
    input: Omit<ClientPortalLink, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<ClientPortalLink>;
  deleteClientPortalLink(id: string): Promise<void>;

  // Phase 18: Retainers
  listRetainers(): Promise<Retainer[]>;
  saveRetainer(input: Omit<Retainer, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Retainer>;
  deleteRetainer(id: string): Promise<void>;

  // Phase 19: Document Vault
  listVaultFiles(): Promise<VaultFile[]>;
  saveVaultFile(input: Omit<VaultFile, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<VaultFile>;
  deleteVaultFile(id: string): Promise<void>;

  // Phase 21: Custom Workflows & Webhooks
  listCustomWorkflows(): Promise<CustomWorkflow[]>;
  saveCustomWorkflow(
    input: Omit<CustomWorkflow, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<CustomWorkflow>;
  deleteCustomWorkflow(id: string): Promise<void>;

  listWebhooks(): Promise<WebhookConfig[]>;
  saveWebhook(input: Omit<WebhookConfig, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<WebhookConfig>;
  deleteWebhook(id: string): Promise<void>;

  // Phase 23: Cloud Sync Queue
  listSyncQueue(): Promise<SyncQueueItem[]>;
  enqueueSyncItem(
    input: Omit<SyncQueueItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<SyncQueueItem>;
  updateSyncQueueItem(id: string, patch: Partial<SyncQueueItem>): Promise<SyncQueueItem>;
  clearAckedSyncItems(): Promise<void>;

  // Phase 24: Security Audit Logs
  listSecurityAuditLogs(limit?: number): Promise<SecurityAuditLog[]>;
  logSecurityEvent(input: Omit<SecurityAuditLog, 'id' | 'createdAt'>): Promise<SecurityAuditLog>;

  // Phase 82.1: Voice Notes
  listVoiceNotes(parentType?: 'project' | 'task', parentId?: string): Promise<VoiceNote[]>;
  createVoiceNote(input: Omit<VoiceNote, 'id' | 'createdAt' | 'updatedAt'>): Promise<VoiceNote>;
  deleteVoiceNote(id: string): Promise<void>;

  // Phase 85: Centralized Audit Events (Immutable Append-Only)
  listAuditEvents(limit?: number): Promise<AuditEvent[]>;
  recordAuditEvent(
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
  ): Promise<AuditEvent>;

  // Phase 89: Integration Hub Connections
  listIntegrationConnections(): Promise<IntegrationConnection[]>;
  saveIntegrationConnection(
    input: Omit<IntegrationConnection, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<IntegrationConnection>;
  deleteIntegrationConnection(id: string): Promise<void>;

  // Phase 93: Privacy Consents
  listPrivacyConsents(): Promise<PrivacyConsent[]>;
  savePrivacyConsent(
    input: Omit<PrivacyConsent, 'id' | 'updatedAt'> & { id?: string }
  ): Promise<PrivacyConsent>;
}
