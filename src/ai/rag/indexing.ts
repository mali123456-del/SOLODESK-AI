import type { DocumentChunk } from '../../domain/schemas/entities';
import { createId } from '../../domain/schemas/entities';
import type { TextChunkDraft } from './chunking';

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'your',
  'have',
  'will',
  'are',
  'was',
  'were',
  'into',
  'about',
  'can',
  'not',
  'all',
  'any',
  'but',
  'use',
  'per',
  'how',
  'what',
  'when',
  'where',
  'why',
  'who',
  'which',
  'does',
  'should',
  'could',
  'would',
  'our',
  'out',
  'has',
  'had',
  'is',
  'in',
  'it',
  'to',
  'of',
  'on',
  'at',
  'by',
  'as',
  'or',
  'an',
  'be',
  'if',
  'do',
  'so',
  'no',
  'up',
  'we',
  'me',
  'my',
]);

export function tokenizeKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));

  return Array.from(new Set(words)).slice(0, 64);
}

export function buildDocumentChunks(
  documentId: string,
  documentTitle: string,
  drafts: TextChunkDraft[],
  createdAt = new Date().toISOString()
): DocumentChunk[] {
  return drafts.map((d) => ({
    id: createId('chk'),
    documentId,
    documentTitle,
    chunkIndex: d.chunkIndex,
    content: d.content,
    keywords: tokenizeKeywords(`${documentTitle} ${d.content}`),
    createdAt,
  }));
}
