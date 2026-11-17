import type { DocumentChunk } from '../../domain/schemas/entities';
import { tokenizeKeywords } from './indexing';

export interface RetrievedChunk {
  chunk: DocumentChunk;
  score: number;
  matchedTerms: string[];
}

export interface RetrievalOptions {
  allowedDocumentIds?: Set<string>;
  maxChunksPerDocument?: number;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  if (needle.length <= 4) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = haystack.match(new RegExp(`\\b${escaped}\\b`, 'g'));
    return matches ? Math.min(4, matches.length) : 0;
  }
  let count = 0;
  let pos = 0;
  while (pos < haystack.length) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) break;
    count += 1;
    pos = idx + needle.length;
    if (count >= 4) break; // Cap TF contribution at 4 to prevent keyword stuffing bias
  }
  return count;
}

export function retrieveRelevantChunks(
  query: string,
  chunks: DocumentChunk[],
  topK = 4,
  options: RetrievalOptions = {}
): RetrievedChunk[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed || chunks.length === 0 || topK <= 0) return [];

  const candidateChunks = options.allowedDocumentIds
    ? chunks.filter((c) => options.allowedDocumentIds!.has(c.documentId))
    : chunks;

  if (candidateChunks.length === 0) return [];

  const queryTerms = tokenizeKeywords(trimmed);
  if (queryTerms.length === 0) {
    return candidateChunks
      .filter((c) => c.content.toLowerCase().includes(trimmed))
      .slice(0, topK)
      .map((chunk) => ({ chunk, score: 1, matchedTerms: [trimmed] }));
  }

  const scored: RetrievedChunk[] = [];
  for (const chunk of candidateChunks) {
    const lowerContent = chunk.content.toLowerCase();
    const lowerTitle = chunk.documentTitle.toLowerCase();
    let score = 0;
    const matchedTerms: string[] = [];

    if (trimmed.length >= 4 && lowerContent.includes(trimmed)) {
      score += 4;
    }
    if (trimmed.length >= 4 && lowerTitle.includes(trimmed)) {
      score += 3;
    }

    for (const term of queryTerms) {
      let termScore = 0;
      const titleMatched =
        term.length <= 4
          ? new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lowerTitle)
          : lowerTitle.includes(term);
      if (titleMatched) {
        termScore += 2.5;
      }
      if (chunk.keywords.includes(term)) {
        termScore += 1.5;
      }
      const tf = countOccurrences(lowerContent, term);
      if (tf > 0) {
        termScore += 1 + (tf - 1) * 0.35;
      }
      if (termScore > 0) {
        score += termScore;
        matchedTerms.push(term);
      }
    }

    // Coverage bonus when most query keywords appear together in the same chunk
    if (queryTerms.length >= 2 && matchedTerms.length > 0) {
      const coverage = matchedTerms.length / queryTerms.length;
      score += coverage * 2;
    }

    const exactPhraseMatched =
      trimmed.length >= 4 && (lowerContent.includes(trimmed) || lowerTitle.includes(trimmed));
    const passesNoiseFloor =
      exactPhraseMatched || queryTerms.length < 5 || matchedTerms.length >= 2;

    if (score > 0 && passesNoiseFloor) {
      scored.push({
        chunk,
        score: Number(score.toFixed(3)),
        matchedTerms,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const maxPerDoc = options.maxChunksPerDocument ?? 2;
  if (maxPerDoc <= 0) {
    return scored.slice(0, topK);
  }

  // Per-document diversity cap + deduplication
  const selected: RetrievedChunk[] = [];
  const seenChunkIds = new Set<string>();
  const perDocCount = new Map<string, number>();

  for (const item of scored) {
    if (seenChunkIds.has(item.chunk.id)) continue;
    const count = perDocCount.get(item.chunk.documentId) ?? 0;
    if (count >= maxPerDoc) continue;
    seenChunkIds.add(item.chunk.id);
    perDocCount.set(item.chunk.documentId, count + 1);
    selected.push(item);
    if (selected.length >= topK) break;
  }

  return selected;
}
