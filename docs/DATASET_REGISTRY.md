# SOLODESK AI — Dataset Registry & Provenance

SOLODESK AI ships strictly minimal, first-party authored seed templates and deterministic evaluation text.

| Dataset ID | Location | Origin | Purpose | License | Personal Data |
|---|---|---|---|---|---|
| `solodesk-builtin-templates-v1` | `src/ai/datasets/manifests/templates_manifest.json` + `src/database/seeds/demoWorkspace.ts` | First-party authored for SOLODESK AI | Sample proposal/contract/email templates & optional `[Demo]` records | MIT | `false` |
| `solodesk-rag-eval-corpus-v1` | `src/ai/evaluation/benchmarks/runLocalBenchmark.ts` | First-party authored synthetic SOPs | Offline deterministic RAG unit tests (`Recall@K`, `Precision@K`, negative check) | MIT | `false` |

## Governance Controls
- Validated programmatically by `validateDatasetManifest()` (`src/ai/datasets/validation/validateManifest.ts`), which enforces non-empty license, `containsPersonalData: false`, and `clearedForCommercialUse: true`.
- Demo clients use `.invalid` domains (RFC 2606 reserved TLD) and `[Demo]` labels so no real individual or company PII is bundled.
