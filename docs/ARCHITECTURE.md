# SOLODESK AI — System Architecture

## Architectural Layers
1. **UI & Feature Modules (`src/features/*`, `src/components/ui/*`, `src/app/*`)**
   - Lazy-loaded feature views rendered inside `AppShell` with `ErrorBoundary`, `ThemeProvider`, `ToastProvider`, and `WorkspaceProvider`.
   - Zero direct IndexedDB calls inside feature UI components—all mutations flow through `repositories` and domain services.

2. **Domain & Validation Layer (`src/domain/*`)**
   - `schemas/entities.ts`: Zod validation schemas for all persistent entities.
   - `calculations/money.ts`: Exact decimal arithmetic via `big.js` (`roundHalfUp`, tax-inclusive/exclusive breakdowns, partial payment reconciliation).
   - `calculations/dates.ts`: Calendar-date arithmetic via UTC day math avoiding DST shifts.

3. **Persistence & Repository Abstraction (`src/database/*`, `src/core/errors.ts`, `src/observability/*`)**
   - `db.ts`: Dexie (`solodesk_ai_workspace`, schema `v3`) with non-destructive v1 -> v2 -> v3 migrations.
   - `repositories/interfaces.ts` & `dexieRepositories.ts`: Adapter boundary with typed domain/storage errors, FK checks, and atomic transactions.
   - `observability/healthCheck.ts`: Non-destructive table count, orphan FK, and quota utilization scanner.

4. **AI, RAG, Workflows & Security (`src/ai/*`, `src/workflows/*`, `src/security/*`, `src/integrations/crawler/*`)**
   - `providers/*`: `AI_PROVIDER_REGISTRY` + `GeminiProvider` (`gemini-4-hydrogen`) + `MockProvider` (offline deterministic drafts).
   - `rag/*` & `knowledge/*`: SHA-256 deduplicated document ingestion, collections, word-boundary-safe retrieval, and 6-case evaluation benchmark (`Recall@K`, `Precision@K`).
   - `agent/*` & `workflows/*`: Allowlisted Zod-validated read/write tools and idempotent Proposal-to-Project+Tasks workflow automation gated by explicit user approval.
   - `security/*` & `integrations/crawler/*`: SSRF host policy, `robots.txt` check, HTML script stripping, untrusted-context wrapping, and single-URL import preview.

5. **PWA & Static Delivery (`vite.config.ts`, `src/pwa/*`, `index.html`)**
   - `vite-plugin-pwa` generates precached static assets (`dist/sw.js` and `dist/manifest.webmanifest`) under a compatible Content Security Policy while keeping user data inside IndexedDB.
