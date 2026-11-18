import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  FileText,
  FolderLock,
  Trash2,
  Upload,
} from 'lucide-react';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  EmptyState,
  Input,
  PageHeader,
  Select,
  useToast,
} from '../../components/ui';
import { repositories } from '../../database/repositories/dexieRepositories';
import type { VaultFile } from '../../domain/schemas/entities';
import { prepareVaultFileDraft } from '../../services/documentVaultService';

const FOLDERS = ['All', 'General', 'Contracts', 'Deliverables', 'Receipts'];

export const DocumentVaultView: React.FC = () => {
  const { vaultFiles, clients, projects, refresh } = useWorkspace();
  const { pushToast } = useToast();

  const [folderFilter, setFolderFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [uploadFolder, setUploadFolder] = useState('Contracts');
  const [classification, setClassification] = useState<VaultFile['classification']>('internal');
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [versionNote, setVersionNote] = useState('');
  const [targetExistingId, setTargetExistingId] = useState<string>('');
  const [previewFile, setPreviewFile] = useState<VaultFile | null>(null);
  const [uploading, setUploading] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vaultFiles.filter((f) => {
      if (folderFilter !== 'All' && f.folder !== folderFilter) return false;
      if (q && !`${f.name} ${f.folder} ${f.tags.join(' ')}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [vaultFiles, folderFilter, search]);

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const existing = targetExistingId
        ? vaultFiles.find((v) => v.id === targetExistingId)
        : undefined;
      const draft = await prepareVaultFileDraft({
        fileName: file.name,
        bytes,
        folder: uploadFolder,
        classification,
        clientId,
        projectId,
        existingFile: existing,
        versionNote,
      });
      const saved = await repositories.saveVaultFile(draft);
      await repositories.logActivity({
        entityType: 'vault',
        entityId: saved.id,
        action: existing ? 'version_uploaded' : 'uploaded',
        summary: `${saved.name} v${saved.version} (${saved.mimeType}) stored in Document Vault`,
      });
      setTargetExistingId('');
      setVersionNote('');
      pushToast({
        title: existing ? `Uploaded v${saved.version} of ${saved.name}` : `Stored ${saved.name} in Vault`,
        tone: 'success',
      });
      await refresh();
    } catch (err) {
      pushToast({
        title: 'File validation failed',
        description: err instanceof Error ? err.message : 'Invalid file format.',
        tone: 'error',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSetApproval = async (file: VaultFile, approvalStatus: VaultFile['approvalStatus']) => {
    await repositories.saveVaultFile({ ...file, approvalStatus });
    await refresh();
  };

  const handleSetClassification = async (file: VaultFile, nextClass: VaultFile['classification']) => {
    await repositories.saveVaultFile({ ...file, classification: nextClass });
    pushToast({ title: `Updated visibility to ${nextClass}`, tone: 'info' });
    await refresh();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Document Vault"
        description="Local encrypted-backup-ready file vault with magic-byte validation, SHA-256 verification, version history, and client-sharing controls."
      />

      {/* Upload & Metadata Bar */}
      <Card>
        <CardHeader
          title={targetExistingId ? 'Upload New Document Version' : 'Upload Verified File'}
          description="Validates magic bytes (PDF, PNG, JPEG, TXT, MD, CSV, JSON) up to 5 MB."
          action={
            targetExistingId ? (
              <Button size="sm" variant="ghost" onClick={() => setTargetExistingId('')}>
                Cancel Version Bump
              </Button>
            ) : undefined
          }
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <Select
            label="Folder"
            value={uploadFolder}
            onChange={(e) => setUploadFolder(e.target.value)}
            options={FOLDERS.filter((f) => f !== 'All').map((f) => ({ value: f, label: f }))}
          />
          <Select
            label="Visibility Classification"
            value={classification}
            onChange={(e) => setClassification(e.target.value as VaultFile['classification'])}
            options={[
              { value: 'internal', label: 'Internal Only' },
              { value: 'confidential', label: 'Confidential' },
              { value: 'client_shared', label: 'Client Portal Shared' },
              { value: 'public', label: 'Public' },
            ]}
          />
          <Select
            label="Client (optional)"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            options={[
              { value: '', label: 'None' },
              ...clients.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <Select
            label="Project (optional)"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            options={[
              { value: '', label: 'None' },
              ...projects.filter((p) => !p.isTemplate).map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          <div>
            <label className="inline-flex w-full items-center justify-center gap-2 h-10 px-4 rounded-[10px] bg-[#2563EB] hover:bg-blue-700 text-white text-sm font-medium cursor-pointer transition-colors">
              <Upload className="w-4 h-4" aria-hidden="true" />
              <span>{uploading ? 'Validating...' : targetExistingId ? 'Choose Version File' : 'Upload File'}</span>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.txt,.md,.csv,.json"
                onChange={(e) => void handleFilePicked(e)}
                className="sr-only"
                disabled={uploading}
              />
            </label>
          </div>
        </div>
        {targetExistingId && (
          <div className="mt-3 max-w-md">
            <Input
              label="Version Changelog Note"
              placeholder="e.g. Updated payment schedule clause"
              value={versionNote}
              onChange={(e) => setVersionNote(e.target.value)}
            />
          </div>
        )}
      </Card>

      {/* Filter Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FOLDERS.map((folder) => (
            <button
              key={folder}
              type="button"
              onClick={() => setFolderFilter(folder)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                folderFilter === folder
                  ? 'border-[#2563EB] bg-[#2563EB] text-white'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#172338] text-slate-600 dark:text-slate-300'
              }`}
            >
              {folder}
            </button>
          ))}
        </div>
        <div className="w-full sm:w-64">
          <Input
            placeholder="Search files or tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* File List */}
      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FolderLock className="w-6 h-6" />}
            title="No documents in this folder"
            description="Upload contracts, deliverables, receipts, or briefs. Magic-byte MIME checks protect against spoofed file extensions."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((file) => {
            const client = clients.find((c) => c.id === file.clientId);
            return (
              <Card key={file.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FileText className="w-4 h-4 text-[#2563EB] shrink-0" />
                      <h3 className="text-sm font-semibold truncate">{file.name}</h3>
                      <Badge tone="neutral">v{file.version}</Badge>
                      <Badge
                        tone={
                          file.approvalStatus === 'approved'
                            ? 'success'
                            : file.approvalStatus === 'rejected'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {file.approvalStatus.replace('_', ' ')}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {file.folder} · {file.mimeType} · {(file.sizeBytes / 1024).toFixed(1)} KB
                      {client ? ` · ${client.name}` : ''}
                    </p>
                    <p className="text-[11px] font-mono text-slate-400 mt-1 truncate">
                      SHA-256: {file.sha256}
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <Select
                    aria-label="Classification"
                    value={file.classification}
                    onChange={(e) =>
                      void handleSetClassification(file, e.target.value as VaultFile['classification'])
                    }
                    options={[
                      { value: 'internal', label: 'Internal' },
                      { value: 'confidential', label: 'Confidential' },
                      { value: 'client_shared', label: 'Client Shared' },
                      { value: 'public', label: 'Public' },
                    ]}
                    className="w-36 h-8 text-xs"
                  />

                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => setPreviewFile(file)}>
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      Inspect
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTargetExistingId(file.id);
                        setUploadFolder(file.folder);
                        setClassification(file.classification);
                      }}
                    >
                      New Ver
                    </Button>
                    {file.approvalStatus !== 'approved' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleSetApproval(file, 'approved')}
                        title="Approve document"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await repositories.deleteVaultFile(file.id);
                        await refresh();
                      }}
                      aria-label="Delete document"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Document Preview & Version History Modal */}
      <Dialog
        open={Boolean(previewFile)}
        onClose={() => setPreviewFile(null)}
        title={previewFile?.name ?? 'Document Preview'}
        description={
          previewFile
            ? `${previewFile.mimeType} · v${previewFile.version} · SHA-256 ${previewFile.sha256.slice(0, 16)}…`
            : undefined
        }
        size="lg"
        footer={
          previewFile && (
            <>
              <a
                href={previewFile.contentDataUrl}
                download={previewFile.name}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Download className="w-3.5 h-3.5" />
                Download Copy
              </a>
              <Button variant="primary" onClick={() => setPreviewFile(null)}>
                Close
              </Button>
            </>
          )
        }
      >
        {previewFile && (
          <div className="space-y-4">
            {previewFile.mimeType.startsWith('image/') && (
              <img
                src={previewFile.contentDataUrl}
                alt={previewFile.name}
                className="max-h-80 rounded-lg border border-slate-200 dark:border-slate-800 mx-auto"
              />
            )}
            {previewFile.previewText && (
              <pre className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#101827] border border-slate-200 dark:border-slate-800 text-xs overflow-x-auto max-h-72 whitespace-pre-wrap">
                {previewFile.previewText}
              </pre>
            )}
            {previewFile.mimeType === 'application/pdf' && (
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#101827] border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                PDF verified with `%PDF-` signature ({(previewFile.sizeBytes / 1024).toFixed(1)} KB). Use Download Copy above to open locally.
              </div>
            )}

            <div>
              <h4 className="text-xs font-semibold uppercase text-slate-500 mb-2">
                Version History ({previewFile.versions.length})
              </h4>
              <ul className="space-y-1.5">
                {previewFile.versions.map((ver) => (
                  <li
                    key={ver.version}
                    className="flex items-center justify-between text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800"
                  >
                    <span>
                      <strong>v{ver.version}</strong> — {ver.note}
                    </span>
                    <span className="font-mono text-slate-400">
                      {ver.sha256.slice(0, 12)}… · {new Date(ver.createdAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};
