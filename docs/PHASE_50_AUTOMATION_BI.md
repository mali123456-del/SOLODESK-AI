# Phase 50 — Automation Rules & BI Analytics

- **Rule Engine & Marketplace (`src/features/workflows/WorkflowsView.tsx`, `src/services/automationService.ts`):**
  - Declarative triggers, conditions, dry-run simulation preview (`Condition Passed` / `Condition Not Met`), and audit execution logs (`workflowRuns`, `customWorkflows`).
  - No silent financial or email side effects on simulated runs.
- **BI & Financial Analytics (`src/features/reports/ReportsView.tsx`, `src/features/dashboard/DashboardView.tsx`):**
  - Weekly & Daily financial digest calculated from live IndexedDB invoices, payments, expenses, and time entries.
  - Project Estimates vs Actuals comparison and What-If Financial Scenario Simulator (`recharts` lazy-loaded).
