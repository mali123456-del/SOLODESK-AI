import type { RetrievedChunk } from './retrieval';

export interface KnowledgeCitation {
  index: number;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  excerpt: string;
  score: number;
  matchedTerms: string[];
}

export function buildCitations(results: RetrievedChunk[]): KnowledgeCitation[] {
  return results.map((r, idx) => ({
    index: idx + 1,
    documentId: r.chunk.documentId,
    documentTitle: r.chunk.documentTitle,
    chunkIndex: r.chunk.chunkIndex,
    excerpt:
      r.chunk.content.length > 220
        ? `${r.chunk.content.slice(0, 220).trim()}...`
        : r.chunk.content,
    score: Number(r.score.toFixed(2)),
    matchedTerms: r.matchedTerms,
  }));
}

export function formatContextWithCitations(citations: KnowledgeCitation[], results: RetrievedChunk[]): string {
  if (results.length === 0) return '';
  return results
    .map(
      (r, idx) =>
        `[${idx + 1}] Source: ${r.chunk.documentTitle} (Chunk ${r.chunk.chunkIndex + 1})\n${r.chunk.content}`
    )
    .join('\n\n');
}
