# Changelog

## v1.1.0-rc1 — Release Hardening, Integrity, Security & Evaluation
- **Database v3 & Referential Integrity:** Added non-destructive Dexie v3 migration (`workflowRuns` table + `knowledgeDocs` provenance/collection/contentHash indexes), atomic transactions on `updateInvoice`/`stopTimer`/`refreshOverdueInvoices`, exact `big.js` payment bounds, foreign-key guards, `deleteProject` active-invoice protection & child unlinking, and typed domain errors (`src/core/errors.ts`).
- **Observability & Service Separation:** Added live `runDatabaseHealthCheck()` surfaced in **Settings -> Privacy & Security**, and extracted validated CSV client import into `src/services/importService.ts`.
- **Backup & Crypto Hardening:** Fixed unique invoice `&number` collision crashes on backup merge (`-IMPORT-n`), upgraded PBKDF2 default to 210,000 iterations (backward-compatible decryption), and added salt/IV length validation.
- **AI, RAG & Workflow Engine:** Added `AI_PROVIDER_REGISTRY`, 4 read-only grounded workspace tools (`explain_invoice`, `explain_project_profitability`, `suggest_expense_category`, `summarize_business_report`), SHA-256 deduplication, word-boundary-safe retrieval, 6-case extended RAG benchmark (`Recall@K`, `Precision@K`), and approval-gated `workflowEngine.ts` (accepted Proposal -> Project + deliverable Tasks).
- **Security & Safe URL Importer:** Added `Content-Security-Policy` in `index.html`, SSRF IP/host guard (`src/security/urlPolicy.ts`), HTML script stripping & prompt-injection delimiters (`src/security/sanitize.ts`), and approval-gated single-URL Knowledge importer (`src/integrations/crawler/urlImporter.ts`).
- **Automated Verification:** Added `tests/unit/phase13-hardening.test.ts` and Playwright Chromium E2E suite (`tests/e2e/solodesk.spec.ts`).

## v1.0.0 — Local-First Freelancer Business Workspace & PWA
- Built Dexie IndexedDB v2 schema, Zod entity validation, `big.js` monetary math, and repository abstraction.
- Implemented Dashboard, Activity Feed, Notifications, Clients, Projects, Tasks (List + Kanban), Proposals, Quotations (with atomic invoice conversion), Contracts, Invoices (print + `jsPDF`), Payments, Income, Expenses, Profitability, Financial Reports, Templates, Global Search, and Command Palette (`Ctrl+K`).
- Added persistent Time Tracker with running-timer recovery from IndexedDB.
- Built JSON Backup & Restore with conflict inspection, pre-restore safety snapshot, and optional Web Crypto AES-256-GCM passphrase encryption.
- Added Local Knowledge Hub (`.txt`/`.md`/`.json`/`.csv` chunking & offline RAG citations) and optional BYOK Gemini 4 Hydrogen AI Copilot with explicit consent and approval-gated write actions.
- Added standalone PWA manifest, PNG icons, Workbox offline precaching, and in-app install prompt.
- Added Settings (`Profile`, `Appearance`, `Localization`, `AI`, `Backup`, `Privacy`, `About`) and honest `Product & Pricing Overview` page.
