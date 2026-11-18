# Phase 49 — Dataset Governance & Provenance Gate

- **Schema & Policy (`src/ai/datasets/registry/datasetSchema.ts`, `src/ai/datasets/registry/datasetRegistry.ts`, `src/ai/datasets/registry/datasetLicenseChecker.ts`):**
  - Requires `license`, `licenseVerified`, `commercialUseStatus`, `containsPersonalData`, `piiScanStatus`, `redistributionStatus`, `prohibitedUse`, `sha256Checksum`, `collectionDate`, and `retrievalDate` per dataset entry.
  - Automated compliance evaluator (`evaluateDatasetCompliance`) blocks any dataset with unverified commercial license, PII flags, or missing attribution from bundle import.
  - 3 MIT first-party corpora approved for RAG/templates/eval only; 3 third-party public candidates (Kaggle CRM dumps, HF Enron emails, UCI retail CSVs) explicitly audited and rejected (`rejected_not_imported`) with zero repository bloat.
- **Modal UI:** Accessible inside Knowledge Hub via **Dataset Audit** button.
