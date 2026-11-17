# Changelog

## v1.2.0 — Phase 14 Integrated Workspace, AI Packs, Dynamic RAG & Sync Telemetry
- **Offline & Local DB Sync Telemetry:** Added `src/core/syncEvents.ts`, enhanced `WorkspaceProvider.tsx` (`isOnline`, `syncStatus`, `pendingSyncCount`, `lastSyncedAt`, `syncError`, `retrySync`), and added header indicator pills plus Settings synchronization status card (`AppShell.tsx`, `SettingsView.tsx`).
- **Dexie v4 Schema & Services:** Migrated non-destructively from `v3` to `v4` (`serviceCatalog`, `appointments`, `workspaceGoals`), wrapped default repository writes in `runWrite(...)`, validated appointment foreign keys, expanded `backupService.ts` (`v4` export + `v1–v3` import), and added `businessHealthService.ts` (invoice aging, estimates vs actuals, monthly health) and `communicationService.ts` (follow-up queue).
- **Workflows & UI Modules:** Added overdue invoice follow-up workflow, failed workflow retry, and dry-run simulation (`workflowEngine.ts`); wired Service Catalog quick-insert into Invoices & Quotations, Schedule & Follow-Ups (`CommunicationHubView`), Workflows simulation/retry (`WorkflowsView`), My Day & Monthly Goals (`DashboardView`), and Aging & Estimates vs Actuals (`ReportsView`).
- **14 Built-In Knowledge Packs, Dataset Audit & Dynamic RAG:** Added 14 MIT first-party knowledge packs (`src/knowledge/built-in/*`), `datasetRegistry.ts` + `datasetLicenseChecker.ts`, modularized crawler (`src/integrations/crawler/{urlValidation,robotsPolicy,htmlExtractor,urlImporter}.ts`), `MockProvider` structured Facts/Recommendations (`local-offline-template-v2`), multi-term noise guard in `retrieval.ts`, and expanded `runExtendedRagBenchmark()` to `14/14 (100%)`.
- **Verification & Responsive Fixes:** Fixed `PageHeader` flex wrapping so long action toolbars never collapse headings on desktop/mobile; verified `tsc --noEmit` (`0` errors), Vitest (`11` files / `50` tests), Playwright Chromium E2E (`1` suite passing, desktop + mobile `375x812` + offline mode), Workbox PWA (`66` precached entries), and `bun pm licenses` (`527` packages / `13` licenses).

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
