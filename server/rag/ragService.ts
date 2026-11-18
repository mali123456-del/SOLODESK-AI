import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { chunkTextDeterministic } from '../../src/ai/rag/chunking';
import { tokenizeKeywords } from '../../src/ai/rag/indexing';
import { retrieveRelevantChunks } from '../../src/ai/rag/retrieval';
import { buildSemanticVector, LOCAL_VECTOR_PROVENANCE } from '../../src/ai/rag/semanticVector';
import type { DocumentChunk } from '../../src/domain/schemas/entities';

export function indexKnowledgeDocumentOnServer(
  db: DatabaseSync,
  input: {
    workspaceId: string;
    title: string;
    content: string;
    collection?: string;
    accessScope?: 'workspace' | 'client_portal' | 'internal_only';
    licenseOrRights?: string;
    sourceType?: string;
  }
): { sourceId: string; chunkCount: number; vectorModel: string } {
  const now = new Date().toISOString();
  const sourceId = `ksrc_${crypto.randomUUID()}`;
  const contentHash = crypto.createHash('sha256').update(input.content).digest('hex');
  const scope = input.accessScope ?? 'workspace';
  const drafts = chunkTextDeterministic(input.content, 500, 80);

  db.exec('BEGIN;');
  try {
    db.prepare(
      `INSERT INTO knowledge_sources (id, workspace_id, title, collection, access_scope, license_or_rights, content_hash, source_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      sourceId,
      input.workspaceId,
      input.title.trim(),
      input.collection?.trim() || 'General',
      scope,
      input.licenseOrRights?.trim() ?? '',
      contentHash,
      input.sourceType ?? 'note',
      now
    );

    const insertChunk = db.prepare(
      `INSERT INTO knowledge_chunks (id, source_id, workspace_id, document_title, access_scope, chunk_index, content, keywords_json, embedding_json, vector_model, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const draft of drafts) {
      const vec = Array.from(buildSemanticVector(`${input.title} ${draft.content}`));
      const keywords = tokenizeKeywords(`${input.title} ${draft.content}`);
      insertChunk.run(
        `kchk_${crypto.randomUUID()}`,
        sourceId,
        input.workspaceId,
        input.title.trim(),
        scope,
        draft.chunkIndex,
        draft.content,
        JSON.stringify(keywords),
        JSON.stringify(vec),
        LOCAL_VECTOR_PROVENANCE.vectorModel,
        now
      );
    }

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  return {
    sourceId,
    chunkCount: drafts.length,
    vectorModel: LOCAL_VECTOR_PROVENANCE.vectorModel,
  };
}

export function searchServerRag(
  db: DatabaseSync,
  input: {
    workspaceId: string;
    query: string;
    topK?: number;
    requestedScope?: 'workspace' | 'client_portal' | 'internal_only';
    callerRole: 'owner' | 'admin' | 'manager' | 'collaborator' | 'client_viewer';
  }
) {
  const effectiveScope: 'workspace' | 'client_portal' | 'internal_only' =
    input.callerRole === 'client_viewer'
      ? 'client_portal'
      : input.requestedScope === 'internal_only' &&
          (input.callerRole === 'owner' || input.callerRole === 'admin')
        ? 'internal_only'
        : input.requestedScope === 'client_portal'
          ? 'client_portal'
          : 'workspace';

  const rows = db
    .prepare(
      `SELECT id, source_id, document_title, access_scope, chunk_index, content, keywords_json, created_at
       FROM knowledge_chunks
       WHERE workspace_id = ?`
    )
    .all(input.workspaceId) as Array<{
    id: string;
    source_id: string;
    document_title: string;
    access_scope: 'workspace' | 'client_portal' | 'internal_only';
    chunk_index: number;
    content: string;
    keywords_json: string;
    created_at: string;
  }>;

  const permittedRows = rows.filter((r) => {
    if (effectiveScope === 'client_portal') return r.access_scope === 'client_portal';
    if (effectiveScope === 'workspace') return r.access_scope !== 'internal_only';
    return true;
  });

  const chunks: DocumentChunk[] = permittedRows.map((r) => ({
    id: r.id,
    documentId: r.source_id,
    documentTitle: r.document_title,
    chunkIndex: r.chunk_index,
    content: r.content,
    keywords: JSON.parse(r.keywords_json) as string[],
    createdAt: r.created_at,
  }));

  const matches = retrieveRelevantChunks(input.query, chunks, input.topK ?? 4, {
    maxChunksPerDocument: 2,
  });

  return {
    query: input.query,
    appliedAccessScope: effectiveScope,
    insufficientEvidence: matches.length === 0,
    provenance: LOCAL_VECTOR_PROVENANCE,
    matches: matches.map((m, idx) => ({
      rank: idx + 1,
      chunkId: m.chunk.id,
      documentId: m.chunk.documentId,
      documentTitle: m.chunk.documentTitle,
      chunkIndex: m.chunk.chunkIndex,
      score: m.score,
      lexicalScore: m.lexicalScore,
      semanticScore: m.semanticScore,
      matchMode: m.matchMode,
      excerpt: m.chunk.content,
    })),
  };
}
