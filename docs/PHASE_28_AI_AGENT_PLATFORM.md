# Phase 28 Staged 15-Agent AI Platform

**Registry & Execution Engine:** `src/ai/agents/agentRegistry.ts`  
**UI Console:** `src/features/assistant/AICopilotView.tsx` (`AI Workforce (15 Agents)` tab)  
**Status:** `IMPLEMENTED AND VERIFIED`

---

## 1. Staged Three-Class Least-Privilege Workforce (15 Agents)

### Class 1 — Read-Only (7 Agents)
1. `Workspace Analyst Agent` (`workspace_analyst`)
2. `Knowledge Research Agent` (`knowledge_researcher`)
3. `Financial Intelligence Agent` (`financial_intelligence`)
4. `Schedule & Dependency Auditor` (`schedule_dependency_auditor`)
5. `Client Relationship Analyst` (`client_relationship_analyst`)
6. `Security & Compliance Auditor` (`security_compliance_auditor`)
7. `BI Narrative Summarizer` (`bi_narrative_summarizer`)

### Class 2 — Draft-Only (6 Agents)
8. `Proposal Drafter Agent` (`proposal_drafter`)
9. `Quotation & Pricing Drafter` (`quotation_pricing_drafter`)
10. `Contract Clause Drafter` (`contract_clause_drafter`)
11. `Client Outreach & Follow-Up Agent` (`client_outreach_agent`)
12. `Task & Sprint Planner Agent` (`task_sprint_planner`)
13. `Executive Digest Writer` (`executive_digest_writer`)

### Class 3 — Approval-Required (2 Agents)
14. `Workflow Action Proposer` (`workflow_action_proposer`)
15. `Solodesk Orchestrator Agent` (`solodesk_orchestrator`)

## 2. Permission & Safety Controls

- **Tool Allowlists (`assertAgentToolAllowed`):** Every agent has an explicit `allowedTools` list verified before tool invocation; write tools throw immediately if invoked on any `read_only` or `draft_only` agent.
- **Human Approval Gate:** Class 3 agents NEVER mutate IndexedDB directly. They emit structured `ProposedAgentAction` payloads validated with Zod and gated by `runActionWithApproval(action, approved)` (`Approve & Create` / `Dismiss` buttons).
- **AbortSignal Cancellation & Run Accounting:** Every run tracks `runId`, `status` (`completed`/`cancelled`/`failed`), `durationMs`, `estimatedTokens`, invoked tools, and writes an `agent_execution` audit entry.
