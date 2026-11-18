# Phase 26-A Audit Report — SOLODESK AI

**Audit Scope:** Inspection and stabilization of the Phase 0–25 codebase prior to Phase 26–35 SaaS backend, AI Workforce, and commercial expansion.  
**Status:** `IMPLEMENTED AND VERIFIED`

---

## 1. Summary of Pre-Existing Risks Identified & Verified

During the Phase 26-A repository inspection, six concrete architectural and security defects were confirmed in the Phase 0–25 codebase:

1. **Client-Side `@google/genai` SDK Exposure (`src/ai/providers/GeminiProvider.ts`, `vite.config.ts`)**
   - `@google/genai` was imported directly inside browser client code and split into a client `ai-vendor` bundle.
   - `metadata.json` also lacked `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`.
2. **RAG v2 Index Provenance & Morphological Recall Gap (`src/ai/rag/semanticVector.ts`, `src/ai/rag/retrieval.ts`)**
   - Hash-projected 128-dim lexical vectors (`RAG_INDEX_VERSION = 2`) lacked explicit model provenance (`embeddingKind`) and failed inflection/morphological queries (e.g., *invoicing* vs *invoice*) when exact tokens did not overlap.
   - `searchKnowledgeBase` did not exclude `internal_only` notes by default unless explicitly opted in.
3. **False Local Sync `'acked'` Transitions (`src/services/cloudSyncService.ts`, `src/features/cloud/CloudSyncView.tsx`)**
   - Resolving a sync conflict transitioned outbox items directly to `'acked'` locally without confirmation from any remote server.
4. **Webhook URL Registration SSRF Gap (`src/workflows/workflowEngine.ts`, `src/features/workflows/WorkflowsView.tsx`)**
   - Public URL validation had to be enforced at both webhook creation and test dispatch boundaries, with HMAC-SHA256 signing and audit logging on SSRF blocks.
5. **External Client Portal Isolation Boundary (`src/app/App.tsx`, `src/features/portal/ClientPortalView.tsx`)**
   - Accessing `#/client-portal?token=...` needed strict isolation outside `AppShell` so external recipients cannot see sidebar admin routes, command palette, or management tabs.
6. **Recurring Invoice Generation & Overdue Refresh Automation (`src/services/backgroundJobRunner.ts`, `src/app/providers/WorkspaceProvider.tsx`)**
   - Recurring invoices required an idempotent background job runner executing on workspace refresh without generating duplicate drafts.

---

## 2. Verification Basis

All six findings were remediated in Phase 26-A and verified via `tests/unit/phase26a-audit-fixes.test.tsx` (6/6 passing) and production bundle inspection (`dist/assets` contains zero `@google/genai` chunks).
