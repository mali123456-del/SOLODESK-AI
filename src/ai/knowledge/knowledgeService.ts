import { ConflictError } from '../../core/errors';
import { repositories } from '../../database/repositories/dexieRepositories';
import {
  createId,
  knowledgeDocumentSchema,
  type DocumentChunk,
  type KnowledgeDocument,
} from '../../domain/schemas/entities';
import { sha256Hex } from '../../security/sanitize';
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
import {
  LOCAL_VECTOR_PROVENANCE,
  RAG_INDEX_VERSION,
  type EmbeddingProvenance,
} from '../rag/semanticVector';

export interface SaveKnowledgeNoteInput {
  title: string;
  content: string;
  tags?: string[];
  collection?: string;
  sourceType?: 'note' | 'markdown' | 'text' | 'json' | 'url';
  sourceUrl?: string;
  licenseOrRights?: string;
  accessScope?: 'workspace' | 'client_portal' | 'internal_only';
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  allowDuplicate?: boolean;
}

export interface KnowledgeSearchOptions {
  collection?: string;
  tag?: string;
  /**
   * Default accessScope is 'workspace', which strictly excludes 'internal_only' documents.
   * Pass 'internal_only' or includeInternalOnly: true only for explicitly authorized owner queries.
   */
  accessScope?: 'workspace' | 'client_portal' | 'internal_only';
  includeInternalOnly?: boolean;
  minScoreThreshold?: number;
}

export interface KnowledgeSearchResult {
  query: string;
  matches: RetrievedChunk[];
  citations: KnowledgeCitation[];
  contextText: string;
  insufficientEvidence: boolean;
  appliedAccessScope: 'workspace' | 'client_portal' | 'internal_only';
  provenance: EmbeddingProvenance;
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

  const contentHash = await sha256Hex(content);
  if (!input.allowDuplicate) {
    const existingDuplicate = await repositories.findKnowledgeDocByHash(contentHash);
    if (existingDuplicate) {
      throw new ConflictError(
        `Identical knowledge content is already indexed under "${existingDuplicate.title}".`
      );
    }
  }

  const now = new Date().toISOString();
  const docId = createId('kdoc');
  const drafts = chunkTextDeterministic(content, 500, 80);
  const chunks = buildDocumentChunks(docId, title, drafts, now);

  const document = knowledgeDocumentSchema.parse({
    id: docId,
    title,
    sourceType: input.sourceType ?? 'note',
    sourceUrl: input.sourceUrl ?? '',
    collection: input.collection?.trim() || 'General',
    contentHash,
    processingStatus: 'indexed',
    licenseOrRights: input.licenseOrRights?.trim() ?? '',
    accessScope: input.accessScope ?? 'workspace',
    indexVersion: RAG_INDEX_VERSION,
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

  return { document, chunks };
}

export async function importKnowledgeFile(
  file: File,
  collection = 'General'
): Promise<{
  document: KnowledgeDocument;
  chunks: DocumentChunk[];
}> {
  const parsed = await validateAndReadKnowledgeFile(file);
  return addKnowledgeNote({ ...parsed, collection });
}

export async function searchKnowledgeBase(
  query: string,
  topK = 4,
  options: KnowledgeSearchOptions = {}
): Promise<KnowledgeSearchResult> {
  const effectiveScope: 'workspace' | 'client_portal' | 'internal_only' =
    options.includeInternalOnly
      ? 'internal_only'
      : options.accessScope ?? 'workspace';

  const [chunks, docs] = await Promise.all([
    repositories.listDocumentChunks(),
    repositories.listKnowledgeDocs(),
  ]);

  const collFilter = options.collection?.trim().toLowerCase();
  const tagFilter = options.tag?.trim().toLowerCase();
  const allowedDocumentIds = new Set(
    docs
      .filter((d) => {
        if (
          collFilter &&
          collFilter !== 'all' &&
          (d.collection || 'General').toLowerCase() !== collFilter
        ) {
          return false;
        }
        if (tagFilter && !d.tags.some((t) => t.toLowerCase() === tagFilter)) {
          return false;
        }
        if (effectiveScope === 'client_portal' && d.accessScope !== 'client_portal') {
          return false;
        }
        if (effectiveScope === 'workspace' && d.accessScope === 'internal_only') {
          return false;
        }
        return true;
      })
      .map((d) => d.id)
  );

  const matches = retrieveRelevantChunks(query, chunks, topK, {
    allowedDocumentIds,
    maxChunksPerDocument: 2,
    minScoreThreshold: options.minScoreThreshold ?? 0.5,
  });
  const citations = buildCitations(matches);
  const contextText = formatContextWithCitations(citations, matches);
  return {
    query,
    matches,
    citations,
    contextText,
    insufficientEvidence: matches.length === 0,
    appliedAccessScope: effectiveScope,
    provenance: LOCAL_VECTOR_PROVENANCE,
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

export async function getKnowledgeCollectionStats(): Promise<{
  totalDocuments: number;
  totalChunks: number;
  totalBytes: number;
  collections: Array<{ name: string; documentCount: number }>;
}> {
  const [docs, chunks] = await Promise.all([
    repositories.listKnowledgeDocs(),
    repositories.listDocumentChunks(),
  ]);

  const counts = new Map<string, number>();
  let totalBytes = 0;
  for (const doc of docs) {
    totalBytes += doc.sizeBytes;
    const coll = doc.collection || 'General';
    counts.set(coll, (counts.get(coll) ?? 0) + 1);
  }

  const collections = Array.from(counts.entries())
    .map(([name, documentCount]) => ({ name, documentCount }))
    .sort((a, b) => b.documentCount - a.documentCount);

  return {
    totalDocuments: docs.length,
    totalChunks: chunks.length,
    totalBytes,
    collections,
  };
}

export async function rebuildKnowledgeIndex(): Promise<{
  reindexedDocuments: number;
  totalChunks: number;
}> {
  const docs = await repositories.listKnowledgeDocs();
  let totalChunks = 0;

  for (const doc of docs) {
    const now = new Date().toISOString();
    const drafts = chunkTextDeterministic(doc.content, 500, 80);
    const chunks = buildDocumentChunks(doc.id, doc.title, drafts, now);
    totalChunks += chunks.length;
    await repositories.saveKnowledgeDocWithChunks(
      {
        ...doc,
        indexVersion: RAG_INDEX_VERSION,
        chunkCount: chunks.length,
        processingStatus: 'indexed',
        updatedAt: now,
      },
      chunks
    );
  }

  return {
    reindexedDocuments: docs.length,
    totalChunks,
  };
}
