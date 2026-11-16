# SOLODESK AI — Release Baseline Audit (Phase Zero)

**Audit Date:** 2026-11-16  
**Target Release Checkpoint:** 2026-12-05  
**Workspace Path:** `/app/applet` (GitHub target reference: `https://github.com/mali123456-del/SOLODESK-AI`)

---

## 1. Repository & Package State

| Check | Actual Observed State |
|---|---|
| Git repository | No `.git` directory initialized inside `/app/applet` (`git status` -> `fatal: not a git repository`) |
| Package manager & lockfile | `bun.lock` present (159,029 bytes); no `package-lock.json` (`npm audit` returned `ENOLOCK`) |
| Package name / version | `solodesk-ai` v`1.0.0` (`"type": "module"`) |
| Core runtime stack | `react` ^19.3.1, `react-dom` ^19.3.1, `vite` ^8.3.0, `typescript` ^7.0.2, `tailwindcss` ^4.3.5 |
| Local database & decimal math | `dexie` ^4.4.7, `zod` ^4.6.7, `big.js` ^7.0.1 |
| Exports, charts & AI | `jspdf` ^4.2.1, `recharts` ^3.10.1, `lucide-react` ^1.73.0, `@google/genai` ^2.32.0 |
| PWA tooling | `vite-plugin-pwa` ^2.0.0 (Workbox `generateSW`) |
| Test stack | `vitest` ^5.1.0, `@testing-library/react` ^16.3.3, `jsdom` ^31.0.1, `fake-indexeddb` ^6.2.8 |
| Playwright / Chromium | Not installed in `package.json`; no `chromium`/`google-chrome` binary present in container PATH |

---

## 2. Baseline Verification Commands Executed (2026-11-16)

| Script / Command | Underlying Action | Observed Result |
|---|---|---|
| `npm run lint` | `tsc --noEmit` | **PASS** — 0 TypeScript errors |
| `npm test` | `vitest run` | **PASS** — 9 test files, 37/37 tests passed in 27.48s |
| `npm run build` | `vite build` | **PASS** — 2,840 modules built in 2.22s; PWA v2.0.0 generated `dist/sw.js` (59 precache entries, 2680.44 KiB) & `dist/manifest.webmanifest` |
| `npm audit --omit=dev` | npm lockfile vulnerability scan | **BLOCKED (ENOLOCK)** — workspace uses `bun.lock` rather than `package-lock.json` |

### Baseline Bundle Sizes (Observed `vite build` Output)
- `dist/index.html`: `2.25 kB` (gzip `0.83 kB`)
- `dist/assets/index-*.css`: `48.41 kB` (gzip `8.87 kB`)
- Core app bundle (`index-*.js`): `227.79 kB` (gzip `61.36 kB`)
- Split vendor chunks: `react-vendor` (`395.20 kB`), `dexie-vendor` (`97.73 kB`), `charts-vendor` (`437.33 kB`), `pdf-vendor` (`400.55 kB` + `html2canvas` `199.40 kB`), `ai-vendor` (`392.10 kB`), lazy-loaded feature views (`3.5 kB`–`27.9 kB`).

---

## 3. Audit Discrepancies vs. Phase 1–12 Summary

1. **Test Scope:** Unit/component tests (37/37) pass under `jsdom` + `fake-indexeddb`, but **no Playwright Chromium E2E tests** exist or have run yet.
2. **Backend Referential & Transaction Gaps (`dexieRepositories.ts`):**
   - `deleteProject()` deletes a project without checking linked invoices/payments or unlinking tasks/time entries.
   - `updateInvoice()` and `stopTimer()` are not wrapped in atomic `db.transaction('rw', ...)`.
   - `recordPayment()` uses `currentSummary.balanceDue + 0.0001` float tolerance rather than exact `big.js` decimal comparison.
   - `updateTask()` does not validate `projectId` / `clientId` changes; `createManualTimeEntry()` does not validate referenced `projectId` / `taskId`.
3. **Backup Merge Conflict Risk (`backupService.ts`):**
   - `invoices` table enforces unique `&number` index, yet `restoreBackupPayload(..., 'merge')` runs `bulkPut` without reconciling a DIFFERENT invoice `id` carrying an already-existing invoice `number` (can throw `ConstraintError` mid-restore).
   - `BackupInspectionResult` inspects only clients, invoice numbers, projects, and tasks — omitting counts/overlap summaries for quotations, proposals, contracts, payments, finance entries, time entries, and knowledge docs.
   - Encrypted backup uses `100_000` PBKDF2 iterations and does not validate decoded 16-byte salt / 12-byte IV lengths before calling Web Crypto `decrypt`.
4. **Security & Controlled Importer:**
   - No `Content-Security-Policy` meta/header policy tested on `index.html`.
   - No `src/security/` module for SSRF-safe URL validation or HTML-to-plain-text sanitization.
   - No user-triggered URL importer (`src/integrations/crawler/`).
5. **AI, RAG & Workflow Engine:**
   - `KnowledgeDocument` lacks `contentHash` deduplication, `collection`, `sourceUrl`, `processingStatus`, and `licenseOrRights` fields (needs Dexie **v3** migration).
   - `retrieval.ts` lacks term-frequency caps, collection/tag filtering, and per-document chunk diversity; benchmark only evaluates 2 cases without Recall@K / Precision@K / citation accuracy metrics.
   - `tools.ts` lacks invoice explanation, project profitability explanation, expense categorization suggestion, and report summary tools; no model capability registry exists (`src/ai/providers/registry.ts`).
   - No structured approval-gated Workflow Engine (`src/workflows/`) exists yet.
6. **Storage Diagnostics & CSV Validation:**
   - Settings Privacy & Storage lacks live database table counts, orphan diagnostics, and storage quota percentage alert.
   - `ClientsView.tsx` embeds CSV client-import validation/deduplication directly inside the React component instead of a testable domain/import service.
