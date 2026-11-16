# SOLODESK AI — Deadline Execution Plan (Target: 5 December 2026)

**Current Date:** 16 November 2026  
**Deadline:** 5 December 2026  
**Execution Principle:** Backend & Data Integrity First -> AI & Knowledge -> Frontend & Workflows -> Security & Full QA -> Release Verification.

---

## Phase Schedule & Scope Allocation

### Stage 1: Phase Zero Baseline & Audit (16–17 Nov) — Completed
- Verified clean baseline (`tsc --noEmit` 0 errors, Vitest 9 files / 37 tests passed, `vite build` + PWA SW succeeded).
- Documented discrepancies, architecture snapshot, and prioritized P0–P2 gaps.

### Stage 2: Backend, Database & Backup Hardening (18–21 Nov) — P0 Priority
- Add `src/core/errors.ts` (typed domain/storage errors, `QuotaExceededError` classifier) and `src/observability/healthCheck.ts` (record counts, orphan scan, storage quota diagnostics).
- Implement non-destructive Dexie **v3** migration (`workflowRuns` table + enriched `KnowledgeDocument` provenance/hash/collection fields).
- Harden `dexieRepositories.ts` (`db.transaction` on `updateInvoice` and `stopTimer`, exact `big.js` payment bounds, FK validation on tasks/time entries, safe `deleteProject` guard/unlink).
- Harden `backupService.ts` (reconcile unique `&number` invoice conflicts in merge mode, full entity conflict inspection, 210k PBKDF2 with v1 100k backward compatibility, decoded salt/IV validation, rollback/snapshot safety).
- Extract `src/services/importService.ts` for validated CSV client imports.

### Stage 3: AI, Knowledge Hub RAG, Datasets & Workflow Engine (22–24 Nov) — P1 Priority
- Add provider capability registry (`src/ai/providers/registry.ts`) preserving configurable `gemini-4-hydrogen` + guaranteed offline `MockProvider`.
- Expand allowlisted AI Copilot tools (`explain_invoice`, `explain_project_profitability`, `suggest_expense_category`, `summarize_business_report`) grounded strictly in Dexie data.
- Upgrade RAG ingestion & retrieval (SHA-256 content deduplication, collection/tag filtering, term-frequency capped scoring, per-doc diversity) and expand evaluation benchmark (>= 6 curated cases measuring Recall@K, Precision@K, citation accuracy, duplicate suppression, latency).
- Implement approval-gated `src/workflows/workflowEngine.ts` (`proposal_to_project_and_tasks`, `quotation_to_invoice_draft`) with idempotency via `workflowRuns`.
- Implement safe single-URL importer (`src/integrations/crawler/urlImporter.ts`) + `src/security/urlPolicy.ts` & `src/security/sanitize.ts`.

### Stage 4: Frontend Polish & Connected Workflows (25–28 Nov) — P0/P1 Priority
- Expose Database Health Diagnostics cleanly inside Settings -> Privacy & Storage.
- Add URL Importer modal/tab & Collection filter inside Knowledge Hub.
- Surface one-click "Generate Project & Tasks Draft" from accepted Proposals via the approval-gated Workflow Engine.
- Audit forms, empty states, error alerts, responsive tables, keyboard accessibility, and print CSS across feature views.

### Stage 5: Security Hardening, Unit/Integration & Playwright E2E QA (29 Nov–2 Dec) — Release Blocking
- Add tested Content Security Policy (`index.html`) verified not to block Google Fonts, Recharts SVGs, jsPDF, Vite SW, or Gemini API.
- Expand Vitest tests covering migrations (v1->v2->v3), financial rounding edge cases, backup `&number` conflicts & tampered encryption, URL SSRF blocking, RAG metrics, AI tools, and workflows.
- Attempt Playwright Chromium E2E setup & run 20 user flows + mobile/desktop + PWA offline checks against `vite preview` (or capture exact system blocker & Windows command).

### Stage 6: Release Candidate Documentation & Final Report (3–5 Dec)
- Update all Section 16 docs (`DATABASE.md`, `DATA_MODEL.md`, `API_AND_SERVICE_CONTRACTS.md`, `AI_ARCHITECTURE.md`, `RAG_ARCHITECTURE.md`, `DATASET_REGISTRY.md`, `DATASET_LICENSE_AUDIT.md`, `CRAWLER_SAFETY.md`, `SECURITY_REVIEW.md`, `PRIVACY_MODEL.md`, `THREAT_MODEL.md`, `PWA.md`, `TESTING.md`, `KNOWN_LIMITATIONS.md`, `CHANGELOG.md`, `RELEASE_CHECKLIST.md`, `README.md`).
- Run final `tsc --noEmit`, `vitest run`, `vite build`, and bundle measurement; deliver evidence-based Section 18 classification report.
