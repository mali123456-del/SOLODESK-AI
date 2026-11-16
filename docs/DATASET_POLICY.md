# Dataset & Template Policy

SOLODESK AI ships only first-party authored templates and fictional sample demo data (`src/database/seeds/demoWorkspace.ts` and `src/ai/datasets/manifests/templates_manifest.json`).

- **Zero External Scraping:** No third-party scraped content or unverified datasets are bundled.
- **Zero Real PII:** Sample clients use `.invalid` domains and fictional entities, clearly prefixed with `[Demo]`.
- **Schema Verified:** `src/ai/datasets/validation/validateManifest.ts` enforces MIT licensing, commercial clearance, and `containsPersonalData: false`.
