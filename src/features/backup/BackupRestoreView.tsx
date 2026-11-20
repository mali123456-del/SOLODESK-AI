import React, { useState } from 'react';
import {
  AlertTriangle,
  ArchiveRestore,
  Database,
  Download,
  Lock,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  Input,
  PageHeader,
  useToast,
} from '../../components/ui';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import { formatDisplayDate } from '../../domain/calculations/dates';
import { downloadTextFile } from '../../export/csvUtils';
import {
  createBackupPayload,
  encryptBackupJson,
  inspectBackupText,
  markBackupCompleted,
  restoreBackupPayload,
  type BackupInspectionResult,
} from '../../services/backupService';

export const BackupRestoreView: React.FC = () => {
  const { activeWorkspace, settings, storageHealth, refresh } = useWorkspace();
  const { pushToast } = useToast();

  const [encryptPassphrase, setEncryptPassphrase] = useState('');
  const [exporting, setExporting] = useState(false);

  const [pendingRawText, setPendingRawText] = useState<string | null>(null);
  const [decryptPassphrase, setDecryptPassphrase] = useState('');
  const [inspection, setInspection] = useState<BackupInspectionResult | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [restoreMode, setRestoreMode] = useState<'replace' | 'merge'>('replace');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [lastSafetySnapshot, setLastSafetySnapshot] = useState<string | null>(null);

  const dateFormat = settings?.dateFormat ?? 'DD MMM YYYY';

  const handleExport = async (encrypted: boolean) => {
    setExporting(true);
    try {
      const payload = await createBackupPayload({
        workspaceId: activeWorkspace?.id,
        workspaceName: activeWorkspace?.name,
      });
      const plain = JSON.stringify(payload, null, 2);
      const output = encrypted
        ? await encryptBackupJson(plain, encryptPassphrase)
        : plain;
      const ext = encrypted ? 'solodesk-encrypted.json' : 'solodesk-backup.json';
      downloadTextFile(
        `${new Date().toISOString().slice(0, 10)}-${ext}`,
        output,
        'application/json'
      );
      await markBackupCompleted();
      await refresh();
      pushToast({
        tone: 'success',
        title: encrypted ? 'Encrypted JSON backup downloaded' : 'JSON backup downloaded',
        description: 'API keys are never included in backup files.',
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Backup failed',
        description: err instanceof Error ? err.message : 'Unable to export backup.',
      });
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setInspectError('Backup file exceeds 20 MB limit.');
      return;
    }
    setInspectError(null);
    setInspection(null);
    const text = await file.text();
    setPendingRawText(text);
    try {
      const res = await inspectBackupText(text);
      setInspection(res);
    } catch (err) {
      setInspectError(err instanceof Error ? err.message : 'Invalid backup file.');
    }
  };

  const handleUnlockEncrypted = async () => {
    if (!pendingRawText) return;
    setInspectError(null);
    try {
      const res = await inspectBackupText(pendingRawText, decryptPassphrase);
      setInspection(res);
    } catch (err) {
      setInspectError(err instanceof Error ? err.message : 'Decryption failed.');
    }
  };

  const handleConfirmedRestore = async () => {
    if (!inspection?.payload) return;
    setRestoring(true);
    try {
      const { safetySnapshot, renamedInvoiceNumbers } = await restoreBackupPayload(
        inspection.payload,
        restoreMode
      );
      setLastSafetySnapshot(JSON.stringify(safetySnapshot, null, 2));
      await refresh();
      setConfirmOpen(false);
      setInspection(null);
      setPendingRawText(null);
      setDecryptPassphrase('');
      const reconciledNote =
        renamedInvoiceNumbers.length > 0
          ? ` Reconciled ${renamedInvoiceNumbers.length} colliding invoice number(s): ${renamedInvoiceNumbers.join(', ')}.`
          : '';
      pushToast({
        tone: 'success',
        title: 'Restore complete',
        description:
          (restoreMode === 'replace'
            ? 'Workspace replaced from backup. Pre-restore snapshot saved below for safety.'
            : 'Backup records merged into workspace.') + reconciledNote,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Restore failed',
        description: err instanceof Error ? err.message : 'Database rolled back safely.',
      });
    } finally {
      setRestoring(false);
    }
  };

  const usageMb =
    storageHealth.usageBytes !== null
      ? `${(storageHealth.usageBytes / (1024 * 1024)).toFixed(2)} MB`
      : 'Unavailable';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Backup & Restore"
        description="Export complete versioned JSON backups (with optional AES-GCM encryption) and restore with preview."
      />

      <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 p-3.5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="leading-relaxed">
          Browser storage is not a substitute for an external backup. Clearing site data, browser
          updates, or switching devices can erase IndexedDB records. Always keep a downloaded JSON
          backup safely stored offline.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="space-y-4">
          <CardHeader
            title="Export JSON Backup"
            description="Downloads all clients, projects, tasks, proposals, quotations, contracts, invoices, payments, finance entries, time logs, and knowledge docs."
          />

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#101827] text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Persistent Browser Storage</span>
              <Badge tone={storageHealth.persisted ? 'success' : 'warning'}>
                {storageHealth.persisted ? 'Granted' : 'Best-effort'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Estimated Local Usage</span>
              <span className="font-mono">{usageMb}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Last Backup Exported</span>
              <span className="font-mono">
                {settings?.lastBackupAt
                  ? formatDisplayDate(settings.lastBackupAt, dateFormat)
                  : 'Never'}
              </span>
            </div>
          </div>

          <Button
            onClick={() => void handleExport(false)}
            loading={exporting}
            icon={<Download className="w-4 h-4" />}
          >
            Download Standard JSON Backup
          </Button>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
              <Lock className="w-3.5 h-3.5 text-[#2563EB]" aria-hidden="true" />
              <span>Optional Passphrase-Encrypted Backup (PBKDF2 + AES-GCM)</span>
            </div>
            <Input
              type="password"
              label="Encryption Passphrase"
              placeholder="Minimum 4 characters"
              value={encryptPassphrase}
              onChange={(e) => setEncryptPassphrase(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={encryptPassphrase.length < 4}
              loading={exporting}
              onClick={() => void handleExport(true)}
              icon={<ShieldCheck className="w-4 h-4" />}
            >
              Download Encrypted Backup
            </Button>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Passphrases are never saved by SOLODESK AI. If you lose your passphrase, encrypted
              backups cannot be recovered.
            </p>
          </div>
        </Card>

        <Card className="space-y-4">
          <CardHeader
            title="Restore from Backup"
            description="Inspect schema version, record counts, and potential ID conflicts before applying changes."
          />

          <label className="inline-flex items-center gap-2 h-10 px-4 rounded-[10px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#172338] text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
            <Upload className="w-4 h-4" aria-hidden="true" />
            <span>Select Backup JSON File</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => void handleFileSelect(e)}
              className="sr-only"
            />
          </label>

          {inspectError && (
            <div role="alert" className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-xs">
              {inspectError}
            </div>
          )}

          {inspection?.requiresPassphrase && (
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                This backup file is encrypted. Enter your passphrase to inspect its contents.
              </p>
              <Input
                type="password"
                label="Passphrase"
                value={decryptPassphrase}
                onChange={(e) => setDecryptPassphrase(e.target.value)}
              />
              <Button size="sm" onClick={() => void handleUnlockEncrypted()}>
                Decrypt & Preview
              </Button>
            </div>
          )}

          {inspection?.payload && (
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#101827] space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900 dark:text-white">
                  Backup Preview (Schema v{inspection.payload.schemaVersion})
                </span>
                <span className="font-mono text-slate-500">
                  {formatDisplayDate(inspection.payload.exportedAt, dateFormat)}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(inspection.payload.recordCounts).map(([key, count]) => (
                  <div key={key} className="p-2 rounded-lg bg-white dark:bg-[#172338]">
                    <p className="text-slate-500">{key}</p>
                    <p className="font-mono font-bold text-sm">{count}</p>
                  </div>
                ))}
              </div>

              {inspection.crossWorkspaceMismatch && (
                <div role="status" className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200">
                  Backup originated from workspace <strong>{inspection.payload.workspaceName || inspection.sourceWorkspaceId}</strong> and will be restored into active workspace <strong>{activeWorkspace?.name || inspection.currentWorkspaceId}</strong>.
                </div>
              )}

              {(inspection.conflicts.matchingClientIds > 0 ||
                inspection.conflicts.matchingProjectIds > 0 ||
                inspection.conflicts.matchingTaskIds > 0 ||
                inspection.conflicts.duplicateInvoiceNumbers.length > 0) && (
                <div className="p-2.5 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 space-y-1">
                  <p className="font-semibold">
                    Conflicts detected: {inspection.conflicts.matchingClientIds} client(s),{' '}
                    {inspection.conflicts.matchingProjectIds} project(s),{' '}
                    {inspection.conflicts.matchingTaskIds} task(s),{' '}
                    {inspection.conflicts.duplicateInvoiceNumbers.length} invoice number(s).
                  </p>
                  {inspection.conflicts.invoiceNumberCollisionsAcrossIds.length > 0 && (
                    <p>
                      Note: {inspection.conflicts.invoiceNumberCollisionsAcrossIds.length} invoice(s) share an existing number under a different ID ({inspection.conflicts.invoiceNumberCollisionsAcrossIds.join(', ')}). Merge mode automatically assigns safe `-IMPORT-n` suffixes to avoid collision errors.
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-1.5 pt-1">
                <p className="font-semibold">Restore Mode</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="restoreMode"
                    checked={restoreMode === 'replace'}
                    onChange={() => setRestoreMode('replace')}
                  />
                  <span>Replace existing workspace data (recommended for clean restore)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="restoreMode"
                    checked={restoreMode === 'merge'}
                    onChange={() => setRestoreMode('merge')}
                  />
                  <span>Merge by record ID (overwrites matching IDs, keeps other local records)</span>
                </label>
              </div>

              <Button
                variant="danger"
                onClick={() => setConfirmOpen(true)}
                icon={<ArchiveRestore className="w-4 h-4" />}
              >
                Review & Restore Backup
              </Button>
            </div>
          )}

          {lastSafetySnapshot && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs space-y-2">
              <p className="font-semibold text-emerald-800 dark:text-emerald-200">
                Pre-restore safety snapshot available
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadTextFile('solodesk-pre-restore-safety.json', lastSafetySnapshot, 'application/json')
                }
                icon={<Database className="w-3.5 h-3.5" />}
              >
                Download Safety Snapshot
              </Button>
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void handleConfirmedRestore()}
        loading={restoring}
        title="Confirm Workspace Restore"
        description={
          restoreMode === 'replace'
            ? 'This will replace all current workspace records with the inspected backup. A pre-restore safety snapshot will be captured before writing.'
            : 'This will merge the backup records into your current workspace and overwrite any matching IDs.'
        }
        confirmLabel="Confirm Restore"
        danger={restoreMode === 'replace'}
      />
    </div>
  );
};
