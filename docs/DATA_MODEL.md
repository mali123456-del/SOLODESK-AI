# SOLODESK AI — Data Model & Validation Schemas

All entities are validated at runtime with **Zod (`src/domain/schemas/entities.ts`)** before persistence.

## Core Entities
- **Client:** `{ id, name, company, email, phone, website, location, status ('active' | 'lead' | 'archived'), category, tags[], notes, isDemo, createdAt, updatedAt }`
- **Project:** `{ id, clientId, name, description, status ('planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'), priority, startDate, dueDate, budget, agreedValue, currency, hourlyRate, progress (0-100), milestones[], notes, isDemo, createdAt, updatedAt }`
- **Task:** `{ id, projectId, clientId, title, description, status ('todo' | 'in_progress' | 'review' | 'done' | 'archived'), priority, dueDate, tags[], subtasks[], completedAt, isDemo, createdAt, updatedAt }`
- **Proposal:** `{ id, number, clientId, projectId, title, overview, scopeOfWork, deliverables[], timeline, pricingAmount, currency, terms, validUntil, status, isDemo, createdAt, updatedAt }`
- **Quotation:** `{ id, number, clientId, projectId, title, issueDate, expiryDate, currency, lineItems[], discountType, discountValue, taxRate, taxInclusive, subtotal, discountAmount, taxAmount, total, notes, status ('draft' | 'sent' | 'accepted' | 'rejected' | 'converted'), convertedInvoiceId, isDemo, createdAt, updatedAt }`
- **Invoice:** `{ id, number (unique), clientId, projectId, quotationId, issueDate, dueDate, currency, lineItems[], discountType, discountValue, taxRate, taxInclusive, subtotal, discountAmount, taxAmount, total, amountPaid, balanceDue, notes, paymentInstructions, status ('draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled'), isDemo, createdAt, updatedAt }`
- **Payment:** `{ id, invoiceId, clientId, amount, currency, paymentDate, method, reference, notes, isDemo, createdAt, updatedAt }`
- **FinanceEntry:** `{ id, type ('income' | 'expense'), amount, currency, category, date, clientId, projectId, invoiceId, paymentId, vendorOrSource, description, paymentMethod, isDemo, createdAt, updatedAt }`
- **TimeEntry:** `{ id, projectId, taskId, description, startTime, endTime, durationSeconds, hourlyRate, billable, isRunning, isDemo, createdAt, updatedAt }`
- **KnowledgeDocument:** `{ id, title, sourceType ('note' | 'markdown' | 'text' | 'json' | 'url'), sourceUrl, collection, contentHash (SHA-256), processingStatus, licenseOrRights, fileName, mimeType, sizeBytes, content, tags[], chunkCount, isDemo, createdAt, updatedAt }`
- **DocumentChunk:** `{ id, documentId, documentTitle, chunkIndex, content, keywords[], createdAt }`
- **WorkflowRun:** `{ id, workflowType ('proposal_to_project_and_tasks' | 'quotation_to_invoice_draft'), triggerEntityType, triggerEntityId, status ('pending_approval' | 'executed' | 'rejected' | 'failed'), summary, createdEntityIds[], errorMessage, createdAt, executedAt }`

## Date & Money Representation Conventions
- **Dates:** Calendar-only fields (`dueDate`, `issueDate`, `paymentDate`, `date`) are stored as `YYYY-MM-DD` strings and manipulated with UTC calendar math (`src/domain/calculations/dates.ts`) to prevent DST/timezone drift.
- **Instants:** Audit timestamps (`createdAt`, `updatedAt`, `startTime`) are stored as UTC ISO-8601 strings.
- **Monetary Precision:** Computed via `big.js` with `Big.roundHalfUp` (`src/domain/calculations/money.ts`) using `getCurrencyDecimals(currency)` (0/2/3 decimal support).
