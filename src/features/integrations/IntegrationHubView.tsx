import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Link2, RefreshCw, ShieldAlert, Unplug } from 'lucide-react';
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
import {
  configureIntegrationAdapter,
  disconnectIntegrationAdapter,
  INTEGRATION_CATALOG,
  testIntegrationConnection,
  type IntegrationCatalogEntry,
} from '../../services/integrationRegistryService';
import type { IntegrationConnection } from '../../domain/schemas/entities';

export const IntegrationHubView: React.FC = () => {
  const { integrationConnections, refresh } = useWorkspace();
  const { pushToast } = useToast();

  const [endpointDrafts, setEndpointDrafts] = useState<Record<string, string>>({});
  const [accountDrafts, setAccountDrafts] = useState<Record<string, string>>({});
  const [busyProvider, setBusyProvider] = useState<string | null>(null);

  const connectionByProvider = useMemo(
    () => new Map(integrationConnections.map((c) => [c.provider, c])),
    [integrationConnections]
  );

  const handleConfigure = async (entry: IntegrationCatalogEntry) => {
    setBusyProvider(entry.provider);
    try {
      const saved = await configureIntegrationAdapter({
        provider: entry.provider,
        accountLabel: accountDrafts[entry.provider] ?? '',
        endpointUrl: endpointDrafts[entry.provider] ?? '',
      });
      await refresh();
      pushToast({
        tone: saved.status === 'blocked_credentials' ? 'warning' : 'success',
        title:
          saved.status === 'blocked_credentials'
            ? `${entry.displayName}: Credentials Required`
            : `${entry.displayName} configured`,
        description: saved.lastError || 'Integration metadata persisted locally in IndexedDB.',
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Integration configuration blocked',
        description: err instanceof Error ? err.message : 'Unable to save integration.',
      });
    } finally {
      setBusyProvider(null);
    }
  };

  const handleTest = async (conn: IntegrationConnection) => {
    setBusyProvider(conn.provider);
    try {
      const updated = await testIntegrationConnection(conn);
      await refresh();
      pushToast({
        tone: updated.status === 'configured' ? 'success' : 'warning',
        title: `${conn.displayName}: ${updated.status.replace('_', ' ')}`,
        description: updated.lastError || 'SSRF and adapter health check passed.',
      });
    } finally {
      setBusyProvider(null);
    }
  };

  const handleDisconnect = async (conn: IntegrationConnection) => {
    setBusyProvider(conn.provider);
    try {
      await disconnectIntegrationAdapter(conn);
      setEndpointDrafts((prev) => ({ ...prev, [conn.provider]: '' }));
      setAccountDrafts((prev) => ({ ...prev, [conn.provider]: '' }));
      await refresh();
      pushToast({ tone: 'info', title: `${conn.displayName} disconnected` });
    } finally {
      setBusyProvider(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Centralized Integration Hub"
        description="Manage calendar/email OAuth adapters, SSRF-hardened webhooks, AI providers, and merchant payment gateway connectors without storing secrets in browser storage."
      />

      <Card className="bg-slate-50/70 dark:bg-[#101827]/70">
        <div className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
          <ShieldAlert className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            Security Guarantee: SOLODESK AI stores only adapter metadata, scopes, and SSRF-validated
            public endpoint URLs. OAuth secrets, Gemini API keys, and payment processor credentials
            are never stored in IndexedDB, <code className="font-mono">localStorage</code>, or{' '}
            <code className="font-mono">sessionStorage</code>.
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {INTEGRATION_CATALOG.map((entry) => {
          const existing = connectionByProvider.get(entry.provider);
          const status = existing?.status ?? 'disconnected';
          const isBusy = busyProvider === entry.provider;

          return (
            <Card key={entry.provider} className="space-y-4">
              <CardHeader
                title={entry.displayName}
                description={entry.description}
                action={
                  <Badge
                    tone={
                      status === 'configured'
                        ? 'success'
                        : status === 'blocked_credentials'
                          ? 'warning'
                          : status === 'error'
                            ? 'danger'
                            : 'neutral'
                    }
                  >
                    {status === 'configured'
                      ? 'Configured'
                      : status === 'blocked_credentials'
                        ? 'Blocked · Credentials'
                        : status === 'error'
                          ? 'Error'
                          : 'Disconnected'}
                  </Badge>
                }
              />

              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#101827]/70 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2">
                {entry.requiresExternalCredentials ? (
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                )}
                <span>{entry.setupGuidance}</span>
              </div>

              <div className="space-y-3">
                <Input
                  label="Account / Workspace Label"
                  placeholder="e.g., studio@company.com or Zapier Workspace"
                  value={accountDrafts[entry.provider] ?? existing?.accountLabel ?? ''}
                  onChange={(e) =>
                    setAccountDrafts((prev) => ({ ...prev, [entry.provider]: e.target.value }))
                  }
                />
                {entry.requiresEndpointUrl && (
                  <Input
                    label="HTTPS Endpoint URL (SSRF-Validated)"
                    type="url"
                    placeholder="https://hooks.example.com/solodesk"
                    value={endpointDrafts[entry.provider] ?? existing?.endpointUrl ?? ''}
                    onChange={(e) =>
                      setEndpointDrafts((prev) => ({ ...prev, [entry.provider]: e.target.value }))
                    }
                  />
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="text-[11px] font-mono text-slate-500">
                  Scopes: {entry.defaultScopes.join(', ')}
                </span>
                <div className="flex items-center gap-2">
                  {existing && status !== 'disconnected' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        loading={isBusy}
                        icon={<RefreshCw className="w-3.5 h-3.5" />}
                        onClick={() => void handleTest(existing)}
                      >
                        Check
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={isBusy}
                        icon={<Unplug className="w-3.5 h-3.5 text-rose-600" />}
                        onClick={() => void handleDisconnect(existing)}
                      >
                        Disconnect
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="primary"
                    loading={isBusy}
                    icon={<Link2 className="w-3.5 h-3.5" />}
                    onClick={() => void handleConfigure(entry)}
                  >
                    {existing && status !== 'disconnected' ? 'Update Adapter' : 'Configure'}
                  </Button>
                </div>
              </div>

              {existing?.lastError && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300 font-mono">
                  {existing.lastError}
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};
