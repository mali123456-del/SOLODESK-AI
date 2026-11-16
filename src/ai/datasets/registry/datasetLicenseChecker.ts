import type { DatasetRegistryEntry } from './datasetSchema';

const APPROVED_COMMERCIAL_LICENSES = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-3-Clause',
  'BSD-2-Clause',
  'ISC',
  'CC0-1.0',
  'CC-BY-4.0',
]);

export interface DatasetComplianceResult {
  datasetId: string;
  compliantForInclusion: boolean;
  reasons: string[];
}

export function evaluateDatasetCompliance(entry: DatasetRegistryEntry): DatasetComplianceResult {
  const reasons: string[] = [];

  if (entry.containsPersonalData) {
    reasons.push('Dataset contains or risks exposing personal/PII data.');
  }
  if (entry.commercialUseStatus !== 'permitted') {
    reasons.push(`Commercial use status is "${entry.commercialUseStatus}", not "permitted".`);
  }
  if (!APPROVED_COMMERCIAL_LICENSES.has(entry.license)) {
    reasons.push(`License "${entry.license}" is not in the cleared commercial allowlist.`);
  }
  if (!entry.attribution.trim()) {
    reasons.push('Missing attribution metadata.');
  }
  if (entry.decision === 'rejected') {
    reasons.push(`Explicitly rejected by registry policy: ${entry.decisionReason}`);
  }

  return {
    datasetId: entry.id,
    compliantForInclusion: reasons.length === 0,
    reasons,
  };
}
