import { z } from 'zod';

export const datasetUseCaseEnum = z.enum([
  'retrieval',
  'analytics',
  'rag_grounding',
  'evaluation',
  'fine_tuning',
]);

export type DatasetUseCase = z.infer<typeof datasetUseCaseEnum>;

export const datasetRegistryEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  publisher: z.string().min(1),
  sourceUrl: z.string().min(1),
  version: z.string().min(1),
  license: z.string().min(1),
  licenseVerified: z.boolean(),
  attribution: z.string().min(1),
  commercialUseStatus: z.enum(['permitted', 'restricted', 'unclear']),
  containsPersonalData: z.boolean(),
  piiScanStatus: z.enum(['clean', 'pii_detected', 'unverified']),
  language: z.string().min(2),
  sizeLabel: z.string().min(1),
  dataFormat: z.enum(['markdown', 'json', 'csv', 'text']),
  intendedPurpose: z.string().min(1),
  allowedUseCases: z.array(datasetUseCaseEnum),
  fineTuningStatus: z.enum(['blocked_unapproved', 'not_applicable', 'approved']),
  privacyAssessment: z.string().min(1),
  processingStatus: z.enum(['bundled_static', 'indexed_on_demand', 'rejected_not_imported']),
  evaluationStatus: z.enum(['passed', 'blocked', 'pending']),
  decision: z.enum(['approved', 'rejected']),
  decisionReason: z.string().min(1),
  redistributionStatus: z
    .enum(['first_party_permitted', 'attribution_required', 'prohibited_not_bundled'])
    .optional()
    .default('first_party_permitted'),
  prohibitedUse: z.string().optional().default('No unapproved redistribution or personal PII ingestion.'),
  sha256Checksum: z.string().optional().default('verified-local-manifest'),
  collectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  retrievalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type DatasetRegistryEntry = z.infer<typeof datasetRegistryEntrySchema>;

export const datasetRegistryManifestSchema = z.object({
  manifestVersion: z.string().min(1),
  project: z.string().min(1),
  generatedAt: z.string().min(1),
  entries: z.array(datasetRegistryEntrySchema).min(1),
});

export type DatasetRegistryManifest = z.infer<typeof datasetRegistryManifestSchema>;
