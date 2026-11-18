# Phase 58 — Security & Privacy Audit (OWASP ASVS Reference)

| Domain | Verification Result | Implementation Reference |
| :--- | :--- | :--- |
| Tenant & Workspace Isolation | Verified (SQLite tests + PG RLS SQL) | `assertWorkspaceAccess`, `001`/`002` Postgres RLS policies |
| Client Secret Exposure | Verified (`0` `localStorage`/`sessionStorage` keys; `0` `@google/genai` client chunks) | `tests/e2e/solodesk.spec.ts`, Vite client bundle audit |
| SSRF / URL Crawler Safety | Verified HTTPS + private/loopback IP blocks + size caps + HTML sanitization | `src/ai/crawler/` (with browser CORS limitation documented) |
| Webhook Security | Verified HMAC-SHA256 + 5-min replay rejection + secret rotation | `server/jobs/jobRunner.ts`, `phase36-60-backend.test.ts` |
| Auth & Reset Hygiene | Verified `scryptSync` + SHA-256 hashed tokens + all-session revocation on reset | `server/auth/authService.ts` |
| Prompt Injection & Agent Bounds | Verified read-only/draft-only enforcement + Zod schemas + injection stripping | `src/ai/agents/agentRegistry.ts` |
| Open Medium Risk (Non-Local) | Live cloud email/calendar OAuth & live Postgres require production HTTPS + Vault env | `PHASE_36_60_KNOWN_LIMITATIONS.md` |
