# Phases 36–60 — Known Limitations & External Blockers

1. **Hosted PostgreSQL / Supabase Cluster (`BLOCKED — EXTERNAL REQUIREMENT`):** Migration files `001` and `002` are ready under `server/database/pgMigrations/`, but remote `psql`/Supabase execution requires production `DATABASE_URL` credentials outside this sandbox.
2. **Live Payment Gateways (`BLOCKED — EXTERNAL REQUIREMENT`):** `payfast_pk`, `safepay`, `jazzcash`, and `stripe` adapters validate payloads and verify webhook signatures, while `initiateHostedCheckoutSession` honestly returns `blocked: true` until merchant API keys are supplied.
3. **Live Cloud OAuth (Google Calendar, Gmail, Microsoft 365) (`BLOCKED — EXTERNAL REQUIREMENT`):** Offline `.ics` downloads and `mailto:` handoffs work locally; two-way OAuth sync requires registered OAuth client credentials.
4. **Live LLM Inference Without Credentials (`BLOCKED — EXTERNAL REQUIREMENT`):** Deterministic offline drafting and 15-agent simulations work offline; live Gemini / OpenAI-compatible / Ollama calls require valid keys or an active local Ollama endpoint.
5. **Browser Crawler CORS Boundary:** Client-side URL fetching is governed by standard browser CORS policies unless routed through a server fetch proxy.
6. **Git Repository Metadata:** Workspace runs without `.git` (`NO_GIT`); commit SHA tracking is external to the workspace.
