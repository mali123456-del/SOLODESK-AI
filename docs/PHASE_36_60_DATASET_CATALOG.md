# Phases 36–60 — Dataset Catalog

Verified against `src/ai/datasets/registry/datasetRegistry.ts` and `src/ai/datasets/registry/datasetSchema.ts`.

| ID | Decision | License | Commercial Use | PII Scan | Sha256 / Governance |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `solodesk-freelancer-knowledge-packs-v1` | `approved` | `MIT` | `permitted` | `clean` | `verified-first-party-knowledge-v1`; RAG/retrieval only |
| `solodesk-builtin-templates-v1` | `approved` | `MIT` | `permitted` | `clean` | `verified-first-party-templates-v1`; template placeholders |
| `solodesk-rag-eval-suite-v2` | `approved` | `MIT` | `permitted` | `clean` | `verified-first-party-rag-eval-v2`; evaluation benchmark only |
| `ext-kaggle-invoice-crm-dumps` | `rejected` | `Various / Unknown-Mixed` | `unclear` | `pii_detected` | `not-downloaded-blocked-at-gate` |
| `ext-hf-enron-business-emails` | `rejected` | `Research-Mixed / Non-Uniform` | `restricted` | `pii_detected` | `not-downloaded-blocked-at-gate` |
| `ext-uci-bank-marketing-online-retail` | `rejected` | `CC-BY-4.0` | `permitted` | `clean` | `not-downloaded-excluded` (22 MB non-freelancer retail logs) |

All entries include `redistributionStatus`, `prohibitedUse`, `sha256Checksum`, `collectionDate`, and `retrievalDate`. Zero fine-tuning claims are made (`fineTuningStatus` is `blocked_unapproved` or `not_applicable`).
