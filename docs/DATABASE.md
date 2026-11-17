# SOLODESK AI — Database Architecture & Migrations

> See also: [`docs/DATABASE_ARCHITECTURE.md`](./DATABASE_ARCHITECTURE.md) for the Phase 14 v4 architecture specification.

## Storage Engine
- **Engine:** Browser IndexedDB via **Dexie `4.4.7`** (`SolodeskDatabase`, database name `solodesk_ai_workspace`).
- **Current Schema Version:** `v4` (`SOLODESK_SCHEMA_VERSION = 4` in `src/database/db.ts`).
- **Source of Truth:** Local-first on the user's device; zero mandatory cloud database.

## Tables & Indexes (v4 — 21 Tables)
| Table | Primary Key & Indexes | Purpose |
|---|---|---|
| `businessProfile` | `id` | Studio branding, tax label, payment instructions |
| `appSettings` | `id` | Currency, date format, prefixes, theme, backup reminder |
| `clients` | `id, status, category, email, name, updatedAt` | Client CRM records |
| `projects` | `id, clientId, status, dueDate, updatedAt` | Scoped engagements & milestones |
| `tasks` | `id, projectId, clientId, status, priority, dueDate, updatedAt` | Work items & subtasks |
| `proposals` | `id, number, clientId, projectId, status, updatedAt` | Client scope proposals |
| `quotations` | `id, number, clientId, projectId, status, issueDate, updatedAt` | Cost estimates with invoice conversion link |
| `contracts` | `id, number, clientId, projectId, status, updatedAt` | Convenience agreement drafts |
| `invoices` | `id, &number, clientId, projectId, quotationId, status, dueDate, updatedAt` | Invoices (`&number` enforces uniqueness) |
| `payments` | `id, invoiceId, clientId, paymentDate, updatedAt` | Partial/full settlement entries |
| `financeEntries` | `id, type, category, date, clientId, projectId, invoiceId, paymentId` | Informational income & expense ledger |
| `timeEntries` | `id, projectId, taskId, isRunning, startTime` | Manual logs & persistent live timer |
| `knowledgeDocs` | `id, title, sourceType, collection, contentHash, updatedAt` | Knowledge Hub documents + SHA-256 hash |
| `documentChunks` | `id, documentId, chunkIndex, *keywords` | Indexed RAG text chunks & keyword multi-entry index |
| `templates` | `id, kind, name` | Reusable proposal/contract/email templates |
| `workflowRuns` | `id, workflowType, triggerEntityId, status, createdAt` | Idempotent workflow execution audit trail |
| `serviceCatalog` | `id, category, active, name, updatedAt` | Reusable service packages for Invoice/Quote quick-insert *(v4)* |
| `appointments` | `id, clientId, projectId, date, status, updatedAt` | Client meetings, reminders & follow-up status *(v4)* |
| `workspaceGoals` | `id, &monthPrefix, updatedAt` | Monthly revenue, billable hour & expense targets *(v4)* |
| `activities` | `id, entityType, entityId, createdAt` | Workspace activity timeline |
| `notifications` | `id, read, createdAt` | Local alerts & overdue indicators |

## Non-Destructive Schema Migrations
- **v1 -> v2:** Added `clients.category` and `*keywords` multi-entry index on `documentChunks`; backfilled `category = 'General'` and `tags = []`.
- **v2 -> v3:** Added `workflowRuns` table and indexed `knowledgeDocs.collection` & `knowledgeDocs.contentHash`; backfilled `collection = 'General'`, `processingStatus = 'indexed'`, `sourceUrl`, `contentHash`, and `licenseOrRights` on existing documents without data loss.
- **v3 -> v4:** Added `serviceCatalog`, `appointments`, and `workspaceGoals` (`&monthPrefix` uniqueness) without modifying or deleting existing v1–v3 records.

## Transaction, Integrity & Sync Telemetry Rules
- `convertQuotationToInvoice`, `recordPayment`, `updateInvoice`, `refreshOverdueInvoices`, `stopTimer`, `deleteProject`, `deleteTask`, `saveKnowledgeDocWithChunks`, and `restoreBackupPayload` execute inside atomic `db.transaction('rw', ...)`.
- `createAppointment` and `updateAppointment` validate referenced `clientId` and `projectId` foreign keys (`ReferentialIntegrityError`).
- `deleteProject` throws `ReferentialIntegrityError` if non-cancelled invoices link to the project; otherwise unlinks child tasks, time entries, appointments, proposals, quotations, contracts, finance entries, and cancelled invoices atomically.
- Repository write calls wrap persistence through `runWrite(...)` (`src/core/syncEvents.ts`), updating `WorkspaceProvider` sync status (`idle | syncing | synced | error`), pending write counter, and error recovery state.
- Live integrity diagnostics (`runDatabaseHealthCheck()` in `src/observability/healthCheck.ts`) scan record counts across all 21 tables, foreign-key relationships, storage usage %, and persistence status.
