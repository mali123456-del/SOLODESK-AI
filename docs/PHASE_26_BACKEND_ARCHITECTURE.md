# Phase 26-B Modular SaaS Backend Architecture

**Entry Points:** `server.ts`, `server/createApp.ts`, `server/api/v1/router.ts`  
**Status:** `IMPLEMENTED AND VERIFIED` (Node/Express + SQLite runtime) | `BLOCKED — EXTERNAL REQUIREMENT` (hosted PostgreSQL runtime without external credentials)

---

## 1. Architecture Overview

SOLODESK AI retains **100% offline-first IndexedDB (Dexie v5)** operation for local browser users while providing a modular Express 5 TypeScript backend (`/server`) on port `3000`:

- **Development Mode:** `npm run dev` (`tsx server.ts`) mounts `vite.middlewares` alongside `/api/v1/*`.
- **Production Mode:** `npm start` (`NODE_ENV=production tsx server.ts`) serves static `dist/` assets + `/api/v1/*`.

## 2. Backend Modules

- **`server/auth/authService.ts` & `server/middleware/auth.ts`:**
  - `crypto.scryptSync` per-user salted password hashing with `crypto.timingSafeEqual`.
  - 32-byte cryptographically random session tokens stored as SHA-256 digests in `sessions`, delivered via `HttpOnly; SameSite=Lax` cookie + Bearer header support.
  - Brute-force failed-login rate limiter (`MAX_FAILED_ATTEMPTS = 8`), session revocation, login history, account export, and account deletion.
  - Database-backed `requireWorkspaceRole(db, allowedRoles)` preventing cross-tenant access (`403 Forbidden`).
- **`server/ai/geminiGateway.ts`:** Server-side `@google/genai` gateway (`gemini-4-hydrogen`, `User-Agent: aistudio-build` header, timeout protection, `ai_usage_records` token/cost logging, no deprecated sampling parameters).
- **`server/rag/ragService.ts`:** Server Hybrid RAG v3 chunking, indexing, and RBAC-enforced search (`client_viewer` restricted to `client_portal`; `internal_only` restricted to `owner`/`admin`).
- **`server/jobs/jobRunner.ts`:** SSRF-validated webhook registration (`isBlockedPrivateHost`), HMAC-SHA256 delivery dispatch logging, and idempotent job queue (`jobs` unique `idempotency_key`).
- **`server/monitoring/telemetry.ts`:** `@opentelemetry/api` spans, `X-Request-Id` propagation, structured JSON logging with `scrubSensitiveData`, and counters (`serverMetrics`).
- **OpenAPI & Probes:** `/api/v1/health`, `/api/v1/ready`, `/api/v1/docs` (OpenAPI 3.1.0), `/api/v1/billing/catalog`.

## 3. Verification Status

Live HTTP integration tests in `tests/integration/phase26b-saas-backend.test.ts` passed **3/3** against an isolated Express + `:memory:` `node:sqlite` server covering registration, cross-tenant `403`, sync push ACK + revision conflict detection + pull, RAG scope filtering, webhook SSRF blocking, and billing catalog honesty.
