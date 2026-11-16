# SOLODESK AI — System Architecture

## Architectural Layers
1. **UI & Feature Modules (`src/features/*`, `src/components/ui/*`, `src/app/*`)**
   - Lazy-loaded feature views rendered inside `AppShell` with `ErrorBoundary`, `ThemeProvider`, `ToastProvider`, and `WorkspaceProvider`.
   - Zero direct IndexedDB calls inside feature UI components—all mutations flow through `repositories` and domain services.

2. **Domain & Validation Layer (`src/domain/*`)**
   - `schemas/entities.ts`: Zod validation schemas for all persistent entities.
   - `calculations/money.ts`: Exact decimal arithmetic via `big.js` (`roundHalfUp`, tax-inclusive/exclusive breakdowns, partial payment reconciliation).
   - `calculations/dates.ts`: Calendar-date arithmetic via UTC day math avoiding DST shifts.

3. **Persistence & Repository Abstraction (`src/database/*`)**
   - `db.ts`: Dexie (`solodesk_ai_workspace`, schema v2) with non-destructive migrations.
   - `repositories/interfaces.ts` & `dexieRepositories.ts`: Adapter boundary allowing future optional cloud sync without rewriting UI components.

4. **AI, RAG & Agent Isolation (`src/ai/*`)**
   - `providers/*`: `AIProvider` abstraction with `GeminiProvider` (`gemini-4-hydrogen`) and `MockProvider` (offline deterministic drafts).
   - `rag/*` & `knowledge/*`: Client-side document ingestion, deterministic chunking, keyword indexing, and citation retrieval.
   - `agent/*`: Allowlisted Zod-validated read/write tools with explicit user approval required before workspace mutations.

5. **PWA & Static Delivery (`vite.config.ts`, `src/pwa/*`)**
   - `vite-plugin-pwa` generates precached static assets (`dist/sw.js` and `dist/manifest.webmanifest`) while keeping user data inside IndexedDB.
