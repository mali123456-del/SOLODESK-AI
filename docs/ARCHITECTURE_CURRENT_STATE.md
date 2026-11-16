# SOLODESK AI — Current Architecture State (Phase Zero Snapshot)

## 1. Entry Points & Routing
- HTML entry: `/index.html` -> `/src/main.tsx` -> `/src/app/App.tsx`.
- Client-side hash routing (`window.location.hash`) maps 29 routes (`APP_NAVIGATION` in `src/types/navigation.ts`) to lazy-loaded React 19 view modules via `React.lazy` + `Suspense`.
- Global state provided via `ErrorBoundary` -> `ThemeProvider` -> `ToastProvider` -> `WorkspaceProvider`.

## 2. Database & Persistence (`src/database/`)
- **Engine:** IndexedDB via `Dexie` (`solodesk_ai_workspace`), currently at **Schema Version 2**.
- **Tables (17):** `businessProfile`, `appSettings`, `clients`, `projects`, `tasks`, `proposals`, `quotations`, `contracts`, `invoices`, `payments`, `financeEntries`, `timeEntries`, `knowledgeDocs`, `documentChunks`, `templates`, `activities`, `notifications`.
- **Migrations:**
  - `v1`: Baseline schema creation across all 17 tables.
  - `v2`: Adds `clients.category`, `*keywords` multi-entry index on `documentChunks`, and non-destructive upgrade backfill for `client.category = 'General'` and `client.tags = []`.
- **Repositories:** `DexieSolodeskRepositories` implements `ISolodeskRepositories` (`src/database/repositories/dexieRepositories.ts` & `interfaces.ts`).

## 3. Domain Calculations & Validation (`src/domain/`)
- **Money (`src/domain/calculations/money.ts`):** Powered by `big.js` (`Big.roundHalfUp`). Handles `calculateLineItemTotal`, `calculateDocumentTotals` (none/percentage/fixed discount + tax-inclusive/tax-exclusive), and `calculatePaymentSummary`. Supports 9 currencies (`USD`, `PKR`, `EUR`, `GBP`, `AED`, `SAR`, `CAD`, `AUD`, `INR`).
- **Dates (`src/domain/calculations/dates.ts`):** Date-only `YYYY-MM-DD` validation, calendar arithmetic, and formatting (`YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`, `DD MMM YYYY`).
- **Schemas (`src/domain/schemas/entities.ts`):** Zod schemas enforce shapes and bounds across all 17 entity types plus ID generation (`createId`).

## 4. Services, Exports & PDF
- **Backup & Restore (`src/services/backupService.ts`):** Versioned JSON export (`solodesk-backup` v2), pre-restore conflict preview, `replace`/`merge` transaction restore returning `safetySnapshot`, and Web Crypto PBKDF2-SHA256 + AES-GCM encryption (`solodesk-encrypted-backup`).
- **Demo Workspace (`src/services/demoDataService.ts`):** Seed/clear deterministic fictional workspace tagged with `isDemo: true`.
- **CSV (`src/export/csvUtils.ts`):** RFC 4180 parser & exporter with formula-injection prefix escaping (`=`, `+`, `-`, `@`, tab, CR).
- **PDF (`src/pdf/pdfGenerator.ts`):** Client-side `jsPDF` rendering for invoices, quotations, proposals, contracts, and financial summaries.

## 5. AI, Knowledge Hub & Datasets (`src/ai/`)
- **Providers (`src/ai/providers/`):** `AIProvider` contract with `MockProvider` (always-available offline deterministic drafts) and `GeminiProvider` (`gemini-4-hydrogen` default via `@google/genai`, key strictly held in tab JS memory inside `providerFactory.ts`).
- **Agent & Approval (`src/ai/agent/`):** Allowlisted tools (`get_workspace_summary`, `search_clients`, `list_overdue_invoices`, `search_knowledge`, `create_task_draft`, `create_client_draft`), Zod argument validation, and approval gate (`actionApproval.ts`) requiring explicit user confirmation on writes.
- **RAG (`src/ai/rag/`, `src/ai/knowledge/`):** Ingestion (`.txt`, `.md`, `.markdown`, `.json`, `.csv` up to 2 MB), deterministic chunking (500 chars, 80 overlap), keyword indexing, substring/keyword scoring, and numbered citation formatting.
- **Evaluation & Datasets (`src/ai/evaluation/`, `src/ai/datasets/`):** 2-case local benchmark (`runLocalRagBenchmark`) and MIT-licensed template manifest validator (`validateManifest.ts`).

## 6. PWA & Assets (`public/`, `vite.config.ts`)
- `vite-plugin-pwa` with `registerType: 'autoUpdate'`, Workbox precache (59 assets), and CacheFirst runtime caching for Google Fonts.
- Custom SVG logo (`/public/icon.svg`), PNG icons (`192x192`, `512x512`, maskable `512x512`, `apple-touch-icon.png`), and `PWAInstallButton.tsx` handling `beforeinstallprompt` + Safari iOS fallback instructions.
