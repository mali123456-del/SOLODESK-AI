# Testing & Verification

## Automated Checks
- **TypeScript Strict Check:** `npm run lint` (`tsc --noEmit`)
- **Unit & UI Integration Suite:** `npm test` (`vitest run` with `jsdom` and `fake-indexeddb`)
  - `phase1-foundation.test.tsx`: App shell rendering and hash navigation
  - `phase2-database-money.test.ts`: `big.js` decimal precision, date arithmetic, schema v2, payments
  - `phase3-4-crm-projects-tasks.test.tsx`: Client duplicate warning, project/task persistence
  - `phase5-documents.test.tsx`: Quotation-to-invoice single conversion guard, unique invoice numbers
  - `phase6-payments-finance-time.test.tsx`: Partial payments, running timer recovery across reloads
  - `phase7-dashboard-search-reports.test.tsx`: Dashboard metrics, Global Search, financial reports CSV
  - `phase8-backup-restore.test.ts`: Plain & AES-GCM encrypted backup roundtrips
  - `phase9-ai-rag-agent.test.ts`: In-memory BYOK isolation, local RAG retrieval, consent & approval gating, manifest validation
  - `phase10-12-pwa-settings-marketing.test.tsx`: Settings persistence and Product Overview navigation
  - `phase13-hardening.test.ts`: Schema v1->v3 migration, `deleteProject` invoice guard & child unlinking, 0/2/3-decimal & odd-cent tax-inclusive `big.js` precision, backup merge `&number` collision renaming + tampered IV rejection, CSV client import & health diagnostics, SSRF IP/redirect protection + HTML sanitization + `robots.txt`, SHA-256 Knowledge dedup + collection filter + 6/6 extended RAG benchmark (`Recall@3`, `Precision@3`, `Citation Accuracy`, zero unsupported FPs), and read-only AI tools + idempotent proposal workflows
  - **Total Unit & Integration Suite:** 10 test files, 45 tests (`vitest run` with `jsdom` and `fake-indexeddb`)
- **Browser End-to-End Suite (Playwright Chromium):** `npm run test:e2e` (`playwright test` against built `dist/` via `vite preview`)
  - Runs headless Chromium (`159.0.8154.6`) verifying `/manifest.webmanifest` & `/sw.js`, onboarding & workspace creation, desktop (`1280x800`) and mobile (`375x812`) zero-overflow checks, client IndexedDB reload persistence, accepted proposal -> approval-gated workflow -> project & deliverable tasks, persistent stopwatch recovery across reload, Knowledge Hub note indexing & 6/6 RAG evaluation, offline AI Copilot draft + zero `localStorage`/`sessionStorage` secrets, live DB `v3` health diagnostics, offline mode navigation, and zero `console.error`/`pageerror`.
- **Production & PWA Build:** `npm run build` (`vite build` + `vite-plugin-pwa`)
- **Dependency Audit Note:** Workspace uses `bun.lock`; `npm audit --omit=dev` fails with `ENOLOCK` unless `npm i --package-lock-only` or `bun pm audit` is used manually.

