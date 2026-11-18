# Phase 44 — Documents, Templates & Vault

- **Modules:** `src/features/proposals/`, `src/features/quotations/`, `src/features/contracts/`, `src/features/templates/`, `src/features/vault/`.
- **Capabilities:**
  - Proposal -> Quotation -> Invoice sequential conversion with duplicate conversion prevention (`phase5-documents.test.tsx`).
  - Independent service contracts with versioned clauses and status lifecycle (`draft`, `sent`, `signed`, `archived`).
  - Reusable Service Catalog quick-insert inside invoice builder (`#/templates` -> `#/invoices`).
  - Document Vault (`#/vault`) storing file metadata, checksum verification, attachment scoping, and safe export.
  - Offline PDF generation via lazily loaded `jspdf`.
