# Phase 35 Deployment & Launch Runbook

**Status:** `IMPLEMENTED AND VERIFIED` (Static PWA + Node/SQLite SaaS server) | `BLOCKED — EXTERNAL REQUIREMENT` (Cloud PostgreSQL hosting & live merchant payment gateway credentials)

---

## 1. Local & Full-Stack Verification Checklist

1. Copy `.env.example` to `.env` when running optional server features (`PORT=3000`, optional `GEMINI_API_KEY`, optional `SOLODESK_SQLITE_PATH`). Zero secrets belong in git or browser storage.
2. Verify TypeScript: `npm run lint` (`tsc --noEmit`).
3. Verify Unit & Backend Integration Suite: `npm test` (`vitest run`).
4. Build Production PWA Bundle: `npm run build` (emits `dist/` + `dist/sw.js` + `dist/manifest.webmanifest`).
5. Verify Chromium E2E & Accessibility: `npm run test:e2e`.
6. Start Unified Server: `npm start` (`NODE_ENV=production tsx server.ts` on port `3000`).
7. Confirm Health & Readiness Probes: `GET /api/v1/health` and `GET /api/v1/ready`.

## 2. External Requirements Before Paid SaaS Launch

- Provision external PostgreSQL instance + apply `server/database/pgMigrations/001_postgresql_rls_pgvector.sql` (`BLOCKED — EXTERNAL REQUIREMENT`).
- Onboard verified merchant payment processor (e.g., PayFast Pakistan / Safepay / Wise / Stripe via incorporated foreign entity) (`BLOCKED — EXTERNAL REQUIREMENT`).
- Supply server `GEMINI_API_KEY` or instruct users to use transient memory-only BYOK mode or offline deterministic drafts.
