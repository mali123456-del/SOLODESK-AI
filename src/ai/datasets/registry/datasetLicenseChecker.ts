import type { DatasetRegistryEntry, DatasetUseCase } from './datasetSchema';

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

  if (entry.containsPersonalData || entry.piiScanStatus !== 'clean') {
    reasons.push(`PII check status is "${entry.piiScanStatus}" / personal data flagged.`);
  }
  if (!entry.licenseVerified) {
    reasons.push('License provenance is unverified.');
  }
  if (entry.commercialUseStatus !== 'permitted') {
    reasons.push(`Commercial use status is "${entry.commercialUseStatus}", not "permitted".`);
  }
  if (!APPROVED_COMMERCIAL_LICENSES.has(entry.license)) {
    reasons.push(`License "${entry.license}" is not in the cleared commercial allowlist.`);
  }
  if (!entry.attribution.trim() || !entry.publisher.trim()) {
    reasons.push('Missing publisher or attribution metadata.');
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

export function evaluateDatasetUsePermission(
  entry: DatasetRegistryEntry,
  useCase: DatasetUseCase
): { allowed: boolean; reason: string } {
  const compliance = evaluateDatasetCompliance(entry);
  if (!compliance.compliantForInclusion) {
    return {
      allowed: false,
      reason: `Dataset "${entry.name}" blocked from "${useCase}": ${compliance.reasons.join(' ')}`,
    };
  }
  if (useCase === 'fine_tuning' && entry.fineTuningStatus !== 'approved') {
    return {
      allowed: false,
      reason: `Fine-tuning blocked: "${entry.name}" has fineTuningStatus="${entry.fineTuningStatus}" (separate model training approval required).`,
    };
  }
  if (!entry.allowedUseCases.includes(useCase)) {
    return {
      allowed: false,
      reason: `Use case "${useCase}" is outside approved scope [${entry.allowedUseCases.join(', ')}] for "${entry.name}".`,
    };
  }
  return {
    allowed: true,
    reason: `Approved for "${useCase}" under ${entry.license}.`,
  };
}
