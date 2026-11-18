# SOLODESK AI — Hybrid RAG v2 & AI Copilot Evaluation

**Updated:** 2026-11-17

## 1. Hybrid RAG v2 Pipeline

- **Vector Embeddings (`src/ai/rag/semanticVector.ts`):** Deterministic 128-dimension normalized hashed token & character n-gram projections (`RAG_INDEX_VERSION = 2`), running with zero external embedding API dependency or GPU requirement.
- **Hybrid Scoring (`src/ai/rag/retrieval.ts`):** Combines weighted lexical keyword matching (stem normalization, phrase bonus, stopword filtering) with semantic cosine similarity, citation chunk IDs, and `accessScope` permission filtering (`workspace_all` / `internal_only` / `client_safe`).
- **Offline & BYOK Providers (`src/ai/providers/providerFactory.ts`):**
  - Default **Offline / Local Draft Mode**: Always functional with zero network/API keys.
  - **Google Gemini** (`GeminiProvider` via `@google/genai`, memory-only API key).
  - **OpenAI-Compatible** (`OpenAICompatibleProvider` configurable base URL + model + memory-only key).
  - **Local Ollama** (`OllamaProvider`, `http://localhost:11434` endpoint).

## 2. Verified 25-Case Extended Benchmark Results

Measured directly via `runExtendedRagBenchmark(3)` (`npx tsx` live execution & `npm test` `phase13-hardening.test.ts` / `phase15-25-features.test.tsx`):

| Metric | Verified Result | Notes |
| :--- | :--- | :--- |
| **Benchmark Cases Passed** | **25 / 25 (100%)** | Up from 14 cases in Phase 14 |
| **Synthetic Corpus Size** | **18 docs / 18 chunks** | Indexed payload size: `10,789 bytes` (`10.54 KiB`) |
| **Recall@3** | **100%** (`1.000`) | All positive queries retrieve expected source in Top-3 |
| **Precision@3** | **67.9%** (`0.679`) | Expected for 1–2 relevant chunks per query at fixed `k=3` |
| **Citation Accuracy** | **100%** (`1.000`) | Top-1 citation matches expected document on all positive cases |
| **Unsupported False Positive Rate** | **0%** (`0 / 6` negative + adversarial cases) | Rejects out-of-scope, missing-source, conflicting, and prompt-injection queries |
| **Duplicate Chunk Rate** | **0%** (`0` duplicates) | Unique chunk IDs across all retrieved top-k hits |
| **Total Run Duration** | **34.589 ms** | Mean latency: **1.384 ms / query** |

## 3. Built-In Knowledge Packs & License Hygiene

- **14 MIT-Licensed First-Party Packs (`src/knowledge/built-in/`):** Retainers, scope changes, invoicing/tax SOPs, profitability, prompt safety, backup SOPs, client onboarding, Document Vault, Portal isolation, multi-currency FX, Gantt/critical path, Focus Mode, Sync Queue, and Security Audit policy.
- Zero third-party scraped datasets are bundled in the default repository.
