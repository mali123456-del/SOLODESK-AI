import { repositories } from '../../database/repositories/dexieRepositories';
import {
  createId,
  knowledgeDocumentSchema,
  type DocumentChunk,
  type KnowledgeDocument,
} from '../../domain/schemas/entities';
import { chunkTextDeterministic } from '../rag/chunking';
import {
  buildCitations,
  formatContextWithCitations,
  type KnowledgeCitation,
} from '../rag/citations';
import { buildDocumentChunks } from '../rag/indexing';
import {
  normalizeDocumentContent,
  validateAndReadKnowledgeFile,
} from '../rag/ingestion';
import { retrieveRelevantChunks, type RetrievedChunk } from '../rag/retrieval';

export interface SaveKnowledgeNoteInput {
  title: string;
  content: string;
  tags?: string[];
  sourceType?: 'note' | 'markdown' | 'text' | 'json';
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface KnowledgeSearchResult {
  query: string;
  matches: RetrievedChunk[];
  citations: KnowledgeCitation[];
  contextText: string;
}

export async function addKnowledgeNote(input: SaveKnowledgeNoteInput): Promise<{
  document: KnowledgeDocument;
  chunks: DocumentChunk[];
}> {
  const title = input.title.trim();
  if (!title) {
    throw new Error('Document title is required.');
  }

  const content = normalizeDocumentContent(input.content);
  if (!content) {
    throw new Error('Document content cannot be empty.');
  }

  const now = new Date().toISOString();
  const docId = createId('kdoc');
  const drafts = chunkTextDeterministic(content, 500, 80);
  const chunks = buildDocumentChunks(docId, title, drafts, now);

  const document = knowledgeDocumentSchema.parse({
    id: docId,
    title,
    sourceType: input.sourceType ?? 'note',
    fileName: input.fileName ?? '',
    mimeType: input.mimeType ?? 'text/plain',
    sizeBytes: input.sizeBytes ?? new TextEncoder().encode(content).byteLength,
    content,
    tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean),
    chunkCount: chunks.length,
    isDemo: false,
    createdAt: now,
    updatedAt: now,
  });

  await repositories.saveKnowledgeDocWithChunks(document, chunks);
  await repositories.logActivity({
    entityType: 'knowledge',
    entityId: document.id,
    action: 'created',
    summary: `Indexed knowledge document "${document.title}" (${chunks.length} chunks)`,
  });

  return { document, chunks };
}

export async function importKnowledgeFile(file: File): Promise<{
  document: KnowledgeDocument;
  chunks: DocumentChunk[];
}> {
  const parsed = await validateAndReadKnowledgeFile(file);
  return addKnowledgeNote(parsed);
}

export async function searchKnowledgeBase(
  query: string,
  topK = 4
): Promise<KnowledgeSearchResult> {
  const chunks = await repositories.listDocumentChunks();
  const matches = retrieveRelevantChunks(query, chunks, topK);
  const citations = buildCitations(matches);
  const contextText = formatContextWithCitations(citations, matches);
  return {
    query,
    matches,
    citations,
    contextText,
  };
}

export async function getChunksForDocument(documentId: string): Promise<DocumentChunk[]> {
  const all = await repositories.listDocumentChunks();
  return all
    .filter((chunk) => chunk.documentId === documentId)
    .sort((a, b) => a.chunkIndex - b.chunkIndex);
}

export async function removeKnowledgeDocument(docId: string, title?: string): Promise<void> {
  await repositories.deleteKnowledgeDoc(docId);
  await repositories.logActivity({
    entityType: 'knowledge',
    entityId: docId,
    action: 'deleted',
    summary: `Removed knowledge document "${title ?? docId}"`,
  });
}
