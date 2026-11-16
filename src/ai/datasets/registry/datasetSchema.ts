import { z } from 'zod';

export const datasetRegistryEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sourceUrl: z.string().min(1),
  version: z.string().min(1),
  license: z.string().min(1),
  attribution: z.string().min(1),
  commercialUseStatus: z.enum(['permitted', 'restricted', 'unclear']),
  containsPersonalData: z.boolean(),
  language: z.string().min(2),
  sizeLabel: z.string().min(1),
  dataFormat: z.enum(['markdown', 'json', 'csv', 'text']),
  intendedPurpose: z.string().min(1),
  privacyAssessment: z.string().min(1),
  processingStatus: z.enum(['bundled_static', 'indexed_on_demand', 'rejected_not_imported']),
  evaluationStatus: z.enum(['passed', 'blocked', 'pending']),
  decision: z.enum(['approved', 'rejected']),
  decisionReason: z.string().min(1),
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
