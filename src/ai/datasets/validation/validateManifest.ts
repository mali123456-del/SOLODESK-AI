import { z } from 'zod';

export const datasetEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  purpose: z.string().min(1),
  origin: z.string().min(1),
  license: z.string().min(1),
  containsPersonalData: z.boolean(),
  clearedForCommercialUse: z.boolean(),
  checksumAlgorithm: z.enum(['none', 'sha256']),
  notes: z.string().default(''),
});

export const datasetManifestSchema = z.object({
  manifestVersion: z.string().min(1),
  project: z.string().min(1),
  generatedAt: z.string().min(1),
  datasets: z.array(datasetEntrySchema).min(1),
});

export type DatasetManifest = z.infer<typeof datasetManifestSchema>;

export function validateDatasetManifest(raw: unknown): DatasetManifest {
  const parsed = datasetManifestSchema.parse(raw);
  for (const ds of parsed.datasets) {
    if (ds.containsPersonalData) {
      throw new Error(`Dataset "${ds.id}" must not contain personal data.`);
    }
    if (!ds.clearedForCommercialUse) {
      throw new Error(`Dataset "${ds.id}" is not cleared for commercial distribution.`);
    }
  }
  return parsed;
}
