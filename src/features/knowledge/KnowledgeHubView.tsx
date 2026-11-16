import React, { useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  FileText,
  FlaskConical,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import {
  addKnowledgeNote,
  getChunksForDocument,
  importKnowledgeFile,
  removeKnowledgeDocument,
  searchKnowledgeBase,
  type KnowledgeSearchResult,
} from '../../ai/knowledge/knowledgeService';
import {
  runLocalRagBenchmark,
  type LocalBenchmarkSummary,
} from '../../ai/evaluation/evaluation';
import type { DocumentChunk, KnowledgeDocument } from '../../domain/schemas/entities';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Input,
  PageHeader,
  Textarea,
  useToast,
} from '../../components/ui';
import { formatDisplayDate } from '../../domain/calculations/dates';

export const KnowledgeHubView: React.FC = () => {
  const { knowledgeDocs, settings, refresh } = useWorkspace();
  const { pushToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<KnowledgeSearchResult | null>(null);
  const [searching, setSearching] = useState(false);

  const [inspectDoc, setInspectDoc] = useState<KnowledgeDocument | null>(null);
  const [inspectChunks, setInspectChunks] = useState<DocumentChunk[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeDocument | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [benchmarkSummary, setBenchmarkSummary] = useState<LocalBenchmarkSummary | null>(null);

  const totalBytes = useMemo(
    () => knowledgeDocs.reduce((sum, doc) => sum + (doc.sizeBytes ?? 0), 0),
    [knowledgeDocs]
  );

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const tags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const { document, chunks } = await addKnowledgeNote({
        title,
        content,
        tags,
        sourceType: 'note',
      });
      setTitle('');
      setTagsText('');
      setContent('');
      await refresh();
      pushToast({
        tone: 'success',
        title: 'Knowledge note indexed',
        description: `"${document.title}" saved locally in ${chunks.length} chunk(s).`,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Could not save note',
        description: err instanceof Error ? err.message : 'Validation failed.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setSaving(true);
    try {
      const { document, chunks } = await importKnowledgeFile(file);
      await refresh();
      pushToast({
        tone: 'success',
        title: 'File indexed locally',
        description: `Imported "${document.title}" (${chunks.length} searchable chunks).`,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'File import failed',
        description: err instanceof Error ? err.message : 'Unsupported file.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResult(null);
      return;
    }
    setSearching(true);
    try {
      const result = await searchKnowledgeBase(searchQuery, 5);
      setSearchResult(result);
    } finally {
      setSearching(false);
    }
  };

  const openInspector = async (doc: KnowledgeDocument) => {
    setInspectDoc(doc);
    const chunks = await getChunksForDocument(doc.id);
    setInspectChunks(chunks);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await removeKnowledgeDocument(deleteTarget.id, deleteTarget.title);
      await refresh();
      if (searchQuery.trim()) {
        const refreshedSearch = await searchKnowledgeBase(searchQuery, 5);
        setSearchResult(refreshedSearch);
      }
      pushToast({
        tone: 'success',
        title: 'Document removed',
        description: `"${deleteTarget.title}" deleted from IndexedDB.`,
      });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleRunBenchmark = () => {
    const result = runLocalRagBenchmark();
    setBenchmarkSummary(result);
    pushToast({
      tone: 'info',
      title: 'Local RAG check complete',
      description: `${result.passedCases}/${result.totalCases} deterministic retrieval checks passed.`,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Knowledge Hub"
        description="Index contracts, pricing notes, and SOPs locally in IndexedDB for offline search and citation-backed AI drafting."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.markdown,.json,.csv"
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button
              variant="outline"
              icon={<FlaskConical className="w-4 h-4" />}
              onClick={handleRunBenchmark}
            >
              Run Local RAG Check
            </Button>
            <Button
              variant="primary"
              icon={<Upload className="w-4 h-4" />}
              loading={saving}
              onClick={() => fileInputRef.current?.click()}
            >
              Import Local File
            </Button>
          </div>
        }
      />

      {benchmarkSummary && (
        <Card>
          <CardHeader
            title="Deterministic Local RAG Self-Check"
            description={`Executed locally in ${benchmarkSummary.totalDurationMs} ms with zero external API calls.`}
            action={
              <Button variant="ghost" size="sm" onClick={() => setBenchmarkSummary(null)}>
                Dismiss
              </Button>
            }
          />
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div>
              <span className="text-slate-500 dark:text-slate-400">Pass rate: </span>
              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                {benchmarkSummary.passedCases}/{benchmarkSummary.totalCases} (
                {benchmarkSummary.passRatePercent}%)
              </span>
            </div>
            {benchmarkSummary.outcomes.map((o) => (
              <div key={o.id} className="flex items-center gap-2">
                <Badge tone={o.passed ? 'success' : 'danger'}>
                  {o.passed ? 'PASS' : 'FAIL'}
                </Badge>
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  {o.id} ({o.latencyMs} ms)
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-6">
          <Card>
            <CardHeader
              title="Add Knowledge Note"
              description="Notes are chunked and keyword-indexed directly inside your browser."
            />
            <form onSubmit={handleSaveNote} className="space-y-4">
              <Input
                label="Note Title"
                required
                placeholder="e.g., Standard Retainer & Late Fee Policy"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Input
                label="Tags (comma separated)"
                placeholder="e.g., pricing, terms, onboarding"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
              />
              <Textarea
                label="Content"
                required
                rows={6}
                placeholder="Paste standard scope clauses, rate cards, client guidelines, or project brief notes..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Max file upload: 2 MB (.txt, .md, .json, .csv)
                </span>
                <Button
                  type="submit"
                  variant="primary"
                  loading={saving}
                  icon={<Plus className="w-4 h-4" />}
                >
                  Save & Index Note
                </Button>
              </div>
            </form>
          </Card>

          <Card>
            <CardHeader
              title="Offline Semantic & Keyword Search"
              description="Retrieve matching document chunks and citations without internet access."
            />
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <div className="flex-1">
                <Input
                  aria-label="Search Knowledge Hub"
                  placeholder="Search terms, payment policy, deliverables..."
                  leftIcon={<Search className="w-4 h-4" />}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button type="submit" variant="primary" loading={searching}>
                Search
              </Button>
            </form>

            {searchResult && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>
                    Found {searchResult.citations.length} citation(s) for “{searchResult.query}”
                  </span>
                  <button
                    type="button"
                    onClick={() => setSearchResult(null)}
                    className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Clear
                  </button>
                </div>

                {searchResult.citations.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 py-3">
                    No matching chunks found in your local Knowledge Hub.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {searchResult.citations.map((c) => (
                      <div
                        key={`${c.documentId}-${c.chunkIndex}`}
                        className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#101827]/70 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-900 dark:text-white">
                            [{c.index}] {c.documentTitle} · Chunk {c.chunkIndex + 1}
                          </span>
                          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                            Score {c.score}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {c.excerpt}
                        </p>
                        {c.matchedTerms.length > 0 && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Matched: {c.matchedTerms.join(', ')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        <div className="lg:col-span-7">
          <Card>
            <CardHeader
              title={`Indexed Documents (${knowledgeDocs.length})`}
              description={`Local index size: ${(totalBytes / 1024).toFixed(1)} KB stored in IndexedDB.`}
            />

            {knowledgeDocs.length === 0 ? (
              <EmptyState
                icon={<BookOpen className="w-6 h-6" />}
                title="No knowledge documents yet"
                description="Add a pricing guide, contract template, or client SOP note on the left—or import a local .md/.txt file—to search offline and ground AI Copilot responses."
              />
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {knowledgeDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {doc.title}
                        </span>
                        <Badge tone="neutral">{doc.sourceType.toUpperCase()}</Badge>
                        {doc.isDemo && <Badge tone="info">Sample</Badge>}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                        {doc.content}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono tabular-nums">{doc.chunkCount} chunks</span>
                        <span className="font-mono tabular-nums">
                          {(doc.sizeBytes / 1024).toFixed(1)} KB
                        </span>
                        <span>
                          Updated {formatDisplayDate(doc.updatedAt, settings?.dateFormat ?? 'DD MMM YYYY')}
                        </span>
                        {doc.tags.length > 0 && <span>Tags: {doc.tags.join(', ')}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => void openInspector(doc)}>
                        Inspect Chunks
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${doc.title}`}
                        onClick={() => setDeleteTarget(doc)}
                      >
                        <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Dialog
        open={Boolean(inspectDoc)}
        onClose={() => setInspectDoc(null)}
        title={inspectDoc ? `Indexed Chunks: ${inspectDoc.title}` : 'Document Chunks'}
        description={
          inspectDoc
            ? `${inspectChunks.length} chunk(s) extracted deterministically for local retrieval.`
            : undefined
        }
        size="lg"
      >
        <div className="space-y-3">
          {inspectChunks.map((chunk) => (
            <div
              key={chunk.id}
              className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#101827]/70 space-y-2"
            >
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Chunk #{chunk.chunkIndex + 1}</span>
                <span className="font-mono">{chunk.content.length} chars</span>
              </div>
              <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                {chunk.content}
              </p>
              {chunk.keywords.length > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Keywords: {chunk.keywords.slice(0, 12).join(', ')}
                </p>
              )}
            </div>
          ))}
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Knowledge Document"
        description={
          deleteTarget
            ? `Remove "${deleteTarget.title}" and all of its indexed chunks from your local browser database?`
            : ''
        }
        confirmLabel="Delete Document"
        danger
        loading={deleting}
      />
    </div>
  );
};
