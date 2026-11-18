# Phase 47 — Staged 15-Agent AI Workforce

- **Registry & Governance (`src/ai/agents/agentRegistry.ts`):**
  - 15 typed domain agents across three strict autonomy tiers:
    1. `read_only` (e.g., `workspace_analyst`, `rag_researcher`, `risk_auditor`, `financial_forecaster`, `crm_health_scanner`) — blocked from any DB write/dispatch.
    2. `draft_only` (e.g., `proposal_drafter`, `email_drafter`, `contract_reviewer`, `sop_writer`, `seo_content_assistant`) — produces editable drafts only; blocked from external send.
    3. `approval_required` (e.g., `task_planner`, `invoice_chaser`, `retainer_renewer`, `workflow_executor`, `client_portal_publisher`) — creates preview plans requiring explicit human confirmation.
- **Enforcement:**
  - Zod `agentRunInputSchema` validates every agent invocation at runtime.
  - Explicit `timeoutMs` and `tokenBudget` bounds per agent; orchestrator cannot escalate child permissions; prompt injection markers are neutralized before context binding.
- **Verification:** Covered by `tests/unit/phase28-31-agents-datasets-bi.test.tsx`, `tests/unit/phase36-60-features.test.tsx`, and E2E Step 9.
