# Phase 48 — Hybrid RAG v3 & Retrieval Evaluation

- **Indexing & Retrieval (`src/ai/rag/`, `src/knowledge/built-in/`):**
  - 14 bundled MIT-licensed first-party freelancer operational knowledge packs (`~28 KB`) plus user notes and sanitized URL imports.
  - Hybrid sparse keyword + structural metadata scoring with client-scope filtering (`restricted`/internal chunks blocked from client portal queries).
  - Deduplication by content hash and explicit citation mapping to source `documentId` + `chunkIndex`.
  - Unsupported answers return explicit uncertainty rather than hallucinating citations.
- **Evaluation Benchmark (`src/ai/evaluation/test-cases/sampleCases.ts`):**
  - 25 deterministic benchmark queries validating Recall@K, Precision@K, Citation Accuracy, Duplicate Suppression, Unsupported Rejection, and Prompt-Injection boundary isolation.
  - Verified live in Playwright E2E Step 8 (`25/25 (100%)` pass).
