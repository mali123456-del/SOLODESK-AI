# Phase 31 Launch Operations & Support Workflows

**Modules:** `server/api/v1/router.ts`, `src/services/backendAuthClient.ts`, `src/features/commercial/HelpPlansTourView.tsx`  
**Status:** `IMPLEMENTED AND VERIFIED`

---

## 1. Support & Commercial Inquiry Intake

- Authenticated users can submit categorized support or upgrade inquiries (`billing_upgrade`, `payment_gateway`, `technical_support`, `enterprise`) stored persistently in SQLite table `support_requests`.
- When running offline or in static PWA builds without a connected backend, `submitBackendSupportRequest` logs an audit/activity record cleanly inside local IndexedDB instead of throwing or losing user intent.

## 2. Operational Readiness Endpoints

- `GET /api/v1/health` — process liveness JSON response
- `GET /api/v1/ready` — verifies SQLite connection (`SELECT 1`), applied migration count, telemetry counters, and server `GEMINI_API_KEY` availability without leaking key values
- `GET /api/v1/docs` — machine-readable OpenAPI 3.1.0 endpoint catalog.
