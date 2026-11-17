# SOLODESK AI — Database Architecture (`Dexie v4`)

**Database Name:** `solodesk_ai_workspace`  
**Engine:** Browser IndexedDB via `Dexie 4.4.7` (`SOLODESK_SCHEMA_VERSION = 4`)

## 1. Schema Tables (`21` Tables)
| Table | Primary Key & Indexes | Domain Purpose |
|---|---|---|
| `businessProfile` | `id` | Studio name, owner, tax ID label, footer & payment instructions |
| `appSettings` | `id` | Currency, date format, prefixes, theme, backup reminder |
| `clients` | `id, status, category, email, name, updatedAt` | Lead & client CRM records |
| `projects` | `id, clientId, status, dueDate, updatedAt` | Scoped projects, hourly rates, budgets, milestones |
| `tasks` | `id, projectId, clientId, status, priority, dueDate, updatedAt` | Tasks, Kanban status, checklists/subtasks |
| `proposals` | `id, number, clientId, projectId, status, updatedAt` | Client proposals & deliverable lists |
| `quotations` | `id, number, clientId, projectId, status, issueDate, updatedAt` | Quotations & invoice conversion tracking |
| `contracts` | `id, number, clientId, projectId, status, updatedAt` | Convenience contract drafts (non-e-signature) |
| `invoices` | `id, &number, clientId, projectId, quotationId, status, dueDate, updatedAt` | Numbered invoices with `&number` uniqueness constraint |
| `payments` | `id, invoiceId, clientId, paymentDate, updatedAt` | Partial & final invoice settlements |
| `financeEntries` | `id, type, category, date, clientId, projectId, invoiceId, paymentId` | Informational income/expense ledger entries |
| `timeEntries` | `id, projectId, taskId, isRunning, startTime` | Manual time logs & persistent live stopwatch |
| `knowledgeDocs` | `id, title, collection, sourceType, contentHash, updatedAt` | Knowledge Hub documents + SHA-256 hashes |
| `documentChunks` | `id, documentId, chunkIndex, *keywords` | Indexed RAG chunks + multi-entry keyword index |
| `templates` | `id, kind, name` | Reusable proposal, contract & email templates |
| `workflowRuns` | `id, workflowType, triggerEntityId, status, createdAt` | Immutable automation execution & failure log |
| `serviceCatalog` *(v4)* | `id, category, active, name, updatedAt` | Pre-priced service packages for Invoice/Quote quick-insert |
| `appointments` *(v4)* | `id, clientId, projectId, date, status, updatedAt` | Client schedule, links, meeting notes, follow-up flags |
| `workspaceGoals` *(v4)* | `id, &monthPrefix, updatedAt` | Monthly revenue, billable hour, and expense ceiling targets |
| `activities` | `id, entityType, entityId, createdAt` | Workspace audit timeline |
| `notifications` | `id, read, createdAt` | Local overdue & status alerts |

## 2. Migration History (Non-Destructive)
- **v1 → v2:** Added `clients.category` and `*keywords` multi-entry index on `documentChunks`.
- **v2 → v3:** Added `workflowRuns`; added `collection`, `contentHash`, `processingStatus`, `sourceUrl`, `licenseOrRights` on `knowledgeDocs`.
- **v3 → v4:** Added `serviceCatalog`, `appointments`, and `workspaceGoals` (`&monthPrefix` uniqueness). Existing v1–v3 records are preserved intact.

## 3. Foreign Key & Atomicity Protections
- `createAppointment` / `updateAppointment` validate `clientId` and `projectId` existence before committing (`ReferentialIntegrityError`).
- `deleteProject` blocks deletion if non-cancelled invoices link to the project; otherwise unlinks child tasks, time entries, appointments, proposals, quotations, contracts, and cancelled invoices inside a single `db.transaction('rw', ...)`.
- All repository write operations in the default `repositories` singleton emit `syncEvents` lifecycle transitions (`syncing` → `synced` / `error`), surfaced immediately in `AppShell` and `SettingsView`.
