# SOLODESK AI — Dataset Registry & Provenance

SOLODESK AI ships strictly minimal, first-party authored seed templates, 14 built-in MIT freelancer operational knowledge packs, and a 14-case deterministic RAG evaluation suite.

| Dataset ID | Location | Origin | Purpose | License | Personal Data |
|---|---|---|---|---|---|
| `solodesk-builtin-templates-v1` | `src/ai/datasets/manifests/templates_manifest.json` + `src/database/seeds/demoWorkspace.ts` | First-party authored for SOLODESK AI | Sample proposal/contract/email templates & optional `[Demo]` records | MIT | `false` |
| `solodesk-builtin-knowledge-packs-v1` (`14` packs) | `src/knowledge/built-in/*` + `src/knowledge/packLoader.ts` | First-party authored for SOLODESK AI | Freelancer SOPs, invoicing, pricing, tax reminders, scope control, follow-ups, backup & security playbooks | MIT | `false` |
| `solodesk-rag-eval-corpus-v2` (`14` cases) | `src/ai/evaluation/test-cases/sampleCases.ts` + `src/ai/evaluation/benchmarks/runLocalBenchmark.ts` | First-party authored synthetic SOPs | Offline deterministic RAG evaluation (`Recall@K`, `Precision@K`, `Citation Accuracy`, negative/injection guards) | MIT | `false` |

## Governance Controls
- Validated programmatically by `validateDatasetManifest()` (`src/ai/datasets/validation/validateManifest.ts`) and `auditDatasetRegistry()` (`src/ai/datasets/registry/datasetLicenseChecker.ts`), enforcing `MIT` / permissive commercial clearance, `containsPersonalData: false`, `clearedForCommercialUse: true`, and zero `GPL`/`AGPL` blockers.
- Registry metadata is exposed transparently in **Knowledge Hub -> Built-in Packs & Dataset Audit**.
- Demo clients use `.invalid` domains (RFC 2606 reserved TLD) and `[Demo]` labels so no real individual or company PII is bundled.
