# Phase 35 Admin & Developer Architecture Guide

**Status:** `IMPLEMENTED AND VERIFIED`

---

## 1. Repository Architecture

- **Frontend (`src/`):**
  - `src/app/`: `App.tsx`, `AppShell.tsx`, `WorkspaceProvider.tsx`, `ThemeProvider.tsx`
  - `src/domain/`: Zod schemas (`entities.ts`), `big.js` math (`money.ts`), date helpers (`dates.ts`)
  - `src/database/`: Dexie `v5` schema (`db.ts`) & repository layer (`dexieRepositories.ts`)
  - `src/ai/`: Server-proxied `GeminiProvider.ts`, Hybrid RAG v3 (`semanticVector.ts`, `retrieval.ts`), 15-Agent Workforce (`src/ai/agents/agentRegistry.ts`), Dataset Registry v3 (`src/ai/datasets/registry/`), and Evaluation suite (`src/ai/evaluation/`)
  - `src/services/`: Business health, Weekly Digest, entitlements, background recurring jobs, sync outbox client, cookie auth client
- **Backend (`server/` + `server.ts`):**
  - `server/auth/`: Scrypt password hashing, CSPRNG SHA-256 session cookies, brute-force rate limiter
  - `server/database/`: WAL `node:sqlite` (`sqliteDb.ts`) + PostgreSQL RLS/`pgvector` SQL migration (`pgMigrations/001_postgresql_rls_pgvector.sql`)
  - `server/ai/`, `server/rag/`, `server/jobs/`, `server/monitoring/`, `server/api/v1/router.ts`
- **Verification (`tests/`):**
  - Unit tests (`tests/unit/`), live backend HTTP integration tests (`tests/integration/`), Chromium Playwright + `@axe-core/playwright` E2E tests (`tests/e2e/`).
