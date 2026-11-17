# SOLODESK AI — Knowledge & Data Governance Policy

## 1. Zero-PII Public Knowledge Rule
- Built-in knowledge packs (`src/knowledge/built-in/`, 14 MIT-licensed files) contain generalized freelancer operational playbooks, invoice/tax policies, and terminology glossaries with **zero personal data, real emails, client records, or credentials**.
- External third-party corpora containing personal data, unclear commercial rights, or oversized binary dumps (e.g., public Kaggle/Enron CSV & email dumps, 22 MB retail SKU logs) are explicitly audited and marked `rejected` in `src/ai/datasets/registry/datasetRegistry.ts`.

## 2. Client Workspace Isolation
- Client CRM records, project financials, and user-imported Knowledge Hub notes stay strictly inside the user's local IndexedDB (`solodesk_ai_workspace`).
- SOLODESK AI collects **zero** cloud telemetry, uploads **zero** workspace data to external servers, and requires explicit per-session opt-in before attaching local context to any optional BYOK Gemini prompt.

## 3. Untrusted Imported Content Handling
- Local `.txt`/`.md`/`.csv`/`.json` uploads and public URL imports are stripped of `<script>`, `<iframe>`, `<svg>`, `<object>`, and `<embed>` elements, SHA-256 hashed for deduplication, wrapped in `wrapUntrustedContextSnippet()` reference delimiters, and prevented from triggering unapproved tool calls.
