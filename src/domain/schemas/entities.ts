import { z } from 'zod';
import { isValidDateOnly } from '../calculations/dates';

export function createId(prefix = 'rec'): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${uuid}`;
}

export const dateOnlySchema = z
  .string()
  .refine((val) => isValidDateOnly(val), { message: 'Expected valid YYYY-MM-DD date' });

export const optionalDateOnlySchema = z
  .string()
  .optional()
  .default('')
  .refine((val) => val === '' || isValidDateOnly(val), {
    message: 'Expected valid YYYY-MM-DD date',
  });

export const isoTimestampSchema = z.string().min(1);

export const lineItemSchema = z.object({
  id: z.string().min(1),
  description: z.string().trim().min(1, 'Line item description is required').max(300),
  quantity: z.number().finite().positive('Quantity must be greater than 0'),
  unitPrice: z.number().finite().min(0, 'Unit price cannot be negative'),
});
export type LineItem = z.infer<typeof lineItemSchema>;

export const businessProfileSchema = z.object({
  id: z.literal('default').default('default'),
  businessName: z.string().trim().min(1, 'Business name is required').max(140),
  ownerName: z.string().trim().max(120).default(''),
  email: z.string().trim().max(160).default(''),
  phone: z.string().trim().max(60).default(''),
  website: z.string().trim().max(200).default(''),
  address: z.string().trim().max(400).default(''),
  taxIdLabel: z.string().trim().max(80).default(''),
  invoiceFooterNote: z.string().trim().max(400).default('Thank you for your business.'),
  paymentInstructions: z.string().trim().max(600).default(''),
  updatedAt: isoTimestampSchema,
});
export type BusinessProfile = z.infer<typeof businessProfileSchema>;

export const dashboardWidgetConfigSchema = z.object({
  id: z.string().min(1),
  visible: z.boolean().default(true),
  order: z.number().int().min(0).default(0),
});
export type DashboardWidgetConfig = z.infer<typeof dashboardWidgetConfigSchema>;

export const recentWorkspaceItemSchema = z.object({
  id: z.string().min(1),
  entityType: z.string().min(1),
  label: z.string().min(1),
  route: z.string().min(1),
  viewedAt: isoTimestampSchema,
});
export type RecentWorkspaceItem = z.infer<typeof recentWorkspaceItemSchema>;

export const taxProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  rate: z.number().finite().min(0).max(100),
  inclusive: z.boolean().default(false),
  country: z.string().trim().max(60).default(''),
});
export type TaxProfile = z.infer<typeof taxProfileSchema>;

export const notificationPrefsSchema = z.object({
  invoiceReminders: z.boolean().default(true),
  taskDeadlines: z.boolean().default(true),
  appointmentReminders: z.boolean().default(true),
  digestHour: z.number().int().min(0).max(23).default(9),
  snoozedIds: z.record(z.string(), z.string()).default({}),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export const appSettingsSchema = z.object({
  id: z.literal('default').default('default'),
  defaultCurrency: z.string().min(3).max(5).default('USD'),
  dateFormat: z
    .enum(['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD MMM YYYY'])
    .default('DD MMM YYYY'),
  theme: z.enum(['light', 'dark', 'system']).default('light'),
  invoicePrefix: z.string().trim().min(1).max(16).default('INV-'),
  nextInvoiceSequence: z.number().int().min(1).default(1001),
  quotationPrefix: z.string().trim().min(1).max(16).default('QUO-'),
  nextQuotationSequence: z.number().int().min(1).default(1001),
  proposalPrefix: z.string().trim().min(1).max(16).default('PRP-'),
  nextProposalSequence: z.number().int().min(1).default(1001),
  contractPrefix: z.string().trim().min(1).max(16).default('CTR-'),
  nextContractSequence: z.number().int().min(1).default(1001),
  defaultTaxRate: z.number().min(0).max(100).default(0),
  defaultHourlyRate: z.number().min(0).default(50),
  onboardingCompleted: z.boolean().default(false),
  demoDataActive: z.boolean().default(false),
  lastBackupAt: z.string().optional().default(''),
  // Phase 15-25 extensions (backward-compatible optional defaults)
  language: z.enum(['en', 'ur', 'es', 'ar']).optional().default('en'),
  rtl: z.boolean().optional().default(false),
  accentColor: z.enum(['blue', 'cyan', 'emerald', 'indigo', 'amber']).optional().default('blue'),
  dashboardWidgets: z.array(dashboardWidgetConfigSchema).optional().default([]),
  pinnedIds: z.array(z.string()).optional().default([]),
  favoriteIds: z.array(z.string()).optional().default([]),
  recentItems: z.array(recentWorkspaceItemSchema).optional().default([]),
  activePlanTier: z.enum(['free', 'pro', 'ultimate', 'business', 'enterprise']).optional().default('free'),
  notificationPrefs: notificationPrefsSchema.optional().default({
    invoiceReminders: true,
    taskDeadlines: true,
    appointmentReminders: true,
    digestHour: 9,
    snoozedIds: {},
  }),
  taxProfiles: z.array(taxProfileSchema).optional().default([]),
  fxRates: z.record(z.string(), z.number().positive()).optional().default({
    USD: 1,
    EUR: 0.92,
    GBP: 0.79,
    PKR: 278.5,
    CAD: 1.36,
    AUD: 1.52,
    AED: 3.67,
  }),
  retentionDays: z.number().int().min(7).max(3650).optional().default(365),
  tourCompleted: z.boolean().optional().default(false),
  updatedAt: isoTimestampSchema,
});
export type AppSettings = z.infer<typeof appSettingsSchema>;

export const clientStatusEnum = z.enum(['active', 'lead', 'archived']);
export type ClientStatus = z.infer<typeof clientStatusEnum>;

export const clientSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Client name is required').max(140),
  company: z.string().trim().max(140).default(''),
  email: z.string().trim().max(160).default(''),
  phone: z.string().trim().max(60).default(''),
  website: z.string().trim().max(200).default(''),
  location: z.string().trim().max(140).default(''),
  status: clientStatusEnum.default('active'),
  category: z.string().trim().max(80).default('General'),
  tags: z.array(z.string().trim().min(1).max(40)).default([]),
  notes: z.string().max(4000).default(''),
  isDemo: z.boolean().optional().default(false),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type Client = z.infer<typeof clientSchema>;

export const milestoneSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  dueDate: optionalDateOnlySchema,
  completed: z.boolean().default(false),
});
export type Milestone = z.infer<typeof milestoneSchema>;

export const projectStatusEnum = z.enum(['planning', 'active', 'on_hold', 'completed', 'archived']);
export type ProjectStatus = z.infer<typeof projectStatusEnum>;

export const priorityEnum = z.enum(['low', 'medium', 'high', 'urgent']);
export type Priority = z.infer<typeof priorityEnum>;

export const projectRiskSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  severity: z.enum(['low', 'medium', 'high']).default('medium'),
  mitigation: z.string().max(500).default(''),
  status: z.enum(['open', 'mitigated']).default('open'),
});
export type ProjectRisk = z.infer<typeof projectRiskSchema>;

export const projectOkrSchema = z.object({
  id: z.string().min(1),
  objective: z.string().trim().min(1).max(200),
  keyResult: z.string().trim().min(1).max(240),
  progressPercent: z.number().min(0).max(100).default(0),
});
export type ProjectOkr = z.infer<typeof projectOkrSchema>;

export const projectSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1, 'Client is required'),
  name: z.string().trim().min(1, 'Project name is required').max(160),
  description: z.string().max(4000).default(''),
  status: projectStatusEnum.default('active'),
  priority: priorityEnum.default('medium'),
  startDate: optionalDateOnlySchema,
  dueDate: optionalDateOnlySchema,
  budget: z.number().finite().min(0).default(0),
  agreedValue: z.number().finite().min(0).default(0),
  currency: z.string().min(3).max(5).default('USD'),
  hourlyRate: z.number().finite().min(0).default(50),
  progress: z.number().min(0).max(100).default(0),
  milestones: z.array(milestoneSchema).default([]),
  risks: z.array(projectRiskSchema).optional().default([]),
  okrs: z.array(projectOkrSchema).optional().default([]),
  isTemplate: z.boolean().optional().default(false),
  notes: z.string().max(4000).default(''),
  isDemo: z.boolean().optional().default(false),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type Project = z.infer<typeof projectSchema>;

export const subtaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  done: z.boolean().default(false),
});
export type Subtask = z.infer<typeof subtaskSchema>;

export const taskStatusEnum = z.enum(['todo', 'in_progress', 'review', 'done', 'archived']);
export type TaskStatus = z.infer<typeof taskStatusEnum>;

export const taskSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().optional().default(''),
  clientId: z.string().optional().default(''),
  title: z.string().trim().min(1, 'Task title is required').max(200),
  description: z.string().max(3000).default(''),
  status: taskStatusEnum.default('todo'),
  priority: priorityEnum.default('medium'),
  dueDate: optionalDateOnlySchema,
  tags: z.array(z.string().trim().min(1).max(40)).default([]),
  subtasks: z.array(subtaskSchema).default([]),
  dependsOnIds: z.array(z.string()).optional().default([]),
  estimatedHours: z.number().finite().min(0).optional().default(0),
  recurrenceRule: z.enum(['none', 'daily', 'weekly', 'monthly']).optional().default('none'),
  autoPriorityScore: z.number().finite().optional().default(0),
  completedAt: z.string().optional().default(''),
  isDemo: z.boolean().optional().default(false),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type Task = z.infer<typeof taskSchema>;

export const proposalStatusEnum = z.enum(['draft', 'sent', 'accepted', 'rejected', 'archived']);
export type ProposalStatus = z.infer<typeof proposalStatusEnum>;

export const proposalSchema = z.object({
  id: z.string().min(1),
  number: z.string().trim().min(1).max(40),
  clientId: z.string().min(1, 'Client is required'),
  projectId: z.string().optional().default(''),
  title: z.string().trim().min(1, 'Proposal title is required').max(200),
  overview: z.string().max(6000).default(''),
  scopeOfWork: z.string().max(8000).default(''),
  deliverables: z.array(z.string().trim().min(1)).default([]),
  timeline: z.string().max(2000).default(''),
  pricingAmount: z.number().finite().min(0).default(0),
  currency: z.string().min(3).max(5).default('USD'),
  terms: z.string().max(4000).default(''),
  validUntil: optionalDateOnlySchema,
  status: proposalStatusEnum.default('draft'),
  isDemo: z.boolean().optional().default(false),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type Proposal = z.infer<typeof proposalSchema>;

export const quotationStatusEnum = z.enum([
  'draft',
  'sent',
  'accepted',
  'rejected',
  'converted',
  'expired',
]);
export type QuotationStatus = z.infer<typeof quotationStatusEnum>;

export const quotationSchema = z.object({
  id: z.string().min(1),
  number: z.string().trim().min(1).max(40),
  clientId: z.string().min(1, 'Client is required'),
  projectId: z.string().optional().default(''),
  title: z.string().trim().min(1, 'Quotation title is required').max(200),
  issueDate: dateOnlySchema,
  expiryDate: optionalDateOnlySchema,
  currency: z.string().min(3).max(5).default('USD'),
  lineItems: z.array(lineItemSchema).min(1, 'At least one line item is required'),
  discountType: z.enum(['none', 'percentage', 'fixed']).default('none'),
  discountValue: z.number().finite().min(0).default(0),
  taxRate: z.number().finite().min(0).max(100).default(0),
  taxInclusive: z.boolean().default(false),
  subtotal: z.number().finite().min(0),
  discountAmount: z.number().finite().min(0),
  taxAmount: z.number().finite().min(0),
  total: z.number().finite().min(0),
  notes: z.string().max(4000).default(''),
  status: quotationStatusEnum.default('draft'),
  convertedInvoiceId: z.string().optional().default(''),
  isDemo: z.boolean().optional().default(false),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type Quotation = z.infer<typeof quotationSchema>;

export const contractSectionSchema = z.object({
  id: z.string().min(1),
  heading: z.string().trim().min(1).max(160),
  body: z.string().max(6000),
});

export const contractStatusEnum = z.enum(['draft', 'sent', 'accepted', 'archived']);
export type ContractStatus = z.infer<typeof contractStatusEnum>;

export const contractSchema = z.object({
  id: z.string().min(1),
  number: z.string().trim().min(1).max(40),
  clientId: z.string().min(1, 'Client is required'),
  projectId: z.string().optional().default(''),
  title: z.string().trim().min(1).max(200),
  templateName: z.string().trim().max(120).default('Standard Freelance Agreement'),
  effectiveDate: optionalDateOnlySchema,
  sections: z.array(contractSectionSchema).min(1),
  status: contractStatusEnum.default('draft'),
  acceptedAt: z.string().optional().default(''),
  isDemo: z.boolean().optional().default(false),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type Contract = z.infer<typeof contractSchema>;

export const invoiceStatusEnum = z.enum([
  'draft',
  'sent',
  'partially_paid',
  'paid',
  'overdue',
  'cancelled',
]);
export type InvoiceStatus = z.infer<typeof invoiceStatusEnum>;

export const paymentInstallmentSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(120),
  dueDate: dateOnlySchema,
  amount: z.number().finite().min(0),
  status: z.enum(['pending', 'paid']).default('pending'),
});
export type PaymentInstallment = z.infer<typeof paymentInstallmentSchema>;

export const invoiceSchema = z.object({
  id: z.string().min(1),
  number: z.string().trim().min(1, 'Invoice number is required').max(40),
  clientId: z.string().min(1, 'Client is required'),
  projectId: z.string().optional().default(''),
  quotationId: z.string().optional().default(''),
  issueDate: dateOnlySchema,
  dueDate: dateOnlySchema,
  currency: z.string().min(3).max(5).default('USD'),
  lineItems: z.array(lineItemSchema).min(1, 'At least one line item is required'),
  discountType: z.enum(['none', 'percentage', 'fixed']).default('none'),
  discountValue: z.number().finite().min(0).default(0),
  taxRate: z.number().finite().min(0).max(100).default(0),
  taxInclusive: z.boolean().default(false),
  subtotal: z.number().finite().min(0),
  discountAmount: z.number().finite().min(0),
  taxAmount: z.number().finite().min(0),
  total: z.number().finite().min(0),
  amountPaid: z.number().finite().min(0).default(0),
  balanceDue: z.number().finite().min(0).default(0),
  notes: z.string().max(4000).default(''),
  paymentInstructions: z.string().max(2000).default(''),
  status: invoiceStatusEnum.default('draft'),
  recurrenceRule: z
    .enum(['none', 'weekly', 'monthly', 'quarterly', 'yearly'])
    .optional()
    .default('none'),
  nextRecurrenceDate: optionalDateOnlySchema,
  exchangeRateToBase: z.number().finite().positive().optional().default(1),
  paymentSchedule: z.array(paymentInstallmentSchema).optional().default([]),
  isDemo: z.boolean().optional().default(false),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type Invoice = z.infer<typeof invoiceSchema>;

export const paymentMethodEnum = z.enum([
  'bank_transfer',
  'cash',
  'card',
  'mobile_wallet',
  'check',
  'other',
]);
export type PaymentMethod = z.infer<typeof paymentMethodEnum>;

export const paymentSchema = z.object({
  id: z.string().min(1),
  invoiceId: z.string().min(1, 'Invoice is required'),
  clientId: z.string().min(1),
  amount: z.number().finite().positive('Payment amount must be greater than 0'),
  currency: z.string().min(3).max(5).default('USD'),
  paymentDate: dateOnlySchema,
  method: paymentMethodEnum.default('bank_transfer'),
  reference: z.string().trim().max(120).default(''),
  notes: z.string().max(1000).default(''),
  isDemo: z.boolean().optional().default(false),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type Payment = z.infer<typeof paymentSchema>;

export const financeEntrySchema = z.object({
  id: z.string().min(1),
  type: z.enum(['income', 'expense']),
  category: z.string().trim().min(1, 'Category is required').max(80),
  amount: z.number().finite().positive('Amount must be greater than 0'),
  currency: z.string().min(3).max(5).default('USD'),
  date: dateOnlySchema,
  clientId: z.string().optional().default(''),
  projectId: z.string().optional().default(''),
  invoiceId: z.string().optional().default(''),
  paymentId: z.string().optional().default(''),
  description: z.string().trim().min(1, 'Description is required').max(240),
  notes: z.string().max(2000).default(''),
  receiptFileName: z.string().max(200).optional().default(''),
  receiptMimeType: z.string().max(100).optional().default(''),
  receiptDataUrl: z.string().max(1_500_000).optional().default(''),
  taxProfileName: z.string().max(80).optional().default(''),
  exchangeRateToBase: z.number().finite().positive().optional().default(1),
  isDemo: z.boolean().optional().default(false),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type FinanceEntry = z.infer<typeof financeEntrySchema>;

export const timeEntrySchema = z.object({
  id: z.string().min(1),
  projectId: z.string().optional().default(''),
  taskId: z.string().optional().default(''),
  description: z.string().trim().min(1, 'Work description is required').max(300),
  startTime: isoTimestampSchema,
  endTime: z.string().optional().default(''),
  durationSeconds: z.number().int().min(0).default(0),
  hourlyRate: z.number().finite().min(0).default(0),
  billable: z.boolean().default(true),
  isRunning: z.boolean().default(false),
  isDemo: z.boolean().optional().default(false),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type TimeEntry = z.infer<typeof timeEntrySchema>;

export const knowledgeDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  sourceType: z.enum(['note', 'markdown', 'text', 'json', 'url']).default('note'),
  sourceUrl: z.string().max(1000).optional().default(''),
  collection: z.string().trim().max(80).optional().default('General'),
  contentHash: z.string().max(128).optional().default(''),
  processingStatus: z.enum(['indexed', 'failed', 'pending']).optional().default('indexed'),
  licenseOrRights: z.string().trim().max(240).optional().default(''),
  accessScope: z.enum(['workspace', 'client_portal', 'internal_only']).optional().default('workspace'),
  indexVersion: z.number().int().min(1).optional().default(2),
  fileName: z.string().max(200).default(''),
  mimeType: z.string().max(120).default('text/plain'),
  sizeBytes: z.number().int().min(0).default(0),
  content: z.string().min(1).max(200_000),
  tags: z.array(z.string().trim().min(1)).default([]),
  chunkCount: z.number().int().min(0).default(0),
  isDemo: z.boolean().optional().default(false),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>;

export const documentChunkSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  documentTitle: z.string().min(1),
  chunkIndex: z.number().int().min(0),
  content: z.string().min(1),
  keywords: z.array(z.string()).default([]),
  createdAt: isoTimestampSchema,
});
export type DocumentChunk = z.infer<typeof documentChunkSchema>;

export const reusableTemplateSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['proposal', 'contract', 'email']),
  name: z.string().trim().min(1).max(160),
  description: z.string().max(400).default(''),
  content: z.string().min(1).max(20000),
  isBuiltIn: z.boolean().default(false),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type ReusableTemplate = z.infer<typeof reusableTemplateSchema>;

export const workflowTypeEnum = z.enum([
  'proposal_to_project_and_tasks',
  'quotation_to_invoice_draft',
  'overdue_invoice_followup_task',
]);
export type WorkflowType = z.infer<typeof workflowTypeEnum>;

export const workflowRunSchema = z.object({
  id: z.string().min(1),
  workflowType: workflowTypeEnum,
  triggerEntityType: z.enum(['proposal', 'quotation', 'invoice']),
  triggerEntityId: z.string().min(1),
  status: z.enum(['pending_approval', 'executed', 'rejected', 'failed']),
  summary: z.string().min(1).max(400),
  createdEntityIds: z.array(z.string()).default([]),
  errorMessage: z.string().max(500).optional().default(''),
  createdAt: isoTimestampSchema,
  executedAt: z.string().optional().default(''),
});
export type WorkflowRun = z.infer<typeof workflowRunSchema>;

export const serviceCatalogItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Service name is required').max(160),
  description: z.string().max(2000).default(''),
  category: z.string().trim().max(80).default('Consulting'),
  defaultUnitPrice: z.number().finite().min(0).default(0),
  currency: z.string().min(3).max(5).default('USD'),
  billingUnit: z.enum(['fixed', 'hourly', 'monthly', 'milestone']).default('fixed'),
  estimatedHours: z.number().finite().min(0).default(0),
  defaultTaxable: z.boolean().default(true),
  active: z.boolean().default(true),
  isDemo: z.boolean().optional().default(false),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type ServiceCatalogItem = z.infer<typeof serviceCatalogItemSchema>;

export const appointmentSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().optional().default(''),
  projectId: z.string().optional().default(''),
  title: z.string().trim().min(1, 'Appointment title is required').max(200),
  date: dateOnlySchema,
  startTime: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm time').default('10:00'),
  durationMinutes: z.number().int().min(5).max(480).default(45),
  locationOrLink: z.string().trim().max(300).default(''),
  status: z.enum(['scheduled', 'completed', 'cancelled']).default('scheduled'),
  meetingNotes: z.string().max(6000).default(''),
  followUpRequired: z.boolean().default(false),
  isDemo: z.boolean().optional().default(false),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type Appointment = z.infer<typeof appointmentSchema>;

export const workspaceGoalSchema = z.object({
  id: z.string().min(1),
  monthPrefix: z.string().regex(/^\d{4}-\d{2}$/, 'Expected YYYY-MM month format'),
  targetRevenue: z.number().finite().min(0).default(0),
  targetBillableHours: z.number().finite().min(0).default(80),
  maxExpenseBudget: z.number().finite().min(0).default(0),
  currency: z.string().min(3).max(5).default('USD'),
  notes: z.string().max(1000).default(''),
  updatedAt: isoTimestampSchema,
});
export type WorkspaceGoal = z.infer<typeof workspaceGoalSchema>;

export const activityEventSchema = z.object({
  id: z.string().min(1),
  entityType: z.enum([
    'client',
    'project',
    'task',
    'proposal',
    'quotation',
    'contract',
    'invoice',
    'payment',
    'finance',
    'time',
    'knowledge',
    'workflow',
    'service',
    'appointment',
    'goal',
    'backup',
    'settings',
    'vault',
    'portal',
    'retainer',
    'webhook',
    'sync',
    'security',
  ]),
  entityId: z.string().min(1),
  action: z.string().min(1).max(80),
  summary: z.string().min(1).max(300),
  createdAt: isoTimestampSchema,
});
export type ActivityEvent = z.infer<typeof activityEventSchema>;

export const notificationItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(160),
  message: z.string().min(1).max(400),
  severity: z.enum(['info', 'warning', 'danger', 'success']).default('info'),
  read: z.boolean().default(false),
  snoozedUntil: z.string().optional().default(''),
  route: z.string().optional().default('dashboard'),
  createdAt: isoTimestampSchema,
});
export type NotificationItem = z.infer<typeof notificationItemSchema>;

// Phase 16: Client Experience & Portal Links
export const portalChecklistItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  completed: z.boolean().default(false),
});

export const portalApprovalRequestSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  description: z.string().max(1000).default(''),
  status: z.enum(['pending', 'approved', 'changes_requested']).default('pending'),
  clientComment: z.string().max(1000).default(''),
  updatedAt: isoTimestampSchema,
});

export const clientPortalLinkSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  projectId: z.string().optional().default(''),
  token: z.string().min(8).max(120),
  label: z.string().trim().min(1).max(160),
  status: z.enum(['active', 'revoked', 'expired']).default('active'),
  expiresAt: dateOnlySchema,
  permissions: z
    .object({
      showMilestones: z.boolean().default(true),
      showInvoices: z.boolean().default(true),
      showSharedFiles: z.boolean().default(true),
      allowApprovals: z.boolean().default(true),
      allowFeedback: z.boolean().default(true),
    })
    .default({
      showMilestones: true,
      showInvoices: true,
      showSharedFiles: true,
      allowApprovals: true,
      allowFeedback: true,
    }),
  onboardingChecklist: z.array(portalChecklistItemSchema).default([]),
  approvals: z.array(portalApprovalRequestSchema).default([]),
  feedbackNotes: z
    .array(
      z.object({
        id: z.string().min(1),
        author: z.string().trim().min(1).max(100),
        message: z.string().trim().min(1).max(2000),
        createdAt: isoTimestampSchema,
      })
    )
    .default([]),
  surveyRating: z.number().int().min(1).max(5).optional(),
  surveyComment: z.string().max(1000).optional().default(''),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type ClientPortalLink = z.infer<typeof clientPortalLinkSchema>;

// Phase 18: Retainers
export const retainerSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  projectId: z.string().optional().default(''),
  title: z.string().trim().min(1).max(160),
  monthlyAmount: z.number().finite().min(0),
  currency: z.string().min(3).max(5).default('USD'),
  includedHours: z.number().finite().min(0).default(20),
  hoursUsed: z.number().finite().min(0).default(0),
  billingDay: z.number().int().min(1).max(28).default(1),
  status: z.enum(['active', 'paused', 'ended']).default('active'),
  notes: z.string().max(1000).default(''),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type Retainer = z.infer<typeof retainerSchema>;

// Phase 19: Document Vault
export const vaultFileVersionSchema = z.object({
  version: z.number().int().min(1),
  sizeBytes: z.number().int().min(0),
  sha256: z.string().min(1),
  note: z.string().max(300).default(''),
  createdAt: isoTimestampSchema,
});

export const vaultFileSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(180),
  folder: z.string().trim().min(1).max(100).default('General'),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().min(0).max(5_000_000),
  sha256: z.string().min(1),
  contentDataUrl: z.string().max(7_000_000),
  previewText: z.string().max(100_000).optional().default(''),
  classification: z.enum(['public', 'client_shared', 'internal', 'confidential']).default('internal'),
  approvalStatus: z.enum(['draft', 'pending_review', 'approved', 'rejected']).default('draft'),
  clientId: z.string().optional().default(''),
  projectId: z.string().optional().default(''),
  shareToken: z.string().optional().default(''),
  tags: z.array(z.string().trim().min(1)).default([]),
  version: z.number().int().min(1).default(1),
  versions: z.array(vaultFileVersionSchema).default([]),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type VaultFile = z.infer<typeof vaultFileSchema>;

// Phase 21: Custom Automation Workflows & Webhooks
export const customWorkflowTriggerEnum = z.enum([
  'invoice_created',
  'invoice_overdue',
  'payment_received',
  'task_completed',
  'project_created',
  'appointment_approaching',
  'client_onboarded',
  'approval_requested',
]);
export type CustomWorkflowTrigger = z.infer<typeof customWorkflowTriggerEnum>;

export const customWorkflowSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  description: z.string().max(400).default(''),
  triggerType: customWorkflowTriggerEnum,
  conditionField: z.string().max(80).default('status'),
  conditionOperator: z.enum(['equals', 'not_equals', 'greater_than', 'contains']).default('equals'),
  conditionValue: z.string().max(120).default(''),
  actionType: z.enum([
    'create_task',
    'push_notification',
    'log_activity',
    'create_portal_approval',
    'queue_webhook',
  ]),
  actionConfig: z.record(z.string(), z.string()).default({}),
  requireApproval: z.boolean().default(true),
  enabled: z.boolean().default(true),
  version: z.number().int().min(1).default(1),
  lastExecutedAt: z.string().optional().default(''),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type CustomWorkflow = z.infer<typeof customWorkflowSchema>;

export const webhookConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  url: z.string().trim().min(1).max(500),
  eventType: customWorkflowTriggerEnum,
  enabled: z.boolean().default(true),
  lastStatus: z.string().max(120).optional().default(''),
  lastAttemptAt: z.string().optional().default(''),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type WebhookConfig = z.infer<typeof webhookConfigSchema>;

// Phase 23: Cloud Sync Queue
export const syncQueueItemSchema = z.object({
  id: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  operation: z.enum(['upsert', 'delete']),
  revision: z.number().int().min(1).default(1),
  status: z.enum(['pending', 'acked', 'conflict', 'failed']).default('pending'),
  conflictReason: z.string().max(300).optional().default(''),
  payloadJson: z.string().default('{}'),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type SyncQueueItem = z.infer<typeof syncQueueItemSchema>;

// Phase 24: Security Audit Log
export const securityAuditLogSchema = z.object({
  id: z.string().min(1),
  eventType: z.string().min(1).max(100),
  severity: z.enum(['info', 'warning', 'critical']).default('info'),
  actor: z.string().max(100).default('local-owner'),
  detail: z.string().min(1).max(500),
  createdAt: isoTimestampSchema,
});
export type SecurityAuditLog = z.infer<typeof securityAuditLogSchema>;

// Phase 15: Saved Views
export const savedViewSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  route: z.string().min(1).max(60),
  filterConfig: z.record(z.string(), z.string()).default({}),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type SavedView = z.infer<typeof savedViewSchema>;
