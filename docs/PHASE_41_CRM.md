# Phase 41 — Client & Lead CRM

- **Views & Repositories:** `src/features/clients/ClientsView.tsx`, `src/repositories/` backed by Dexie `clients` table (schema v5).
- **Capabilities:**
  - Full CRUD for leads/clients (`lead`, `active`, `paused`, `archived`), category & tag indexing (v2 migration preserved backward compatibility).
  - Real-time duplicate email/company detection while typing before record creation.
  - Client health scores, lifetime revenue rollups calculated directly from recorded invoices/payments, and activity timeline (`activities` table).
  - CSV/JSON export without altering underlying records.
- **Verification:** Covered in `tests/unit/phase3-4-crm-projects-tasks.test.tsx` and Chromium E2E Step 3 (create & survive page reload).
