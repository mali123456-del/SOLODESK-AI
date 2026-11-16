import { evaluateDatasetCompliance } from '../registry/datasetLicenseChecker';
import { DATASET_REGISTRY_ENTRIES } from '../registry/datasetRegistry';
import type { DatasetRegistryEntry } from '../registry/datasetSchema';

export interface DatasetQualityEvaluation {
  totalRegistered: number;
  approvedCount: number;
  rejectedCount: number;
  bundledCompliantCount: number;
  bundledViolations: Array<{ datasetId: string; reasons: string[] }>;
}

export function evaluateRegisteredDatasets(
  entries: DatasetRegistryEntry[] = DATASET_REGISTRY_ENTRIES
): DatasetQualityEvaluation {
  const approved = entries.filter((e) => e.decision === 'approved');
  const rejected = entries.filter((e) => e.decision === 'rejected');

  const bundledViolations: Array<{ datasetId: string; reasons: string[] }> = [];
  let bundledCompliantCount = 0;

  for (const entry of approved) {
    const compliance = evaluateDatasetCompliance(entry);
    if (compliance.compliantForInclusion) {
      bundledCompliantCount += 1;
    } else {
      bundledViolations.push({ datasetId: entry.id, reasons: compliance.reasons });
    }
  }

  return {
    totalRegistered: entries.length,
    approvedCount: approved.length,
    rejectedCount: rejected.length,
    bundledCompliantCount,
    bundledViolations,
  };
}
