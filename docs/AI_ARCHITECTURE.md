# SOLODESK AI — AI Architecture

SOLODESK AI follows an **AI-Optional, Local-First** architecture. Every core business workflow functions 100% offline with zero API keys.

## Provider Abstraction (`src/ai/providers/`)
- **`AIProvider` (`AIProvider.ts`):** Interface exposing `id`, `label`, `modelId`, `isConfigured()`, `generateText()`, and `testConnection()`.
- **`registry.ts`:** Provider-neutral capability metadata (`AI_PROVIDER_REGISTRY`) defining default model (`gemini-4-hydrogen`), context limits, BYOK memory-only requirement, and offline fallback metadata.
- **`GeminiProvider` (`GeminiProvider.ts`):** Uses `@google/genai` SDK targeting configurable `modelId` (default `gemini-4-hydrogen`), timeout AbortController (25s default), and mapped error codes (`missing_key`, `offline`, `unauthorized`, `rate_limited`, `timeout`, `network`).
- **`MockProvider` (`MockProvider.ts`):** Deterministic local drafting engine requiring zero network access; automatically invoked when no key is set or when cloud calls fail.
- **`providerFactory.ts`:** Holds optional session Gemini API keys **strictly in JS module memory** (`let sessionGeminiKey = ''`). Never persisted to IndexedDB, `localStorage`, `sessionStorage`, or backups.

## Agent Isolation & Tool Registry (`src/ai/agent/`)
- **System Instructions (`systemInstructions.ts`):** Enforces grounding in provided context, bans silent mutations, and treats retrieved Knowledge Hub snippets strictly as untrusted data.
- **Allowlisted Tools (`permissions.ts`, `schemas.ts`, `tools.ts`):**
  - *Read-only tools (auto-allowed when invoked locally):* `get_workspace_summary`, `search_clients`, `list_overdue_invoices`, `search_knowledge`, `explain_invoice`, `explain_project_profitability`, `suggest_expense_category`, `summarize_business_report`.
  - *Write tools (explicit UI approval mandatory via `runActionWithApproval` in `actionApproval.ts`):* `create_task_draft`, `create_client_draft`.
- **Workflow Engine (`src/workflows/workflowEngine.ts`):** Converts accepted Proposals into draft Projects and deliverable Tasks only after explicit user preview + confirmation, logging immutable `workflowRuns` records to block duplicate runs.
