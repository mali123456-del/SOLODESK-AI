# SOLODESK AI — Dataset & Dependency License Audit

**Audit Date:** 2026-11-17  
**Audit Scope:** All bundled templates, 14 built-in knowledge packs, evaluation corpora, and installed npm/bun runtime packages in SOLODESK AI.

## Findings
1. **No Third-Party Scraped Datasets:** Zero external corpora, HuggingFace dumps, or web scrapes are included in the repository or build output.
2. **Permissive First-Party Authorship:** `solodesk-builtin-templates-v1`, all `14` built-in knowledge packs (`src/knowledge/built-in/*`), and `solodesk-rag-eval-corpus-v2` are original MIT-licensed text authored specifically for SOLODESK AI.
3. **Programmatic Registry & Commercial Clearance (`datasetLicenseChecker.ts`):** `auditDatasetRegistry()` validates every registered dataset (`totalDatasets`, `clearedCount`, `blockedCount`, `piiCount`) and verifies `clearedForCommercialUse: true`, `containsPersonalData: false`, and zero `GPL`/`AGPL` blockers.
4. **Runtime Dependency License Check (`bun pm licenses`):** Verified `527` installed packages across `13` permissive/weak-copyleft license categories (`MIT`, `Apache-2.0`, `BSD-3-Clause`, `BSD-2-Clause`, `ISC`, `CC0-1.0`, `MPL-2.0`) with `0` `GPL`/`AGPL` blockers.
5. **User-Supplied Imports:** Local files and optional single-URL previews added by users into Knowledge Hub carry explicit user-editable `collection`, `sourceUrl`, and `licenseOrRights` provenance metadata inside local IndexedDB only.
