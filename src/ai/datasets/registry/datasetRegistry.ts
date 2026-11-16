import { evaluateDatasetCompliance, type DatasetComplianceResult } from './datasetLicenseChecker';
import {
  datasetRegistryManifestSchema,
  type DatasetRegistryEntry,
  type DatasetRegistryManifest,
} from './datasetSchema';

export const DATASET_REGISTRY_ENTRIES: DatasetRegistryEntry[] = [
  {
    id: 'solodesk-freelancer-knowledge-packs-v1',
    name: 'SOLODESK 14-Pack Freelancer Operations Knowledge Base',
    sourceUrl: 'first-party://src/knowledge/built-in/',
    version: '1.0.0',
    license: 'MIT',
    attribution: 'Authored first-party for SOLODESK AI',
    commercialUseStatus: 'permitted',
    containsPersonalData: false,
    language: 'en',
    sizeLabel: '14 files (~28 KB)',
    dataFormat: 'markdown',
    intendedPurpose:
      'Ground AI Copilot responses and local Knowledge Hub RAG across CRM, proposals, invoicing, time tracking, profitability, workflows, and terminology.',
    privacyAssessment: 'Clean — synthetic operational guidance with zero client names, emails, or credentials.',
    processingStatus: 'bundled_static',
    evaluationStatus: 'passed',
    decision: 'approved',
    decisionReason: 'Original MIT-licensed domain reference authored cleanly for SOLODESK AI.',
    retrievalDate: '2026-11-16',
  },
  {
    id: 'solodesk-builtin-templates-v1',
    name: 'SOLODESK Built-in Proposal, Contract & Email Templates',
    sourceUrl: 'first-party://src/database/seeds/demoWorkspace.ts',
    version: '1.0.0',
    license: 'MIT',
    attribution: 'Authored first-party for SOLODESK AI',
    commercialUseStatus: 'permitted',
    containsPersonalData: false,
    language: 'en',
    sizeLabel: '3 records (~3 KB)',
    dataFormat: 'text',
    intendedPurpose: 'Starter templates for web proposals, independent service agreements, and invoice reminders.',
    privacyAssessment: 'Clean — uses bracketed placeholders only.',
    processingStatus: 'bundled_static',
    evaluationStatus: 'passed',
    decision: 'approved',
    decisionReason: 'Original first-party templates with zero external restrictions.',
    retrievalDate: '2026-11-15',
  },
  {
    id: 'solodesk-rag-eval-suite-v2',
    name: 'SOLODESK Extended RAG & Prompt-Injection Evaluation Suite',
    sourceUrl: 'first-party://src/ai/evaluation/test-cases/sampleCases.ts',
    version: '2.0.0',
    license: 'MIT',
    attribution: 'Authored first-party for SOLODESK AI',
    commercialUseStatus: 'permitted',
    containsPersonalData: false,
    language: 'en',
    sizeLabel: '14 evaluation cases (~9 KB)',
    dataFormat: 'json',
    intendedPurpose:
      'Dynamic evaluation of Recall@K, Precision@K, Citation Accuracy, Unsupported Answer Rate, Duplicate Suppression, and Prompt-Injection isolation.',
    privacyAssessment: 'Clean — fictional test queries only.',
    processingStatus: 'bundled_static',
    evaluationStatus: 'passed',
    decision: 'approved',
    decisionReason: 'First-party deterministic evaluation benchmark.',
    retrievalDate: '2026-11-16',
  },
  {
    id: 'ext-kaggle-invoice-crm-dumps',
    name: 'External Public Kaggle CRM / Invoice CSV Collections (Reviewed Candidates)',
    sourceUrl: 'https://www.kaggle.com/datasets',
    version: 'audited-candidate',
    license: 'Various / Unknown-Mixed',
    attribution: 'Third-party Kaggle contributors',
    commercialUseStatus: 'unclear',
    containsPersonalData: true,
    language: 'en',
    sizeLabel: '5 MB – 200 MB',
    dataFormat: 'csv',
    intendedPurpose: 'Evaluated for invoice/CRM workflow phrasing and category patterns.',
    privacyAssessment: 'Rejected — many community CSV uploads lack verified commercial clearance or contain scraped business emails.',
    processingStatus: 'rejected_not_imported',
    evaluationStatus: 'blocked',
    decision: 'rejected',
    decisionReason:
      'Rejected due to unverified provenance, PII exposure risk, and oversized binary weight incompatible with lean offline browser PWA.',
    retrievalDate: '2026-11-16',
  },
  {
    id: 'ext-hf-enron-business-emails',
    name: 'External Public Business Email Corpora (Hugging Face / Enron-derived)',
    sourceUrl: 'https://huggingface.co/datasets',
    version: 'audited-candidate',
    license: 'Research-Mixed / Non-Uniform',
    attribution: 'FERC / Public Email Archives',
    commercialUseStatus: 'restricted',
    containsPersonalData: true,
    language: 'en',
    sizeLabel: '100 MB+',
    dataFormat: 'text',
    intendedPurpose: 'Evaluated for client communication drafting tone.',
    privacyAssessment: 'Rejected — contains real historical employee email addresses, phone numbers, and irrelevant corporate correspondence.',
    processingStatus: 'rejected_not_imported',
    evaluationStatus: 'blocked',
    decision: 'rejected',
    decisionReason:
      'Rejected due to personal data presence and excessive size; replaced with curated zero-PII first-party client communication guides.',
    retrievalDate: '2026-11-16',
  },
  {
    id: 'ext-uci-bank-marketing-online-retail',
    name: 'UCI Machine Learning Repository — Online Retail & Marketing Datasets',
    sourceUrl: 'https://archive.ics.uci.edu/',
    version: 'CC-BY-4.0-reference',
    license: 'CC-BY-4.0',
    attribution: 'UCI Machine Learning Repository (Dua & Graff)',
    commercialUseStatus: 'permitted',
    containsPersonalData: false,
    language: 'en',
    sizeLabel: '22 MB',
    dataFormat: 'csv',
    intendedPurpose: 'Reference taxonomy for retail invoice line-item structures and follow-up timing benchmarks.',
    privacyAssessment: 'Clean structural schema (numeric CustomerIDs), but retail SKU baskets do not reflect freelancer service consulting.',
    processingStatus: 'rejected_not_imported',
    evaluationStatus: 'blocked',
    decision: 'rejected',
    decisionReason:
      'Reviewed and kept out of bundled repo because 22 MB retail SKU logs add bundle bloat without freelancer domain fidelity.',
    retrievalDate: '2026-11-16',
  },
];

export const DATASET_REGISTRY_MANIFEST: DatasetRegistryManifest = datasetRegistryManifestSchema.parse({
  manifestVersion: '2.0.0',
  project: 'SOLODESK AI',
  generatedAt: '2026-11-16T00:00:00Z',
  entries: DATASET_REGISTRY_ENTRIES,
});

export function auditDatasetRegistry(): {
  manifest: DatasetRegistryManifest;
  approvedEntries: DatasetRegistryEntry[];
  rejectedEntries: DatasetRegistryEntry[];
  complianceChecks: DatasetComplianceResult[];
} {
  const complianceChecks = DATASET_REGISTRY_MANIFEST.entries.map(evaluateDatasetCompliance);
  return {
    manifest: DATASET_REGISTRY_MANIFEST,
    approvedEntries: DATASET_REGISTRY_MANIFEST.entries.filter((e) => e.decision === 'approved'),
    rejectedEntries: DATASET_REGISTRY_MANIFEST.entries.filter((e) => e.decision === 'rejected'),
    complianceChecks,
  };
}
