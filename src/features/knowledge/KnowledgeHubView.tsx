import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Database,
  FileText,
  FlaskConical,
  Globe,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import {
  addKnowledgeNote,
  getChunksForDocument,
  importKnowledgeFile,
  rebuildKnowledgeIndex,
  removeKnowledgeDocument,
  searchKnowledgeBase,
  type KnowledgeSearchResult,
} from '../../ai/knowledge/knowledgeService';
import { auditDatasetRegistry } from '../../ai/datasets/registry/datasetRegistry';
import { installBuiltInKnowledgePacks } from '../../knowledge/packLoader';
import {
  runExtendedRagBenchmark,
  runLocalRagBenchmark,
  type ExtendedRagBenchmarkSummary,
  type LocalBenchmarkSummary,
} from '../../ai/evaluation/evaluation';
import {
  fetchAndPreviewUrlForKnowledge,
  type UrlImportPreview,
} from '../../integrations/crawler/urlImporter';
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
  Select,
  Textarea,
  useToast,
} from '../../components/ui';
import { formatDisplayDate } from '../../domain/calculations/dates';

export const KnowledgeHubView: React.FC = () => {
  const { knowledgeDocs, settings, refresh } = useWorkspace();
  const { pushToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState('');
  const [collection, setCollection] = useState('General');
  const [tagsText, setTagsText] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const [collectionFilter, setCollectionFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<KnowledgeSearchResult | null>(null);
  const [searching, setSearching] = useState(false);

  const [inspectDoc, setInspectDoc] = useState<KnowledgeDocument | null>(null);
  const [inspectChunks, setInspectChunks] = useState<DocumentChunk[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeDocument | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [benchmarkSummary, setBenchmarkSummary] = useState<LocalBenchmarkSummary | null>(null);
  const [extendedBenchmark, setExtendedBenchmark] = useState<ExtendedRagBenchmarkSummary | null>(null);
  const [installingPacks, setInstallingPacks] = useState(false);
  const [rebuildingIndex, setRebuildingIndex] = useState(false);
  const [registryModalOpen, setRegistryModalOpen] = useState(false);

  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlCollection, setUrlCollection] = useState('Web References');
  const [urlFetching, setUrlFetching] = useState(false);
  const [urlPreview, setUrlPreview] = useState<UrlImportPreview | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlSaving, setUrlSaving] = useState(false);

  const datasetAudit = useMemo(() => auditDatasetRegistry(), []);

  const availableCollections = useMemo(() => {
    const set = new Set<string>(['General']);
    for (const doc of knowledgeDocs) {
      set.add(doc.collection || 'General');
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [knowledgeDocs]);

  const filteredDocs = useMemo(() => {
    if (collectionFilter === 'all') return knowledgeDocs;
    return knowledgeDocs.filter((d) => (d.collection || 'General') === collectionFilter);
  }, [knowledgeDocs, collectionFilter]);

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
        collection: collection.trim() || 'General',
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

    const targetCollection = collectionFilter === 'all' ? 'General' : collectionFilter;
    setSaving(true);
    try {
      const { document, chunks } = await importKnowledgeFile(file, targetCollection);
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
      const result = await searchKnowledgeBase(searchQuery, 5, {
        collection: collectionFilter !== 'all' ? collectionFilter : undefined,
      });
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
        const refreshedSearch = await searchKnowledgeBase(searchQuery, 5, {
          collection: collectionFilter !== 'all' ? collectionFilter : undefined,
        });
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

  const handleInstallBuiltInPacks = async () => {
    setInstallingPacks(true);
    try {
      const { installedCount, skippedDuplicates } = await installBuiltInKnowledgePacks();
      await refresh();
      pushToast({
        tone: 'success',
        title: 'Knowledge Packs Ready',
        description: `Installed ${installedCount} first-party MIT pack(s); ${skippedDuplicates} already indexed.`,
      });
    } finally {
      setInstallingPacks(false);
    }
  };

  const handleRebuildIndex = async () => {
    setRebuildingIndex(true);
    try {
      const res = await rebuildKnowledgeIndex();
      await refresh();
      pushToast({
        tone: 'success',
        title: 'Local Index Rebuilt',
        description: `Re-chunked ${res.reindexedDocuments} document(s) into ${res.totalChunks} chunks.`,
      });
    } finally {
      setRebuildingIndex(false);
    }
  };

  const handleRunBenchmark = () => {
    const result = runLocalRagBenchmark();
    const extended = runExtendedRagBenchmark();
    setBenchmarkSummary(result);
    setExtendedBenchmark(extended);
    pushToast({
      tone: 'info',
      title: 'Local RAG evaluation complete',
      description: `${extended.passedCases}/${extended.totalCases} cases passed (Recall@3 ${Math.round(extended.recallAtK * 100)}%, Precision@3 ${Math.round(extended.precisionAtK * 100)}%).`,
    });
  };

  const handleFetchUrlPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    setUrlFetching(true);
    setUrlError(null);
    setUrlPreview(null);
    try {
      const preview = await fetchAndPreviewUrlForKnowledge(urlInput);
      setUrlPreview(preview);
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'Unable to fetch URL safely.');
    } finally {
      setUrlFetching(false);
    }
  };

  const handleApproveUrlImport = async () => {
    if (!urlPreview) return;
    setUrlSaving(true);
    try {
      const { document, chunks } = await addKnowledgeNote({
        title: urlPreview.title,
        content: urlPreview.content,
        collection: urlCollection.trim() || 'Web References',
        sourceType: urlPreview.sourceType,
        sourceUrl: urlPreview.finalUrl,
        sizeBytes: urlPreview.sizeBytes,
        tags: ['url-import'],
      });
      await refresh();
      pushToast({
        tone: 'success',
        title: 'URL imported to Knowledge Hub',
        description: `Saved "${document.title}" (${chunks.length} chunk(s)).`,
      });
      setUrlModalOpen(false);
      setUrlInput('');
      setUrlPreview(null);
      setUrlError(null);
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'Could not save imported content.');
    } finally {
      setUrlSaving(false);
    }
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
              loading={installingPacks}
              icon={<BookOpen className="w-4 h-4" />}
              onClick={() => void handleInstallBuiltInPacks()}
            >
              Load 14 Freelancer Packs
            </Button>
            <Button
              variant="outline"
              loading={rebuildingIndex}
              icon={<RefreshCw className="w-4 h-4" />}
              onClick={() => void handleRebuildIndex()}
            >
              Rebuild Index
            </Button>
            <Button
              variant="outline"
              icon={<Database className="w-4 h-4" />}
              onClick={() => setRegistryModalOpen(true)}
            >
              Dataset Audit
            </Button>
            <Button
              variant="outline"
              icon={<FlaskConical className="w-4 h-4" />}
              onClick={handleRunBenchmark}
            >
              Run Local RAG Check
            </Button>
            <Button
              variant="outline"
              icon={<Globe className="w-4 h-4" />}
              onClick={() => {
                setUrlError(null);
                setUrlPreview(null);
                setUrlModalOpen(true);
              }}
            >
              Import Public URL
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

      {(benchmarkSummary || extendedBenchmark) && (
        <Card>
          <CardHeader
            title="Deterministic Local RAG Evaluation"
            description={`Executed locally in ${extendedBenchmark?.totalDurationMs ?? benchmarkSummary?.totalDurationMs ?? 0} ms across ${extendedBenchmark?.corpusDocCount ?? 0} synthetic docs (${((extendedBenchmark?.indexBytes ?? 0) / 1024).toFixed(1)} KB index).`}
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setBenchmarkSummary(null);
                  setExtendedBenchmark(null);
                }}
              >
                Dismiss
              </Button>
            }
          />
          <div className="space-y-3">
            {extendedBenchmark && (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-xs">
                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="text-slate-500">Cases Passed</p>
                  <p className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white mt-0.5">
                    {extendedBenchmark.passedCases}/{extendedBenchmark.totalCases} ({extendedBenchmark.passRatePercent}%)
                  </p>
                </div>
                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="text-slate-500">Recall@3</p>
                  <p className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white mt-0.5">
                    {Math.round(extendedBenchmark.recallAtK * 100)}%
                  </p>
                </div>
                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="text-slate-500">Precision@3</p>
                  <p className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white mt-0.5">
                    {Math.round(extendedBenchmark.precisionAtK * 100)}%
                  </p>
                </div>
                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="text-slate-500">Citation Accuracy</p>
                  <p className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white mt-0.5">
                    {Math.round(extendedBenchmark.citationAccuracy * 100)}%
                  </p>
                </div>
                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="text-slate-500">Unsupported FP</p>
                  <p className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white mt-0.5">
                    {extendedBenchmark.unsupportedFalsePositiveCount} ({extendedBenchmark.unsupportedAnswerRatePercent}%)
                  </p>
                </div>
                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="text-slate-500">Duplicate Rate</p>
                  <p className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white mt-0.5">
                    {extendedBenchmark.duplicateRatePercent}%
                  </p>
                </div>
                <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="text-slate-500">Avg Latency</p>
                  <p className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white mt-0.5">
                    {extendedBenchmark.avgLatencyMs} ms
                  </p>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {(extendedBenchmark?.outcomes ?? benchmarkSummary?.outcomes ?? []).map((o) => (
                <div key={o.id} className="flex items-center gap-1.5">
                  <Badge tone={o.passed ? 'success' : 'danger'}>
                    {o.passed ? 'PASS' : 'FAIL'}
                  </Badge>
                  <span className="text-xs text-slate-600 dark:text-slate-300">
                    {o.id} ({o.latencyMs} ms)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-6">
          <Card>
            <CardHeader
              title="Add Knowledge Note"
              description="Notes are chunked, SHA-256 deduplicated, and keyword-indexed directly inside your browser."
            />
            <form onSubmit={handleSaveNote} className="space-y-4">
              <Input
                label="Note Title"
                required
                placeholder="e.g., Standard Retainer & Late Fee Policy"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Collection"
                  placeholder="e.g., Pricing & Terms"
                  value={collection}
                  onChange={(e) => setCollection(e.target.value)}
                />
                <Input
                  label="Tags (comma separated)"
                  placeholder="e.g., pricing, terms"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                />
              </div>
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
              title={`Indexed Documents (${filteredDocs.length})`}
              description={`Local index size: ${(totalBytes / 1024).toFixed(1)} KB stored in IndexedDB.`}
              action={
                <div className="w-44">
                  <Select
                    aria-label="Filter by collection"
                    value={collectionFilter}
                    onChange={(e) => setCollectionFilter(e.target.value)}
                    options={[
                      { value: 'all', label: 'All Collections' },
                      ...availableCollections.map((c) => ({ value: c, label: c })),
                    ]}
                  />
                </div>
              }
            />

            {filteredDocs.length === 0 ? (
              <EmptyState
                icon={<BookOpen className="w-6 h-6" />}
                title="No knowledge documents yet"
                description="Add a pricing guide, contract template, or client SOP note on the left—or import a local .md/.txt file or public URL—to search offline and ground AI Copilot responses."
              />
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredDocs.map((doc) => (
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
                        {doc.collection && doc.collection !== 'General' && (
                          <Badge tone="info">{doc.collection}</Badge>
                        )}
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
        open={urlModalOpen}
        onClose={() => setUrlModalOpen(false)}
        title="Import Public URL to Knowledge Hub"
        description="Safe, single-page, user-triggered importer: enforces SSRF private-IP blocking, robots.txt checks, 512 KB cap, and HTML script stripping before approval."
        size="lg"
      >
        <div className="space-y-4">
          <form onSubmit={handleFetchUrlPreview} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Input
                  label="Public HTTPS/HTTP URL"
                  required
                  type="url"
                  placeholder="https://example.com/guidelines.md"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                />
              </div>
              <Input
                label="Target Collection"
                value={urlCollection}
                onChange={(e) => setUrlCollection(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Private/localhost IPs blocked. CORS-restricted pages can be saved as .md/.txt and uploaded locally.
              </span>
              <Button type="submit" variant="outline" loading={urlFetching}>
                Fetch & Preview
              </Button>
            </div>
          </form>

          {urlError && (
            <div className="p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 text-xs text-red-800 dark:text-red-200">
              {urlError}
            </div>
          )}

          {urlPreview && (
            <div className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {urlPreview.title}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {urlPreview.finalUrl} · {urlPreview.contentType} · {(urlPreview.sizeBytes / 1024).toFixed(1)} KB
                  </p>
                </div>
                <Badge tone="success">
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Sanitized Preview
                  </span>
                </Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{urlPreview.robotsNote}</p>
              {urlPreview.duplicateOfTitle && (
                <div className="p-2.5 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    Identical content (SHA-256) is already indexed under “{urlPreview.duplicateOfTitle}”.
                  </span>
                </div>
              )}
              <div className="max-h-56 overflow-y-auto p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#101827]/70 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                {urlPreview.content.slice(0, 4000)}
                {urlPreview.content.length > 4000 ? '\n\n... (preview truncated cleanly)' : ''}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setUrlModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={urlSaving}
                  disabled={Boolean(urlPreview.duplicateOfTitle)}
                  onClick={() => void handleApproveUrlImport()}
                >
                  Approve & Save to Knowledge Hub
                </Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>

      <Dialog
        open={registryModalOpen}
        onClose={() => setRegistryModalOpen(false)}
        title="Dataset Registry & License Compliance Audit"
        description={`Manifest v${datasetAudit.manifest.manifestVersion} · ${datasetAudit.approvedEntries.length} approved · ${datasetAudit.rejectedEntries.length} rejected external candidates`}
        size="xl"
      >
        <div className="space-y-3 text-xs">
          {datasetAudit.manifest.entries.map((entry) => {
            const check = datasetAudit.complianceChecks.find((c) => c.datasetId === entry.id);
            return (
              <div
                key={entry.id}
                className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    {entry.name}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Badge tone={entry.decision === 'approved' ? 'success' : 'danger'}>
                      {entry.decision}
                    </Badge>
                    <Badge tone="neutral">{entry.license}</Badge>
                  </div>
                </div>
                <p className="text-slate-600 dark:text-slate-300">{entry.intendedPurpose}</p>
                <p className="text-slate-500">
                  Source: <span className="font-mono">{entry.sourceUrl}</span> · Commercial:{' '}
                  {entry.commercialUseStatus} · PII: {entry.containsPersonalData ? 'Present' : 'None'} ·{' '}
                  Size: {entry.sizeLabel}
                </p>
                <p className="text-slate-500">{entry.decisionReason}</p>
                {check && !check.compliantForInclusion && (
                  <p className="text-rose-600 dark:text-rose-400">
                    Compliance Blockers: {check.reasons.join(' ')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Dialog>

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
