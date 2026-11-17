# Testing & Verification

## Automated Checks
- **TypeScript Strict Check:** `npm run lint` (`npx tsc --noEmit`) — passes with `0` errors.
- **Unit & UI Integration Suite:** `npm test` (`vitest run` with `jsdom` and `fake-indexeddb`)
  - `phase1-foundation.test.tsx`: App shell rendering and hash navigation
  - `phase2-database-money.test.ts`: `big.js` decimal precision, date arithmetic, schema migrations, payments
  - `phase3-4-crm-projects-tasks.test.tsx`: Client duplicate warning, project/task persistence
  - `phase5-documents.test.tsx`: Quotation-to-invoice single conversion guard, unique invoice numbers
  - `phase6-payments-finance-time.test.tsx`: Partial payments, running timer recovery across reloads
  - `phase7-dashboard-search-reports.test.tsx`: Dashboard metrics, Global Search, financial reports CSV
  - `phase8-backup-restore.test.ts`: Plain & AES-GCM encrypted backup roundtrips
  - `phase9-ai-rag-agent.test.ts`: In-memory BYOK isolation, local RAG retrieval, consent & approval gating, manifest validation
  - `phase10-12-pwa-settings-marketing.test.tsx`: Settings persistence and Product Overview navigation
  - `phase13-hardening.test.ts`: Schema v1->v4 migration, `deleteProject` invoice guard & child unlinking, 0/2/3-decimal & odd-cent tax-inclusive `big.js` precision, backup merge `&number` collision renaming + tampered IV rejection, CSV client import & health diagnostics, SSRF IP/redirect protection + HTML sanitization + `robots.txt`, SHA-256 Knowledge dedup + collection filter + `14/14` extended RAG benchmark, and read-only AI tools + idempotent proposal workflows
  - `phase14-backend-ai-rag.test.tsx`: `WorkspaceProvider` / `AppShell` offline + local DB sync telemetry (`syncing`, `synced`, `error`, `Retry`), Dexie `v3->v4` non-destructive migration & appointment FK validation, `v3` backup backward compatibility, invoice aging & estimates-vs-actuals analytics, follow-up queue, overdue invoice workflow + failed run retry + dry-run simulation, `14` built-in MIT knowledge packs, dataset license audit, deduplication, crawler duplicate preview, `MockProvider` grounded response structure, and `14/14` dynamic RAG benchmark assertions
  - **Total Unit & Integration Suite:** `11` test files passed, `50` tests passed (`vitest run` with `jsdom` and `fake-indexeddb`)
- **Browser End-to-End Suite (Playwright Chromium):** `npm run test:e2e` (`playwright test` against built `dist/` via `vite preview`)
  - Runs headless Chromium (`/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell`) verifying `/manifest.webmanifest` & `/sw.js`, onboarding & workspace creation, desktop (`1280x800`) and mobile (`375x812`) zero-overflow checks, client IndexedDB reload persistence, Service Catalog -> Invoice quick-insert, Communication Hub appointment creation, Workflows dry-run + approval-gated execution, Reports Estimates vs Actuals + Aging views, Knowledge Hub `14` built-in packs + Dataset Audit + `14/14 (100%)` RAG evaluation, offline AI Copilot draft + zero `localStorage`/`sessionStorage` secrets, live DB `v4` health diagnostics & Sync telemetry card, `Offline · Local DB` banner in offline context mode, and zero `console.error`/`pageerror`.
- **Production & PWA Build:** `npm run build` (`vite build` + `vite-plugin-pwa`) — transforms `2,875` modules, builds `dist/` with Workbox `dist/sw.js` precaching `66` entries (`2,857.81 KiB`).
- **Dependency Audit Note:** Workspace uses `bun.lock` (`bun pm licenses` verified `527` installed packages across `13` license expressions with `0` GPL/AGPL blockers); `npm audit --omit=dev` returns `ENOLOCK` unless a temporary lockfile is generated in CI.
