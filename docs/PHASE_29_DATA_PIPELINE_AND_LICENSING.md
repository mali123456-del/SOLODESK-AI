# Phase 29 Data Pipeline & Use-Case Separation Policy

**Module:** `src/ai/datasets/registry/datasetLicenseChecker.ts`  
**Status:** `IMPLEMENTED AND VERIFIED`

---

## 1. Strict Separation Between Retrieval, Analytics, Evaluation & Training

SOLODESK AI separates dataset permissions programmatically via `evaluateDatasetUsePermission(entry, useCase)`:
1. **Commercial & PII Gate:** Any dataset with `piiScanStatus !== 'clean'`, `containsPersonalData: true`, `licenseVerified: false`, `commercialUseStatus !== 'permitted'`, unapproved license, or `decision === 'rejected'` is blocked from ALL use cases.
2. **Use-Case Scope Gate:** Even approved datasets may only be used for their declared `allowedUseCases` (e.g., evaluation test cases cannot pollute production RAG retrieval; RAG knowledge packs are not automatically enabled for analytics or training).
3. **Fine-Tuning Block (`blocked_unapproved`):** Downloading or bundling retrieval/evaluation datasets NEVER implies model training. `useCase === 'fine_tuning'` is rejected unless `fineTuningStatus === 'approved'`. Currently **zero** datasets are cleared for fine-tuning.

## 2. Verification Evidence

Covered by automated assertions in `tests/unit/phase28-31-agents-datasets-bi.test.tsx` (`evaluateDatasetUsePermission` verifies `rag_grounding` passes on MIT knowledge packs while `fine_tuning` and external unverified datasets fail cleanly).
