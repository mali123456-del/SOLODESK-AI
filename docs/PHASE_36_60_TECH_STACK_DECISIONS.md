# Phases 36–60 — Technology Stack Decisions

## Preserved Core Stack
- **Frontend UI & Styling:** React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + Lucide React (`lucide-react`). Preserved rather than adding shadcn/Radix/MUI bloat to keep PWA JS bundles lean.
- **Offline Persistence:** IndexedDB via Dexie v4 (`SOLODESK_SCHEMA_VERSION = 5`) for durable browser storage surviving restarts and offline periods.
- **Financial Precision:** `big.js` (`ROUND_HALF_UP`) + ISO-4217 currency formatting + integer minor units. Zero IEEE-754 float invoice arithmetic.
- **Schema Validation:** `zod` across domain schemas (`src/domain/schemas/entities.ts`), feature registry, dataset manifests, agent inputs, and backend routes.
- **Charts & PDF:** `recharts` for BI analytics and `jspdf` for offline invoice/document PDF rendering, dynamically code-split via `React.lazy`.

## Backend & Security Decisions
- **Local/Dev Persistence:** Built-in `node:sqlite` with explicit versioned migrations (`v1`–`v4`) in `server/database/sqliteDb.ts`.
- **Cloud PostgreSQL Blueprint:** Versioned SQL migrations (`server/database/pgMigrations/001_*.sql`, `002_*.sql`) using RLS (`app.current_user_id`), RBAC roles, and optional `pgvector`.
- **AI Isolation:** `@google/genai` is imported solely in `server/ai/geminiGateway.ts` and excluded from Vite client output (`dist/assets/`).
- **Observability:** `@opentelemetry/api` tracing wrapper (`server/observability/telemetry.ts`) + structured audit logging without heavy vendor SDK lock-in.
