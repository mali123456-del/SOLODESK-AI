# Phase 26-A Fix Log — SOLODESK AI

**Status:** `IMPLEMENTED AND VERIFIED`

| Defect ID | Area | Change Implemented | Verification Evidence |
| :--- | :--- | :--- | :--- |
| `FIX-26A-01` | Server-Side Gemini Boundary | Removed `@google/genai` from `src/ai/providers/GeminiProvider.ts` and `vite.config.ts`. Routed requests through `/api/v1/ai/generate` (optional in-memory `X-Gemini-Key`). Added `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` to `metadata.json`. | `npm run build` (`dist/assets` has no `ai-vendor` or `@google/genai` bundle); `tests/unit/phase26a-audit-fixes.test.tsx`. |
| `FIX-26A-02` | Hybrid RAG v3 & Access Scope | Bumped `RAG_INDEX_VERSION = 3`, exported `LOCAL_VECTOR_PROVENANCE`, added bounded 1500-entry vector cache, 6-char morphological stem fallback (`minSemanticOnlyThreshold = 1.85`), and defaulted `searchKnowledgeBase` to `accessScope: 'workspace'` excluding `internal_only`. | `tests/unit/phase26a-audit-fixes.test.tsx`; 25/25 RAG benchmark pass in `npm run test:e2e`. |
| `FIX-26A-03` | Honest Sync ACK Contract | Replaced fake local `'acked'` status on conflict resolution with `buildResolvedPendingPatch` (`status: 'pending'`), implemented HTTP `pushSyncQueueToServer` with idempotency keys, and added `'admin'` to `ROLE_PERMISSION_MATRIX`. | `tests/unit/phase26a-audit-fixes.test.tsx` & `tests/integration/phase26b-saas-backend.test.ts`. |
| `FIX-26A-04` | Webhook SSRF & HMAC Signing | Added `validatePublicHttpUrl` enforcement + `webhook_ssrf_blocked` audit logging on webhook creation/dispatch and `signWebhookPayload` HMAC-SHA256 signing headers (`X-Solodesk-Delivery-Id`, `X-Solodesk-Event`). | `tests/unit/phase26a-audit-fixes.test.tsx`. |
| `FIX-26A-05` | External Client Portal Isolation | `#/client-portal?token=...` now renders outside admin `AppShell` without sidebar, Command Palette, Onboarding modal, or management tabs, and records `portal_access` / `portal_denied` audit events. | `tests/unit/phase26a-audit-fixes.test.tsx`; `npm run test:e2e` step 13. |
| `FIX-26A-06` | Idempotent Recurring Jobs | Added `runWorkspaceBackgroundJobs()` in `src/services/backgroundJobRunner.ts` advancing `nextRecurrenceDate` before draft creation and refreshing overdue invoices cleanly inside `WorkspaceProvider.refresh()`. | `tests/unit/phase26a-audit-fixes.test.tsx`. |
