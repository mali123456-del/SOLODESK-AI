# Phase 28 AI & RAG Evaluation Report

**Modules:** `src/ai/evaluation/evaluation.ts`, `src/ai/evaluation/test-cases/sampleCases.ts`, `tests/unit/phase28-31-agents-datasets-bi.test.tsx`  
**Status:** `IMPLEMENTED AND VERIFIED`

---

## 1. Directly Observed Evaluation Metrics

### Hybrid RAG v3 Extended Benchmark (25 Synthetic Cases)
Verified both in unit tests (`tests/unit/phase9-ai-rag-agent.test.ts`, `tests/unit/phase26a-audit-fixes.test.tsx`) and live Chromium E2E (`npm run test:e2e` step 8 via UI button `Run Local RAG Check`):
- **Cases Passed:** `25/25 (100%)`
- **Recall@3 / Precision@3 / Citation Accuracy:** `100%` across curated workspace/client-portal queries, morphological fallback queries, negative queries, and prompt-injection tests (`internal_only` notes and injection strings produce zero false positives).

### AI Workforce Safety & Determinism Suite (`tests/unit/phase28-31-agents-datasets-bi.test.tsx`)
- Verifies exact agent distribution (`7 read_only`, `6 draft_only`, `2 approval_required` = `15` total).
- Verifies zero IndexedDB mutations occur before explicit `runActionWithApproval(action, true)`.
- Verifies `AbortSignal` cancellation transitions status cleanly to `'cancelled'`.
- Verifies non-escalation exceptions throw when testing write tools on read/draft agents or unpermitted sub-agent delegation.

## 2. Live Gemini 4 Hydrogen Generation Scope

Browser runtime builds ship with zero `@google/genai` SDK code (`dist/assets` verified). Server-side Gemini 4 Hydrogen calls execute exclusively via `/api/v1/ai/generate` when `GEMINI_API_KEY` is present on the server or passed intentionally in-memory as `X-Gemini-Key`. Without an active key, the copilot and agent workforce fall back deterministically to offline template synthesis (`isOfflineDraft: true`).
