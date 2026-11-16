# SOLODESK AI — Features Matrix

| Area | Implemented Capabilities |
| --- | --- |
| **Dashboard & Insights** | Revenue/expense KPIs, pending invoice totals, monthly cashflow chart, upcoming deadlines, recent activity feed, quick actions |
| **CRM & Delivery** | Clients (CRUD, archive, duplicate warning, CSV import/export), Projects (budgets, milestones, progress), Tasks (List & Kanban, subtasks, overdue badges) |
| **Time Tracker** | Persistent live timer recovered from IndexedDB, duplicate running-timer prevention, manual logs, billable estimates |
| **Document Studio** | Proposals, Quotations (atomic convert-to-invoice), Contracts (editable templates + disclaimer), Invoices (unique numbers, discounts, inclusive/exclusive tax, print preview, PDF export via `jsPDF`) |
| **Finance & Payments** | Partial/full payments linked to invoices & income ledger, Expenses tracker, Project profitability breakdown, CSV/PDF reports |
| **Knowledge Hub & AI** | Offline local file/note chunking (`.txt`, `.md`, `.json`, `.csv`), offline keyword RAG + citations, optional BYOK Gemini 4 Hydrogen Copilot with offline draft fallback & approval-gated write tools |
| **Backup & PWA** | Versioned JSON export/import, conflict preview, pre-restore snapshot, optional AES-GCM encryption, offline Workbox PWA & install button |
