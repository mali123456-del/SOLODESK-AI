# SOLODESK AI — Local Knowledge Hub & RAG Pipeline

This module implements a 100% client-side, zero-server Retrieval-Augmented Generation (RAG) pipeline backed by IndexedDB (`Dexie`).

## Pipeline Stages

1. **Ingestion (`rag/ingestion.ts`)**
   - Supports direct notes and local file uploads (`.txt`, `.md`, `.markdown`, `.json`, `.csv`) up to 2 MB.
   - Normalizes line endings, validates JSON syntax, and rejects empty or unsupported files.

2. **Chunking (`rag/chunking.ts`)**
   - Splits documents deterministically into overlapping segments (`maxChunkChars = 500`, `overlapChars = 80`) aligned to paragraph/line/word boundaries where possible.

3. **Indexing (`rag/indexing.ts`)**
   - Tokenizes keywords with stopword removal and stores `DocumentChunk` records in IndexedDB alongside the parent `KnowledgeDocument`.

4. **Retrieval (`rag/retrieval.ts`)**
   - Scores chunks locally against query phrases, document titles, indexed keywords, and body text. Works completely offline without embedding models or external vector databases.

5. **Citations (`rag/citations.ts`)**
   - Formats `[1]`, `[2]`, ... citation snippets passed into AI Copilot prompts or displayed directly in Knowledge Hub search results.
