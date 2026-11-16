# SOLODESK AI — Database Architecture & Migrations

## Storage Engine
- **Engine:** Browser IndexedDB via **Dexie `4.4.7`** (`SolodeskDatabase`, database name `solodesk_ai_workspace`).
- **Current Schema Version:** `v3` (`SOLODESK_SCHEMA_VERSION = 3` in `src/database/db.ts`).
- **Source of Truth:** Local-first on the user's device; zero mandatory cloud database.

## Tables & Indexes (v3)
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
| `activities` | `id, entityType, entityId, createdAt` | Workspace activity timeline |
| `notifications` | `id, read, createdAt` | Local alerts & overdue indicators |

## Non-Destructive Schema Migrations
- **v1 -> v2:** Added `clients.category` and `*keywords` multi-entry index on `documentChunks`; backfilled `category = 'General'` and `tags = []`.
- **v2 -> v3:** Added `workflowRuns` table and indexed `knowledgeDocs.collection` & `knowledgeDocs.contentHash`; backfilled `collection = 'General'`, `processingStatus = 'indexed'`, `sourceUrl`, `contentHash`, and `licenseOrRights` on existing documents without data loss.

## Transaction & Referential Integrity Rules
- `convertQuotationToInvoice`, `recordPayment`, `updateInvoice`, `refreshOverdueInvoices`, `stopTimer`, `deleteProject`, `deleteTask`, `saveKnowledgeDocWithChunks`, and `restoreBackupPayload` execute inside atomic `db.transaction('rw', ...)`.
- `deleteProject` throws `ReferentialIntegrityError` if non-cancelled invoices link to the project; otherwise unlinks child tasks, time entries, proposals, quotations, contracts, finance entries, and cancelled invoices atomically.
- Live integrity diagnostics (`runDatabaseHealthCheck()` in `src/observability/healthCheck.ts`) scan record counts, 6 FK relationships, storage usage %, and persistence status.
