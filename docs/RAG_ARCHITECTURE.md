# SOLODESK AI — Local RAG Architecture & Evaluation

> See also: [`docs/RAG_EVALUATION.md`](./RAG_EVALUATION.md) for benchmark results and [`docs/CRAWLER_ARCHITECTURE.md`](./CRAWLER_ARCHITECTURE.md) for URL import details.

SOLODESK AI includes a zero-server, client-side **Knowledge Hub & Retrieval-Augmented Generation (RAG)** pipeline persisted inside IndexedDB (`knowledgeDocs` and `documentChunks`), pre-populated with optional `14` first-party MIT knowledge packs (`src/knowledge/built-in/*`).

## Ingestion & Deduplication (`src/ai/rag/ingestion.ts`, `src/ai/knowledge/knowledgeService.ts`, `src/integrations/crawler/*`)
1. Accepts manual notes, local files (`.txt`, `.md`, `.markdown`, `.json`, `.csv`, <= 2 MB), built-in knowledge packs, or sanitized previews from the modular public-URL importer.
2. Normalizes line endings/null bytes (`sanitizeImportedText` / `textProcessor.ts`).
3. Computes a normalized **SHA-256 content digest** (`sha256Hex`) and blocks exact duplicate uploads unless explicitly permitted (`ConflictError`).
4. Tags documents with `collection`, `sourceType`, optional `sourceUrl`, and `licenseOrRights`.

## Chunking & Keyword Indexing (`chunking.ts`, `indexing.ts`)
- Splits documents deterministically (`500` character target window, `80` character overlap) preserving paragraph boundaries where possible.
- Tokenizes lowercase terms (`>= 2` chars), excluding expanded English stopwords (`in`, `is`, `what`, `how`, `for`, `the`, etc.), capped at 64 unique keywords per chunk.

## Scoring, Multi-Term Noise Guard & Prompt-Injection Defense (`retrieval.ts`, `agent.ts`)
- **Scoring:** Phrase bonus (content `+4`, title `+3`), title term match `+2.5`, exact chunk keyword match `+1.5`, TF-capped frequency score (capped at 4 occurrences per term to prevent keyword stuffing), plus query coverage ratio (`coverage * 2`).
- **Word Boundaries & Noise Floor:** Short tokens (`<= 4` chars) match strictly on word boundaries (`\bterm\b`) to eliminate substring false positives, and queries containing 5+ non-stopword terms require at least 2 matched terms (or an exact phrase match) before returning a hit.
- **Collection Filtering & Diversity:** Optional `collection` / `tag` pre-filtering via `allowedDocumentIds`, duplicate chunk suppression, and a cap of 2 chunks per document (`maxChunksPerDocument`).
- **Untrusted Context Isolation:** Retrieved Knowledge Hub citations injected into Copilot prompts are wrapped in `wrapUntrustedContextSnippet()` so embedded instruction text cannot override system instructions.

## Deterministic Evaluation Suite (`src/ai/evaluation/`)
- **Baseline check:** `runLocalRagBenchmark()` (2 core cases).
- **Extended 14-case suite:** `runExtendedRagBenchmark()` evaluates `14` test cases (including positive freelance SOPs, pricing, invoice follow-ups, client communication, tax/backup workflows, negative unmatched queries, and prompt-injection isolation checks) against `BENCHMARK_CORPUS`, verifying `14/14 (100%)` pass rate, `Recall@3 = 100%`, `Citation Accuracy = 100%`, `Unsupported FP = 0%`, and `Duplicate Rate = 0%`.
