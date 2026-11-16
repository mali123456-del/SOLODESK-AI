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
- **Production & PWA Build:** `npm run build` (`vite build` + `vite-plugin-pwa`)
