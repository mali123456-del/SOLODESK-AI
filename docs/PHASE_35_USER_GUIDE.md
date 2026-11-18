# Phase 35 SOLODESK AI — User Guide

**Product:** SOLODESK AI  
**Tagline:** Manage Your Business. Master Your Workflow. Grow Smarter.  
**Status:** `IMPLEMENTED AND VERIFIED`

---

## Getting Started (Offline-First & Optional Cloud Sync)

1. **Zero-Cost Local Workspace:** Launch the app and complete quick onboarding (name your studio, choose currency/date format, optionally load `[Demo]` records). Everything persists locally inside IndexedDB (`v5`).
2. **Daily & Weekly Digest + Focus Mode:** Review overdue tasks, pending invoices, milestones, and calls on Dashboard; switch between `Daily` and `Weekly` digests; click **Focus Mode** to hide navigation and track one task with an embedded live timer.
3. **CRM, Projects, Time & Finance:** Manage clients (duplicate detection), Gantt timelines, dependency-guarded tasks, proposals -> quotations -> `big.js` multi-currency invoices, recurring bills, payments, Vault documents, and PDF exports.
4. **AI Copilot & 15-Agent Workforce (`#/ai-copilot`):**
   - Works offline out of the box with deterministic local templates.
   - Optionally connect an in-memory session Gemini key (`Clear Key` anytime) or Ollama loopback endpoint.
   - Switch to **AI Workforce (15 Agents)** to run scoped Read-Only analysts, Draft-Only writers, or Class 3 `Workflow Action Proposer` / `Solodesk Orchestrator` (human **Approve & Create** required before any database write).
5. **Knowledge Hub (`#/knowledge`):** Load all 14 MIT freelancer packs, add scoped notes (`workspace`, `client_portal`, `internal_only`), inspect Dataset Audit compliance, and run Hybrid RAG v3 checks.
6. **Optional Cloud Sync (`#/cloud-sync`) & Backups (`#/settings-backup`):** Register/sign in to an optional `/api/v1` backend session to push/pull outbox changes, and regularly export encrypted AES-GCM JSON backups.
