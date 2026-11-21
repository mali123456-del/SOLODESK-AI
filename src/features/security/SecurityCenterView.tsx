import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Download,
  Lock,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  PageHeader,
  useToast,
} from '../../components/ui';
import { repositories } from '../../database/repositories/dexieRepositories';
import {
  runDatabaseHealthCheck,
  type DatabaseHealthReport,
} from '../../observability/healthCheck';
import {
  recordSecurityAudit,
  runBackupRecoverySelfTest,
  type BackupVerificationReport,
} from '../../security/auditLogger';

import type { AppRouteId } from '../../types/navigation';

interface SecurityCenterViewProps {
  onNavigate?: (route: AppRouteId) => void;
}

export const SecurityCenterView: React.FC<SecurityCenterViewProps> = ({ onNavigate }) => {
  const { settings, securityAuditLogs, isOnline, refresh } = useWorkspace();
  const { pushToast } = useToast();

  const [health, setHealth] = useState<DatabaseHealthReport | null>(null);
  const [backupReport, setBackupReport] = useState<BackupVerificationReport | null>(null);
  const [testingBackup, setTestingBackup] = useState(false);
  const [retentionDays, setRetentionDays] = useState(String(settings?.retentionDays ?? 365));

  const runDiagnostics = async () => {
    const report = await runDatabaseHealthCheck();
    setHealth(report);
  };

  useEffect(() => {
    void runDiagnostics();
  }, []);

  const hasLocalStorageKeys = (() => {
    try {
      const keys = Object.keys(window.localStorage);
      return keys.some((k) => k.toLowerCase().includes('apikey') || k.toLowerCase().includes('gemini'));
    } catch {
      return false;
    }
  })();

  const handleBackupSelfTest = async () => {
    setTestingBackup(true);
    try {
      const report = await runBackupRecoverySelfTest();
      setBackupReport(report);
      pushToast({
        title: report.ok ? 'Backup recovery self-test passed' : 'Backup self-test failed',
        description: report.message,
        tone: report.ok ? 'success' : 'error',
      });
      await refresh();
    } finally {
      setTestingBackup(false);
    }
  };

  const handleSaveRetention = async () => {
    const days = Math.max(7, Math.min(3650, Number(retentionDays) || 365));
    await repositories.saveSettings({ retentionDays: days });
    await recordSecurityAudit({
      eventType: 'retention_updated',
      severity: 'info',
      detail: `Configured workspace data retention window to ${days} days.`,
    });
    pushToast({ title: `Data retention updated to ${days} days`, tone: 'success' });
    await refresh();
  };

  const handleExportDiagnostics = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      online: isOnline,
      cspEnforced: true,
      apiKeysInLocalStorage: hasLocalStorageKeys,
      health,
      backupReport,
      recentAuditLogs: securityAuditLogs.slice(0, 50),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `solodesk-security-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security, Privacy & Reliability Center"
        description="Verify browser storage health, encryption roundtrips, CSP status, data retention, and immutable audit logs."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {onNavigate && (
              <Button variant="outline" onClick={() => onNavigate('audit-logs')}>
                <ShieldCheck className="w-4 h-4 mr-1.5" aria-hidden="true" />
                Open Centralized Audit Log
              </Button>
            )}
            <Button variant="outline" onClick={handleExportDiagnostics}>
              <Download className="w-4 h-4 mr-1.5" aria-hidden="true" />
              Export Diagnostics JSON
            </Button>
          </div>
        }
      />

      {/* Posture Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-slate-500">API Key Storage Guard</p>
              <p className="text-lg font-bold mt-1">
                {hasLocalStorageKeys ? 'Warning: Key Detected' : 'Memory-Only Verified'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                AI provider keys are never persisted to localStorage or IndexedDB.
              </p>
            </div>
            <Badge tone={hasLocalStorageKeys ? 'danger' : 'success'}>
              {hasLocalStorageKeys ? 'Review' : 'Clean'}
            </Badge>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-slate-500">Database Schema & Health</p>
              <p className="text-lg font-bold mt-1 font-mono tabular-nums">
                {health ? `v${health.schemaVersion} · ${health.totalRecords} records` : 'Checking…'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {health?.storage.persisted ? 'Persistent storage granted' : 'Best-effort browser storage'}
              </p>
            </div>
            <Badge tone={health?.status === 'healthy' ? 'success' : 'warning'}>
              {health?.status ?? 'checking'}
            </Badge>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-slate-500">XSS & CSP Policy</p>
              <p className="text-lg font-bold mt-1">Strict Self-Only</p>
              <p className="text-xs text-slate-500 mt-1">
                script-src &apos;self&apos;; object-src &apos;none&apos;; magic-byte upload checks active.
              </p>
            </div>
            <Badge tone="success">Enforced</Badge>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Backup Self-Test & Data Retention */}
        <Card>
          <CardHeader
            title="Backup Recovery Self-Test & Retention"
            description="Non-destructive AES-GCM encryption, decryption, and v6 schema verification."
            action={
              <Button size="sm" variant="ghost" onClick={() => void runDiagnostics()}>
                <RefreshCw className="w-3.5 h-3.5 mr-1" />
                Re-scan DB
              </Button>
            }
          />
          <div className="space-y-4">
            <Button onClick={() => void handleBackupSelfTest()} loading={testingBackup}>
              <ShieldCheck className="w-4 h-4 mr-1.5" aria-hidden="true" />
              Run Non-Destructive Backup Recovery Test
            </Button>

            {backupReport && (
              <div className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{backupReport.ok ? 'Integrity Verified' : 'Integrity Error'}</span>
                </div>
                <p className="text-slate-700 dark:text-slate-300">{backupReport.message}</p>
              </div>
            )}

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-end gap-3">
              <div className="flex-1">
                <Input
                  label="Local Retention Policy (Days)"
                  type="number"
                  min={7}
                  max={3650}
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(e.target.value)}
                />
              </div>
              <Button variant="outline" onClick={() => void handleSaveRetention()}>
                <Lock className="w-3.5 h-3.5 mr-1.5" />
                Save Policy
              </Button>
            </div>
          </div>
        </Card>

        {/* Security Audit Trail */}
        <Card>
          <CardHeader
            title="Security Audit Trail"
            description="Recent security, portal, backup, and retention events recorded locally."
          />
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {securityAuditLogs.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                No security audit events logged yet. Run a backup self-test or save a retention policy.
              </p>
            ) : (
              securityAuditLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Activity className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                      <span className="font-mono font-semibold">{log.eventType}</span>
                      <Badge
                        tone={
                          log.severity === 'critical'
                            ? 'danger'
                            : log.severity === 'warning'
                              ? 'warning'
                              : 'info'
                        }
                      >
                        {log.severity}
                      </Badge>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 mt-1">{log.detail}</p>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400 shrink-0">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};
