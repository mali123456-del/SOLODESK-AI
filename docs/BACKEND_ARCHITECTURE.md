# SOLODESK AI — Local-First Backend & Service Layer Architecture

**Architecture Model:** Browser-native local-first backend abstraction layered strictly behind repository interfaces (`src/database/repositories/interfaces.ts`) and typed domain services so UI components remain decoupled from storage mechanics.

## 1. Architectural Layers
1. **Validation & Financial Precision (`src/domain/`):**
   - `entities.ts`: Strict Zod schemas for all `21` workspace entity types, line items, service catalog packages, appointments, monthly goals, and workflow runs.
   - `calculations/money.ts` & `dates.ts`: Half-up currency arithmetic via `big.js` (`0`, `2`, `3`-decimal currency support) and DST-safe calendar date arithmetic.
2. **Persistence & Sync Telemetry (`src/database/` + `src/core/`):**
   - `db.ts`: Dexie `v4` (`SolodeskDatabase`) with incremental `version(1)` → `version(4)` upgrade hooks.
   - `dexieRepositories.ts`: `DexieSolodeskRepositories` enforcing unique constraints (`&number`), atomic transactions (`db.transaction`), referential integrity (`ReferentialIntegrityError`), and write telemetry via `runWrite()` → `src/core/syncEvents.ts`.
   - `WorkspaceProvider.tsx`: Subscribes to `online`/`offline` events and `syncEvents` to surface `isOnline`, `syncStatus`, `pendingSyncCount`, `syncError`, `lastSyncedAt`, and `retrySync`.
3. **Domain Services (`src/services/`):**
   - `businessHealthService.ts`: `calculateInvoiceAging()`, `calculateEstimatesVsActuals()`, `evaluateMonthlyBusinessHealth()`.
   - `communicationService.ts`: `buildFollowUpQueue()` prioritizing overdue invoices, meeting recaps, sent proposals, and leads.
   - `backupService.ts`: Schema `v4` JSON export/inspect/restore (with `v1`–`v3` backward compatibility), conflict collision detection, and `PBKDF2-SHA256` (210k iterations) + `AES-GCM-256` encrypted backup support.
   - `importService.ts`, `csvExportService.ts`, `pdfGenerator.ts`: Client-side CSV import/export (formula-injection hardened) and PDF generation.
4. **Deterministic Automation (`src/workflows/workflowEngine.ts`):**
   - Approval-gated workflows (`proposal_to_project_and_tasks`, `overdue_invoice_followup_task`), idempotency locks (`findExecutedWorkflowRun`), failed-run retry (`retryFailedWorkflowRun`), and read-only simulation (`simulateWorkflowDryRun`).
5. **Diagnostics (`src/observability/healthCheck.ts`):**
   - `runDatabaseHealthCheck()` audits schema version, table record counts, 6 foreign-key orphan vectors, and browser storage quota telemetry.
