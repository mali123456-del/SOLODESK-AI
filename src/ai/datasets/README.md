# SOLODESK AI — Dataset Policy & Manifests

SOLODESK AI does not bundle heavy external datasets, scraped content, or local ML weights in order to stay lightweight and statically deployable.

- `manifests/templates_manifest.json`: Auditable catalog of first-party sample templates.
- `validation/validateManifest.ts`: Runtime and test schema validator ensuring every bundled dataset declares its license, zero PII, and commercial clearance.
