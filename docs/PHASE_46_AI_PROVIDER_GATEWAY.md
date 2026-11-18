# Phase 46 — AI Provider Gateway & Cost Controls

- **Provider Registry (`src/ai/providers/registry.ts`):**
  - Declares explicit capabilities, `rateLimitRpm`, `timeoutMs`, and `retryPolicy` (`maxRetries`, `baseDelayMs`) for 4 adapters: `mock`, `gemini`, `openai_compatible`, and `ollama`.
  - Clearly separates deterministic `Offline / Local Draft Mode` (`MockProvider` / rule engine) from live LLM providers—never misrepresenting mock output as trained intelligence.
- **Server-Side Key Isolation (`server/ai/geminiGateway.ts`):**
  - `@google/genai` is imported strictly on the server (`/api/v1/ai/*`); browser bundle contains zero `@google/genai` SDK code or embedded keys.
  - Session BYOK keys remain in React memory only (`0` bytes in `localStorage`/`sessionStorage`/backups).
- **Live Verification Status:** Live Gemini/OpenAI/Ollama endpoints remain `BLOCKED — EXTERNAL REQUIREMENT` unless valid API keys or local Ollama runtime are supplied at runtime.
