# Phases 36–60 — Integration Catalog

| Connector / Integration | Module / Route | Local / Offline Behavior | Cloud / Live Status |
| :--- | :--- | :--- | :--- |
| `.ics` iCalendar Export | `src/integrations/calendarEmailAdapter.ts`, `#/communication` | Generates RFC-5545 `.ics` downloads locally offline | Verified locally |
| `mailto:` Draft Handoff | `src/integrations/calendarEmailAdapter.ts` | Opens user mail client cleanly without server SMTP | Verified locally |
| Google Calendar / Microsoft Outlook | `CALENDAR_EMAIL_CONNECTOR_CATALOG` | Documented connector definitions only | `BLOCKED — EXTERNAL REQUIREMENT` (OAuth keys needed) |
| Gmail / Microsoft Graph Send | `CALENDAR_EMAIL_CONNECTOR_CATALOG` | Draft preview + mailto fallback | `BLOCKED — EXTERNAL REQUIREMENT` (OAuth keys needed) |
| Payment Connectors (`payfast_pk`, `safepay`, `jazzcash`, `stripe`) | `src/integrations/paymentConnectors.ts` | Safe checkout blocker + manual payment recording + HMAC webhook verification | Live checkout `BLOCKED — EXTERNAL REQUIREMENT` |
| Outbound Signed Webhooks | `server/jobs/jobRunner.ts`, `server/api/v1/router.ts` | HMAC-SHA256 signing, 5-min timestamp replay protection, secret rotation | Verified locally |
| AI Gateway (`gemini`, `openai_compatible`, `ollama`, `mock`) | `src/ai/providers/registry.ts`, `server/ai/geminiGateway.ts` | Deterministic offline draft & 15-agent simulation | Live Gemini requires `GEMINI_API_KEY` / session header |
