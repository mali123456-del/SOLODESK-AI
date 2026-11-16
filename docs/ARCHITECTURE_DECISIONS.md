# SOLODESK AI — Architecture Decisions (ADR Summary)

## ADR-001: Local-First SPA + PWA Architecture (No Mandatory Backend)
- **Decision:** Build SOLODESK AI as a static-deployable React 19 + TypeScript 7 + Vite 8 web application backed by IndexedDB via Dexie.
- **Rationale:** Satisfies offline-first reliability, zero hosting cost, and user data ownership. No login, payment gateway, or cloud DB is required for MVP.
- **Future Seam:** All persistence flows through typed repository interfaces (`src/repositories/`) so a future cloud sync adapter can be added without modifying feature components.

## ADR-002: Clean Replacement of Starter XR Blocks Boilerplate
- **Decision:** Replace the starter WebXR cylinder demo (`src/index.ts` / `src/index.css`) with a 2D responsive SaaS React UI and avoid bundling Three.js / XR Blocks / MediaPipe / Spark.
- **Rationale:** The starter `vite build` produces >5 MB of unused 3D/WASM chunks (`spark.module` 2.7 MB, `three.webgpu` 677 kB, `draco_decoder` 719 kB, `basis_transcoder` 527 kB), harming load speed and low-spec developer builds (i5-4200U / 8 GB RAM).

## ADR-003: Strict Separation of UI, Domain Logic, Repositories & IndexedDB
- **Decision:**
  - `src/domain/`: Zod schemas, entity types, decimal-safe financial calculators, timezone-safe date helpers, duplicate/integrity validators.
  - `src/db/`: Dexie database definition, explicit versioned migrations, storage persistence checks.
  - `src/repositories/`: Repository interfaces and Dexie implementations with transaction boundaries (`db.transaction`).
  - `src/features/`: Lazy-loaded feature modules consuming services/repositories only—never importing Dexie tables directly.
- **Rationale:** Enables deterministic unit testing with Vitest + `fake-indexeddb`, enforces data integrity, and prevents accidental state corruption.

## ADR-004: Decimal-Safe Financial Arithmetic (`big.js` + Minor Units)
- **Decision:** Perform all monetary calculations (line items, percentage/fixed discounts, tax-exclusive and tax-inclusive calculations, partial payments, remaining balances) using `big.js` and integer minor-unit rounding (`ROUND_HALF_UP`).
- **Rationale:** Prevents IEEE-754 floating-point drift (`0.1 + 0.2 !== 0.3`). Existing invoices snapshot their currency, tax rates, and computed totals at creation/update so changing global currency settings never mutates historical records.

## ADR-005: Timezone-Safe Date Handling
- **Decision:** Store calendar-only dates (due dates, invoice issue dates, payment dates, expense dates) as validated `YYYY-MM-DD` strings, and event instants (`createdAt`, `updatedAt`, `timerStartedAt`) as UTC ISO-8601 strings.
- **Rationale:** Prevents off-by-one-day shifts across timezones and DST boundaries.

## ADR-006: AI-Optional Architecture & Gemini 4 Hydrogen Only
- **Decision:** Isolate AI behind `src/ai/providers/AIProvider.ts` with `GeminiProvider` (`gemini-4-hydrogen` only) and `MockProvider` (for tests).
- **Security & Privacy:**
  - Never bundle or hardcode API keys, and never store BYOK keys in IndexedDB, `localStorage`, backups, or logs.
  - Browser BYOK keys live in React memory only, with a one-click Clear Key control and explicit disclosure of browser DevTools/network visibility.
  - Agent actions use allowlisted Zod-validated tools and require explicit user confirmation before any create/update/delete operation.
  - Knowledge Hub / Local RAG starts with deterministic client-side keyword/TF-IDF chunk retrieval so search works offline with zero AI calls; sending context to Gemini requires explicit user preview & consent.

## ADR-007: Transactional Backup, Safety Snapshot & Optional AES-GCM Encryption
- **Decision:** Export versioned JSON backups containing schema version, timestamp, and entity counts (explicitly excluding any AI keys). Restore validates JSON + Zod schemas, previews diffs/duplicates/conflicts, snapshots current IndexedDB state as a recovery safety backup, and executes inside an atomic Dexie transaction. Optional passphrase encryption uses Web Crypto API (`PBKDF2` + `AES-GCM`).

## ADR-008: Performance Strategy for Low-Spec Hardware
- **Decision:** Lazy-load feature routes (`React.lazy`), lazy-load `jspdf` and `recharts` only when needed, paginate large tables, and keep Vite chunks lean.
