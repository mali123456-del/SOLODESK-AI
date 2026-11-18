# Phase 27 Hybrid RAG v3 Architecture

**Modules:** `src/ai/rag/semanticVector.ts`, `src/ai/rag/retrieval.ts`, `src/ai/knowledge/knowledgeService.ts`, `server/rag/ragService.ts`  
**Status:** `IMPLEMENTED AND VERIFIED`

---

## 1. Dual Client + Server Retrieval Design

SOLODESK AI executes Hybrid RAG v3 offline inside the browser (IndexedDB `documentChunks`) and mirrors compatible permission-filtered retrieval on the optional Express backend (`server/rag/ragService.ts`).

### Scoring Pipeline
1. **Lexical Signal:** Field-weighted TF scoring across chunk body (`chunkScore`), document title/heading boost, and tag matching.
2. **128-Dimensional Semantic Hash Projection (`LOCAL_VECTOR_PROVENANCE`):**
   - Model identifier: `fnv1a-trigram-bigram-128d-v3`
   - Embedding kind: `lexical-hash-projection`
   - Bounded LRU/Map vector cache (`MAX_VECTOR_CACHE = 1500`) preventing unbounded memory growth on 8 GB laptops.
3. **Morphological Stem-Verified Fallback (`hasStemMatch`):**
   - When exact keyword overlap is zero (e.g., morphological inflections such as *invoicing* vs *invoice*), permits semantic-only candidate matches ONLY if `cosineSimilarity >= 1.85` (above default semantic cutoff) AND query/chunk keywords share a 6-character prefix (`kw.length >= 6`).
   - Short 2–5 character tokens are excluded from stem fallback so unrelated and prompt-injection queries produce zero false positives.

## 2. Permission Scope Isolation

- `searchKnowledgeBase` defaults to `accessScope: 'workspace'`, strictly filtering out `'internal_only'` notes unless explicitly requested (`includeInternalOnly: true` or `accessScope: 'internal_only'`).
- On the backend (`server/rag/ragService.ts`), `client_viewer` callers are unconditionally pinned to `'client_portal'` scope, and `'internal_only'` queries require `'owner'` or `'admin'` membership.
