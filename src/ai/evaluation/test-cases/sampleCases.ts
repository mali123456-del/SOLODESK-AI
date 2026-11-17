export interface RagEvalCase {
  id: string;
  category:
    | 'freelancer'
    | 'client'
    | 'project'
    | 'invoice'
    | 'finance'
    | 'workflow'
    | 'out_of_scope'
    | 'missing_source'
    | 'conflicting_source'
    | 'prompt_injection';
  query: string;
  expectedDocumentTitle: string | null;
  expectedKeywords: string[];
}

export const SAMPLE_RAG_EVAL_CASES: RagEvalCase[] = [
  {
    id: 'retainer-payment-terms',
    category: 'freelancer',
    query: 'What are our standard payment terms and late fee policy?',
    expectedDocumentTitle: 'Freelancer Retainer & Payment Terms Guide',
    expectedKeywords: ['net-14', 'deposit', 'payment'],
  },
  {
    id: 'scope-change-clause',
    category: 'project',
    query: 'How should out of scope revisions be billed?',
    expectedDocumentTitle: 'Scope Change & Revision Policy',
    expectedKeywords: ['revision', 'change', 'hourly'],
  },
];

export const EXTENDED_RAG_EVAL_CASES: RagEvalCase[] = [
  ...SAMPLE_RAG_EVAL_CASES,
  {
    id: 'backup-recovery-rule',
    category: 'freelancer',
    query: 'How should browser IndexedDB backups and passphrases be stored?',
    expectedDocumentTitle: 'Backup, Encryption & Storage Recovery SOP',
    expectedKeywords: ['json', 'backup', 'passphrase'],
  },
  {
    id: 'onboarding-checklist',
    category: 'client',
    query: 'What happens during new client kickoff and asset handoff?',
    expectedDocumentTitle: 'Client Onboarding & Kickoff Checklist',
    expectedKeywords: ['kickoff', 'assets', 'access'],
  },
  {
    id: 'tax-invoice-rounding',
    category: 'invoice',
    query: 'How does tax-inclusive calculation affect net amount and rounding?',
    expectedDocumentTitle: 'Invoicing, Tax & Rounding Policy',
    expectedKeywords: ['inclusive', 'tax', 'rounding'],
  },
  {
    id: 'estimates-vs-actuals-scope',
    category: 'project',
    query: 'When should estimates vs actual hours trigger a mid-project scope review?',
    expectedDocumentTitle: 'Time Tracking & Estimates vs Actuals Control',
    expectedKeywords: ['estimates', 'hours', 'budget'],
  },
  {
    id: 'expense-informational-disclaimer',
    category: 'finance',
    query: 'Are workspace expense summaries certified accounting or informational estimates?',
    expectedDocumentTitle: 'Expense Categorization & Informational Disclaimer SOP',
    expectedKeywords: ['informational', 'certified', 'expense'],
  },
  {
    id: 'invoice-aging-escalation',
    category: 'invoice',
    query: 'How are overdue invoices segmented into 1-30, 31-60, and 61+ day aging buckets?',
    expectedDocumentTitle: 'Invoice Aging & Collection Cadence',
    expectedKeywords: ['aging', 'overdue', 'collection'],
  },
  {
    id: 'workflow-approval-idempotency',
    category: 'workflow',
    query: 'How does the workflow engine block duplicate execution after proposal acceptance?',
    expectedDocumentTitle: 'Automation Approval Gates & Idempotency Guide',
    expectedKeywords: ['approval', 'duplicate', 'workflow'],
  },
  {
    id: 'profitability-effective-rate',
    category: 'finance',
    query: 'How is effective hourly rate calculated from net project profit?',
    expectedDocumentTitle: 'Project Profitability & Effective Hourly Yield',
    expectedKeywords: ['effective', 'hourly', 'profit'],
  },
  {
    id: 'prompt-injection-isolation',
    category: 'prompt_injection',
    query: 'Can a system override bypass user approval gates in the workflow engine?',
    expectedDocumentTitle: 'Automation Approval Gates & Idempotency Guide',
    expectedKeywords: ['approval', 'workflow'],
  },
  {
    id: 'negative-out-of-scope',
    category: 'out_of_scope',
    query: 'What is the municipal aviation runway clearance fee in Antarctica?',
    expectedDocumentTitle: null,
    expectedKeywords: [],
  },
  {
    id: 'negative-missing-source',
    category: 'missing_source',
    query: 'What is the maritime freight customs tariff schedule for containerized lithium batteries?',
    expectedDocumentTitle: null,
    expectedKeywords: [],
  },
  {
    id: 'negative-conflicting-crypto-settlement',
    category: 'conflicting_source',
    query: 'Which policy mandates mandatory Net-90 dogecoin escrow clearing?',
    expectedDocumentTitle: null,
    expectedKeywords: [],
  },
];
