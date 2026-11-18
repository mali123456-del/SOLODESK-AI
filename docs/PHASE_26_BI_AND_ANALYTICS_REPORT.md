# Phase 26 BI & Analytics Provenance Report

**Modules:** `src/services/businessHealthService.ts`, `src/services/financialIntelligenceService.ts`, `src/features/reports/ReportsView.tsx`, `src/features/dashboard/DashboardView.tsx`, `server/api/v1/router.ts`  
**Status:** `IMPLEMENTED AND VERIFIED`

---

## 1. Deterministic Precision & Provenance Controls

All financial KPIs, invoice aging buckets, cashflow forecasts, What-If scenarios, and Weekly Digests compute using `big.js` decimal arithmetic (`addMoney`, `subtractMoney`) rather than floating-point approximation.

`src/features/reports/ReportsView.tsx` surfaces an explicit **BI Provenance & Methodology** panel displaying:
1. **Data Source:** IndexedDB (Dexie v5 Local Ledger)
2. **Date Range:** Selected `[fromDate → toDate]` or `All Recorded Dates`
3. **Calculation Method:** `Big.js` decimal half-up aggregation with live entry count
4. **Snapshot & Limitation:** Current snapshot date and disclosure that metrics are informational estimates, not certified GAAP/IFRS or tax advice.

## 2. Weekly Digest (`generateWeeklyDigest`)

Implemented in `src/services/businessHealthService.ts` and wired to a clean `Daily | Weekly` switcher on the Dashboard Digest card (`src/features/dashboard/DashboardView.tsx`):
- Computes exact rolling 7-day (`windowStart .. windowEnd`) income, expenses, net total, billable hours, completed tasks, upcoming 7-day open tasks, overdue tasks, overdue invoices, and open receivables.
- Verified by unit tests (`tests/unit/phase28-31-agents-datasets-bi.test.tsx`) and Chromium E2E (`npm run test:e2e`).

## 3. Server Analytics Endpoint

`GET /api/v1/analytics/overview/:workspaceId` (`FINANCE_ROLES` RBAC gated) returns live server SQLite aggregates (`syncedRecordCount`, `serverRagChunkCount`, `aiGatewayCalls`, `estimatedAiCostUsd`) tagged with `dataSource: 'SQLite SaaS Backend (Live Aggregate)'`.
