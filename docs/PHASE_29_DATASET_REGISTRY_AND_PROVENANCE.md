# Phase 29 Dataset Registry & Provenance

**Modules:** `src/ai/datasets/registry/datasetSchema.ts`, `src/ai/datasets/registry/datasetRegistry.ts`  
**UI Audit View:** `KnowledgeHubView.tsx` → `Dataset Audit` dialog  
**Status:** `IMPLEMENTED AND VERIFIED`

---

## 1. Schema Provenance Fields (Manifest `3.0.0`)

Every dataset entry validated against `datasetRegistryEntrySchema` enforces:
- `id`, `name`, `publisher`, `sourceUrl`, `version`, `collectionDate`, `retrievalDate`
- `license`, `licenseVerified: boolean`, `attribution`, `commercialUseStatus` (`permitted | restricted | unclear`)
- `containsPersonalData`, `piiScanStatus` (`clean | pii_detected | unverified`)
- `allowedUseCases` (`retrieval | analytics | rag_grounding | evaluation | fine_tuning`)
- `fineTuningStatus` (`blocked_unapproved | not_applicable | approved`)
- `decision` (`approved | rejected`) and `decisionReason`

## 2. Registry Inventory Audit (`auditDatasetRegistry()`)

- **Approved First-Party Assets (3):**
  1. `solodesk-freelancer-knowledge-packs-v1` (MIT, clean, `['retrieval', 'rag_grounding']`, `fineTuningStatus: 'blocked_unapproved'`)
  2. `solodesk-builtin-templates-v1` (MIT, clean, `['retrieval']`, `fineTuningStatus: 'not_applicable'`)
  3. `solodesk-rag-eval-suite-v2` (MIT, clean, `['evaluation']`, `fineTuningStatus: 'blocked_unapproved'`)
- **Rejected External Candidates (3):**
  4. `ext-kaggle-invoice-crm-dumps` (`rejected`, `pii_detected`, `licenseVerified: false`)
  5. `ext-hf-enron-business-emails` (`rejected`, `pii_detected`, `restricted`)
  6. `ext-uci-bank-marketing-online-retail` (`rejected`, mismatched retail domain + 22 MB weight)
