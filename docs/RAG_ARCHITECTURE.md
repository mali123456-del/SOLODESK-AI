# SOLODESK AI — Local RAG Architecture & Evaluation

SOLODESK AI includes a zero-server, client-side **Knowledge Hub & Retrieval-Augmented Generation (RAG)** pipeline persisted inside IndexedDB (`knowledgeDocs` and `documentChunks`).

## Ingestion & Deduplication (`src/ai/rag/ingestion.ts`, `src/ai/knowledge/knowledgeService.ts`)
1. Accepts manual notes, local files (`.txt`, `.md`, `.markdown`, `.json`, `.csv`, <= 2 MB), or sanitized previews from the single-URL importer.
2. Normalizes line endings/null bytes (`sanitizeImportedText`).
3. Computes a normalized **SHA-256 content digest** (`sha256Hex`) and blocks exact duplicate uploads unless explicitly permitted (`ConflictError`).
4. Tags documents with `collection`, `sourceType`, optional `sourceUrl`, and `licenseOrRights`.

## Chunking & Keyword Indexing (`chunking.ts`, `indexing.ts`)
- Splits documents deterministically (`500` character target window, `80` character overlap) preserving paragraph boundaries where possible.
- Tokenizes lowercase terms (`>= 2` chars), excluding expanded English stopwords (`in`, `is`, `what`, `how`, `for`, `the`, etc.), capped at 64 unique keywords per chunk.

## Scoring, Diversity & Prompt-Injection Defense (`retrieval.ts`, `agent.ts`)
- **Scoring:** Phrase bonus (content `+4`, title `+3`), title term match `+2.5`, exact chunk keyword match `+1.5`, TF-capped frequency score (capped at 4 occurrences per term to prevent keyword stuffing), plus query coverage ratio (`coverage * 2`).
- **Word Boundaries:** Short tokens (`<= 4` chars) match strictly on word boundaries (`\bterm\b`) to eliminate substring false positives.
- **Collection Filtering & Diversity:** Optional `collection` / `tag` pre-filtering via `allowedDocumentIds`, duplicate chunk suppression, and a cap of 2 chunks per document (`maxChunksPerDocument`).
- **Untrusted Context Isolation:** Retrieved Knowledge Hub citations injected into Copilot prompts are wrapped in `wrapUntrustedContextSnippet()` so embedded instruction text cannot override system instructions.

## Deterministic Evaluation Suite (`src/ai/evaluation/`)
- **Baseline check:** `runLocalRagBenchmark()` (2 core cases).
- **Extended 6-case suite:** `runExtendedRagBenchmark()` evaluates 5 positive freelance SOP/invoicing/backup queries + 1 negative unmatched query against `BENCHMARK_CORPUS`, computing `Recall@K`, `Precision@K`, `citationAccuracy`, `duplicateChunkCount`, `unsupportedFalsePositiveCount`, `indexBytes`, and `avgLatencyMs`.
