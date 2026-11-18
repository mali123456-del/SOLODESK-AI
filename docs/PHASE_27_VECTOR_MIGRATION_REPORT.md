# Phase 27 Vector Migration & Embedding Honesty Report

**Version:** `RAG_INDEX_VERSION = 3` (upgraded from v2)  
**Status:** `IMPLEMENTED AND VERIFIED` (Local Deterministic Vector + SQLite Storage) | `BLOCKED — EXTERNAL REQUIREMENT` (live hosted PostgreSQL `pgvector` execution)

---

## 1. Honest Vector Provenance Disclosure

Previous builds risked ambiguity around the 128-dimension similarity vector. Phase 26-A/27 makes provenance explicit in code (`LOCAL_VECTOR_PROVENANCE` in `src/ai/rag/semanticVector.ts`):
- **Actual Method:** Deterministic FNV-1a hashed character-trigram + word-bigram 128-dim signed projection (`embeddingKind: 'lexical-hash-projection'`).
- **Why:** Zero neural model weight downloads, sub-millisecond indexing latency on Core i5-4200U / 8 GB RAM hardware, 100% offline deterministic reproducibility, and zero cloud embedding API fees.
- **Metadata on Citations:** Search results attach `matchMode` (`hybrid` vs `semantic_morphological_fallback`) and `vectorModel`.

## 2. Server SQLite + PostgreSQL `pgvector` Readiness

- **SQLite (`knowledge_chunks`):** Stores serialized `vector_json` arrays alongside chunk keywords, source references, `access_scope`, and license metadata (`server/database/sqliteDb.ts`).
- **PostgreSQL `pgvector` (`server/database/pgMigrations/001_postgresql_rls_pgvector.sql`):** Defines the `pgvector` extension schema ready for neural embeddings (e.g., `vector(128)` / `vector(768)`) when an external PostgreSQL + hosted embedding provider is provisioned (`BLOCKED — EXTERNAL REQUIREMENT`).
