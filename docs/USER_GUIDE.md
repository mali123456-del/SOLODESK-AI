# SOLODESK AI — User Guide

## First Launch & Onboarding
1. On initial load, choose **Load Sample Demo Workspace** (populated with clearly labeled `[Demo]` records you can clear anytime) or **Start with Clean Workspace**.
2. Use the sidebar on desktop, the bottom navigation bar + drawer on mobile, or press **`Ctrl+K` / `Cmd+K`** to open the Command Palette.

## End-to-End Workflow
`Client -> Proposal -> Quotation -> Contract -> Project -> Tasks -> Time -> Invoice -> Payment -> Expenses -> Profitability -> Reports`

1. **Clients:** Add contacts with email/company duplicate detection. Archive completed clients rather than deleting historical financial links.
2. **Proposals & Quotations:** Draft proposals or itemized quotations and download PDFs directly from your browser. Accepted quotations convert atomically into draft Invoices via **Convert to Invoice** (duplicates are blocked).
3. **Contracts:** Customize editable service agreement sections and export PDFs. *(Templates are for convenience only and do not constitute legal advice.)*
4. **Projects & Tasks:** Organize milestones, agreed budgets, and tasks in List or Kanban board views. Overdue indicators flag past-due work automatically.
5. **Time Tracker:** Start a live timer linked to a project/task (persisted to IndexedDB so page reloads resume accurately) or log manual sessions.
6. **Invoices & Payments:** Issue invoices with unique sequential or custom numbers, discounts, optional tax, print views, and PDF downloads. Recording partial or full payments automatically updates `amountPaid`, `balanceDue`, invoice status, and linked Income entries.
7. **Finance & Reports:** Track expenses, filter income/expense records, inspect per-project profitability estimates, and export CSV/PDF summaries.
8. **Knowledge Hub & AI Copilot:** Paste notes or upload `.txt`, `.md`, `.json`, or `.csv` files into **Knowledge Hub** for instant offline keyword search. Use **AI Copilot** offline for deterministic templates or supply an optional session-only Gemini 4 Hydrogen key.
9. **Backup & Restore:** Export unencrypted JSON or AES-GCM encrypted backups regularly in **Settings -> Backup & Restore**.
