import type { DocumentChunk } from '../../domain/schemas/entities';
import { tokenizeKeywords } from './indexing';

export interface RetrievedChunk {
  chunk: DocumentChunk;
  score: number;
  matchedTerms: string[];
}

export function retrieveRelevantChunks(
  query: string,
  chunks: DocumentChunk[],
  topK = 4
): RetrievedChunk[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed || chunks.length === 0) return [];

  const queryTerms = tokenizeKeywords(trimmed);
  if (queryTerms.length === 0) {
    // fallback substring match for very short queries
    return chunks
      .filter((c) => c.content.toLowerCase().includes(trimmed))
      .slice(0, topK)
      .map((chunk) => ({ chunk, score: 1, matchedTerms: [trimmed] }));
  }

  const scored: RetrievedChunk[] = [];
  for (const chunk of chunks) {
    const lowerContent = chunk.content.toLowerCase();
    const lowerTitle = chunk.documentTitle.toLowerCase();
    let score = 0;
    const matchedTerms: string[] = [];

    if (lowerContent.includes(trimmed)) {
      score += 4;
    }

    for (const term of queryTerms) {
      let termHits = 0;
      if (lowerTitle.includes(term)) {
        termHits += 2.5;
      }
      if (chunk.keywords.includes(term)) {
        termHits += 1.5;
      }
      if (lowerContent.includes(term)) {
        termHits += 1;
      }
      if (termHits > 0) {
        score += termHits;
        matchedTerms.push(term);
      }
    }

    if (score > 0) {
      scored.push({ chunk, score, matchedTerms });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
