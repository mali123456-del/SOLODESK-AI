# Phases 36–60 — Technical Research & Repository Inspection

## 1. Repository Baseline Verified
- **Stack:** React 19.3.1, TypeScript 7.0.2, Vite 8.3.0, Tailwind CSS 4.3.5 (`@tailwindcss/vite`), Dexie 4.4.7, Express 5.3.0, Node built-in `node:sqlite`, `big.js` 7.0.1, Zod 4.6.7, Lucide React 1.73.0, Recharts 3.10.1, jsPDF 4.2.1, `@google/genai` 2.32.0 (server-side only), `@opentelemetry/api` 1.10.0.
- **VCS State:** Workspace does not contain a `.git` repository (`NO_GIT`).
- **Storage Architecture:** Dual-mode local-first persistence:
  1. **Browser Client (`src/database/db.ts`):** Dexie IndexedDB v5 (`solodesk_ai_workspace`) with 29 tables covering CRM, projects, documents, accounting, time tracking, knowledge RAG, vault files, retainers, workflows, webhooks, sync queue, and audit logs. Zero secret/data persistence in `localStorage` or `sessionStorage`.
  2. **Optional SaaS Backend (`server/`):** Express v5 API (`/api/v1/*`) backed by Node `node:sqlite` (migrations v1–v4) plus PostgreSQL/Supabase migration SQL (`001_postgresql_rls_pgvector.sql`, `002_phase37_40_domains_rls_buckets.sql`) ready for external deployment.

## 2. Key Architectural Findings From Inspection
- Existing `001_postgresql_rls_pgvector.sql` previously declared `knowledge_chunks.embedding vector(128)` without storing embedding provider/model metadata; `002_phase37_40_domains_rls_buckets.sql` relaxes `embedding` to nullable with `embedding_provider`, `embedding_model`, and `embedding_dimensions`.
- Existing `WorkspaceProvider` handled connectivity state and IndexedDB telemetry; Phases 36–60 elevated live time-tracking intervals into `WorkspaceProvider` (`runningTimer`, `timerElapsedSeconds`) and added `autoSyncEnabled` / `syncPaused` persistence in `appSettings`.
- `node:sqlite` runs locally without external Postgres credentials; remote PostgreSQL/Supabase provisioning, live OAuth calendar/email tokens, live Stripe/PayFast/Safepay merchant transactions, and live unkeyed external LLMs are honestly gated as `BLOCKED — EXTERNAL REQUIREMENT`.
