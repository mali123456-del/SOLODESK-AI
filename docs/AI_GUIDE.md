# SOLODESK AI — AI Guide (Optional BYOK Gemini 4 Hydrogen)

SOLODESK AI works **100% offline** with deterministic draft templates (`MockProvider`) and zero API keys.

## Optional Cloud AI Setup
1. Navigate to **Settings -> AI Configuration** or **AI Copilot**.
2. Paste your personal Google Gemini API key into the **Session Gemini API Key** field.
3. SOLODESK AI targets **`gemini-4-hydrogen`** exclusively via `@google/genai`.
4. Your key remains strictly in memory for the active browser tab only.

## Local RAG & Approval-Gated Actions
- **Knowledge Hub Grounding:** Relevant chunks are retrieved locally from IndexedDB (`src/ai/rag/retrieval.ts`) and numbered `[1]`, `[2]`, etc.
- **Explicit Transmission Consent:** Before sending local snippets or workspace summaries to the Gemini API, you must check the **External API Consent** confirmation.
- **Approval-Gated Writes:** Write tools (`create_task_draft`, `create_client_draft`) are Zod-validated and never mutate your database automatically—you must click **Approve & Create** in the UI.
