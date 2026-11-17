# SOLODESK AI — AI Copilot Architecture

## 1. Offline-First Provider Model
- **Default Provider (`MockProvider`, `local-offline-template-v2`):** Runs 100% offline with zero network calls or API keys. Produces structured responses separated into **1. Verified Workspace Facts**, **2. Recommended Draft**, and **3. Missing Information to Confirm** (`src/ai/providers/MockProvider.ts`).
- **Optional Cloud Provider (`GeminiProvider`):** Uses user-supplied BYOK key via `@google/genai`. Keys exist exclusively in volatile module memory (`src/ai/providers/providerFactory.ts`) — never persisted to `localStorage`, `sessionStorage`, IndexedDB, or JSON backups.
- **Consent Gate:** Sending local workspace or Knowledge Hub context to Gemini is blocked unless the user explicitly checks external context transmission consent.

## 2. Allowlisted Tool System (`src/ai/agent/tools.ts`)
- **Read-Only Analytical Tools:**
  - `get_workspace_summary`, `search_clients`, `search_projects`, `search_tasks`, `list_overdue_invoices`, `analyze_invoice_aging`, `explain_invoice`, `explain_project_profitability`, `summarize_business_report`, `suggest_expense_category`, `search_knowledge_base`.
- **Approval-Gated Draft Action Tags (`<proposed_action>`):**
  - `create_client_draft`, `create_project_draft`, `create_task_draft`, `create_proposal_draft`, `create_invoice_followup_draft`.
  - Executed strictly via `runActionWithApproval()` only after explicit user confirmation in `AICopilotView`.

## 3. Architecture Boundaries
- Zero fine-tuning or local weight training occurs inside SOLODESK AI. Capabilities rely on deterministic RAG retrieval, structured prompt templates (`src/ai/prompts/promptTemplates.ts`), allowlisted read-only analytics tools, and user-approved drafts.
