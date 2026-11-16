# SOLODESK AI — Dataset License Audit

**Audit Scope:** All bundled templates, seed records, and evaluation corpora in SOLODESK AI.

## Findings
1. **No Third-Party Scraped Datasets:** Zero external corpora, HuggingFace dumps, or web scrapes are included in the repository or build output.
2. **Permissive First-Party Authorship:** Both `solodesk-builtin-templates-v1` and `solodesk-rag-eval-corpus-v1` are original MIT-licensed text authored for SOLODESK AI.
3. **Commercial Clearance:** `templates_manifest.json` passes `validateDatasetManifest` (`clearedForCommercialUse: true`, `containsPersonalData: false`).
4. **User-Supplied Imports:** Local files and optional single-URL previews added by users into Knowledge Hub carry user-editable `collection`, `sourceUrl`, and `licenseOrRights` fields inside local IndexedDB only.
