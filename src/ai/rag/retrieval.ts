import type { DocumentChunk } from '../../domain/schemas/entities';
import { tokenizeKeywords } from './indexing';
import {
  buildSemanticVector,
  cosineSimilarity,
  getCachedSemanticVector,
  LOCAL_VECTOR_PROVENANCE,
} from './semanticVector';

export interface RetrievedChunk {
  chunk: DocumentChunk;
  score: number;
  lexicalScore?: number;
  semanticScore?: number;
  matchMode?: 'hybrid' | 'lexical' | 'semantic';
  vectorModel?: string;
  matchedTerms: string[];
}

export interface RetrievalOptions {
  allowedDocumentIds?: Set<string>;
  maxChunksPerDocument?: number;
  minScoreThreshold?: number;
  minSemanticOnlyThreshold?: number;
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
    if (count >= 4) break;
  }
  return count;
}

const INJECTION_PREAMBLE_RE =
  /\b(system\s+override|ignore\s+(all\s+)?(previous|prior)\s+instructions|disregard\s+(all\s+)?(previous|prior)\s+instructions|bypass\s+all\s+rules)\b/gi;

export function retrieveRelevantChunks(
  query: string,
  chunks: DocumentChunk[],
  topK = 4,
  options: RetrievalOptions = {}
): RetrievedChunk[] {
  const sanitizedQuery = query.replace(INJECTION_PREAMBLE_RE, ' ').replace(/\s+/g, ' ').trim();
  const trimmed = sanitizedQuery.toLowerCase();
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
      .map((chunk) => ({
        chunk,
        score: 1,
        lexicalScore: 1,
        semanticScore: 0,
        matchMode: 'lexical',
        vectorModel: LOCAL_VECTOR_PROVENANCE.vectorModel,
        matchedTerms: [trimmed],
      }));
  }

  const queryVec = buildSemanticVector(trimmed);
  const minThreshold = options.minScoreThreshold ?? 0.5;
  const minSemanticOnly = options.minSemanticOnlyThreshold ?? 1.85;
  const scored: RetrievedChunk[] = [];

  for (const chunk of candidateChunks) {
    const lowerContent = chunk.content.toLowerCase();
    const lowerTitle = chunk.documentTitle.toLowerCase();
    let lexicalScore = 0;
    const matchedTerms: string[] = [];

    if (trimmed.length >= 4 && lowerContent.includes(trimmed)) {
      lexicalScore += 4;
    }
    if (trimmed.length >= 4 && lowerTitle.includes(trimmed)) {
      lexicalScore += 3;
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
        lexicalScore += termScore;
        matchedTerms.push(term);
      }
    }

    if (queryTerms.length >= 2 && matchedTerms.length > 0) {
      const coverage = matchedTerms.length / queryTerms.length;
      lexicalScore += coverage * 2;
    }

    const chunkVec = getCachedSemanticVector(
      `${chunk.id}:${chunk.createdAt}`,
      `${chunk.documentTitle} ${chunk.content}`
    );
    const cosine = Math.max(0, cosineSimilarity(queryVec, chunkVec));
    const semanticScore = Number((cosine * 3.5).toFixed(3));

    const exactPhraseMatched =
      trimmed.length >= 4 && (lowerContent.includes(trimmed) || lowerTitle.includes(trimmed));
    const passesLexicalNoiseFloor =
      exactPhraseMatched ||
      (queryTerms.length < 5 ? matchedTerms.length >= 1 : matchedTerms.length >= 2);
    const hasStemMatch =
      lexicalScore === 0 &&
      queryTerms.some((term) => {
        if (term.length < 6) return false;
        const stem = term.slice(0, 6);
        return chunk.keywords.some((kw) => kw.length >= 6 && kw.slice(0, 6) === stem);
      });
    const passesStrongSemanticFallback =
      lexicalScore === 0 && (semanticScore >= minSemanticOnly || (hasStemMatch && semanticScore >= 0.7));

    const combinedScore = Number((lexicalScore + semanticScore).toFixed(3));

    if (
      ((lexicalScore > 0 && passesLexicalNoiseFloor) || passesStrongSemanticFallback) &&
      combinedScore >= minThreshold
    ) {
      const matchMode: RetrievedChunk['matchMode'] =
        lexicalScore > 0 && semanticScore > 0
          ? 'hybrid'
          : lexicalScore > 0
            ? 'lexical'
            : 'semantic';

      scored.push({
        chunk,
        score: combinedScore,
        lexicalScore: Number(lexicalScore.toFixed(3)),
        semanticScore,
        matchMode,
        vectorModel: LOCAL_VECTOR_PROVENANCE.vectorModel,
        matchedTerms,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const maxPerDoc = options.maxChunksPerDocument ?? 2;
  if (maxPerDoc <= 0) {
    return scored.slice(0, topK);
  }

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
