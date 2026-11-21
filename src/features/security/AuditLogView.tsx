import React, { useMemo, useState } from 'react';
import { Download, Eye, FileJson, RefreshCw, Search, Shield } from 'lucide-react';
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
import { buildCsvContent, downloadTextFile } from '../../export/csvUtils';
import { recordStructuredAudit } from '../../security/auditLogger';
import { fetchServerAuditLogs } from '../../services/backendAuthClient';
import type { AuditEvent } from '../../domain/schemas/entities';

const PAGE_SIZE = 25;

export const AuditLogView: React.FC = () => {
  const { auditEvents, activeWorkspace, refresh } = useWorkspace();
  const { pushToast } = useToast();

  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'success' | 'failure'>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'info' | 'warning' | 'critical'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [serverLogs, setServerLogs] = useState<AuditEvent[] | null>(null);
  const [syncingServer, setSyncingServer] = useState(false);

  const combinedEvents = useMemo(() => {
    if (!serverLogs) return auditEvents;
    const seen = new Set(auditEvents.map((e) => e.id));
    return [...auditEvents, ...serverLogs.filter((s) => !seen.has(s.id))].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }, [auditEvents, serverLogs]);

  const availableEventTypes = useMemo(() => {
    const types = Array.from(new Set(combinedEvents.map((e) => e.eventType))).sort();
    return types;
  }, [combinedEvents]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return combinedEvents.filter((evt) => {
      if (eventTypeFilter !== 'all' && evt.eventType !== eventTypeFilter) return false;
      if (outcomeFilter !== 'all' && evt.outcome !== outcomeFilter) return false;
      if (severityFilter !== 'all' && evt.severity !== severityFilter) return false;
      if (!q) return true;
      return (
        evt.eventType.toLowerCase().includes(q) ||
        evt.detail.toLowerCase().includes(q) ||
        evt.resourceId.toLowerCase().includes(q) ||
        evt.resourceType.toLowerCase().includes(q) ||
        evt.actorEmail.toLowerCase().includes(q)
      );
    });
  }, [combinedEvents, eventTypeFilter, outcomeFilter, severityFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  const handleFetchServer = async () => {
    setSyncingServer(true);
    try {
      const res = await fetchServerAuditLogs({
        workspaceId: activeWorkspace?.id ?? 'local-workspace',
        limit: 100,
      });
      if (!res.ok) {
        pushToast({
          tone: 'info',
          title: 'Local audit ledger active',
          description: res.message ?? 'Displaying local IndexedDB audit events.',
        });
        return;
      }
      const mapped: AuditEvent[] = res.logs.map((row) => ({
        id: row.id,
        workspaceId: activeWorkspace?.id ?? 'local-workspace',
        actorId: row.actorUserId,
        actorEmail: row.actorUserId,
        eventType: (row.eventType as AuditEvent['eventType']) ?? 'SECURITY_SETTING_CHANGED',
        action: row.eventType.toLowerCase(),
        resourceType: row.resourceType || 'workspace',
        resourceId: row.resourceId || '',
        outcome: row.outcome === 'failure' || row.outcome === 'denied' ? 'failure' : 'success',
        correlationId: row.id,
        severity:
          row.severity === 'critical' || row.severity === 'warning' ? row.severity : 'info',
        detail: row.detail,
        metadataJson: row.metadataJson || '{}',
        createdAt: row.createdAt,
      }));
      setServerLogs(mapped);
      pushToast({
        tone: 'success',
        title: 'Loaded server audit entries',
        description: `Merged ${mapped.length} cloud audit event(s).`,
      });
    } finally {
      setSyncingServer(false);
    }
  };

  const handleExportCsv = async () => {
    const headers = [
      'id',
      'createdAt',
      'eventType',
      'severity',
      'outcome',
      'actorEmail',
      'resourceType',
      'resourceId',
      'detail',
      'metadataJson',
    ];
    const rows = filtered.map((e) => [
      e.id,
      e.createdAt,
      e.eventType,
      e.severity,
      e.outcome,
      e.actorEmail,
      e.resourceType,
      e.resourceId,
      e.detail,
      e.metadataJson,
    ]);
    const csv = buildCsvContent(headers, rows);
    downloadTextFile(
      `solodesk-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`,
      csv
    );
    await recordStructuredAudit({
      eventType: 'DATA_EXPORTED',
      action: 'audit_logs.export_csv',
      resourceType: 'audit_logs',
      resourceId: activeWorkspace?.id ?? 'local-workspace',
      detail: `Exported ${filtered.length} structured audit event(s) as CSV.`,
      metadata: { count: filtered.length, format: 'csv' },
    });
    await refresh();
    pushToast({ tone: 'success', title: `Exported ${filtered.length} audit events (CSV)` });
  };

  const handleExportJson = async () => {
    const payload = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        workspaceId: activeWorkspace?.id ?? 'local-workspace',
        total: filtered.length,
        events: filtered,
      },
      null,
      2
    );
    downloadTextFile(
      `solodesk-audit-logs-${new Date().toISOString().slice(0, 10)}.json`,
      payload,
      'application/json;charset=utf-8'
    );
    await recordStructuredAudit({
      eventType: 'DATA_EXPORTED',
      action: 'audit_logs.export_json',
      resourceType: 'audit_logs',
      resourceId: activeWorkspace?.id ?? 'local-workspace',
      detail: `Exported ${filtered.length} structured audit event(s) as JSON.`,
      metadata: { count: filtered.length, format: 'json' },
    });
    await refresh();
    pushToast({ tone: 'success', title: `Exported ${filtered.length} audit events (JSON)` });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Centralized Audit Log"
        description="Append-only, workspace-isolated audit ledger with scrubbed metadata and RFC 4180 CSV / JSON exports."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              loading={syncingServer}
              onClick={() => void handleFetchServer()}
              icon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Sync Cloud Audit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleExportCsv()}
              icon={<Download className="w-3.5 h-3.5" />}
            >
              Export CSV
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleExportJson()}
              icon={<FileJson className="w-3.5 h-3.5" />}
            >
              Export JSON
            </Button>
          </div>
        }
      />

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Select
            label="Event Type"
            value={eventTypeFilter}
            onChange={(e) => {
              setEventTypeFilter(e.target.value);
              setPage(1);
            }}
            options={[
              { value: 'all', label: `All Event Types (${combinedEvents.length})` },
              ...availableEventTypes.map((t) => ({ value: t, label: t })),
            ]}
          />
          <Select
            label="Outcome"
            value={outcomeFilter}
            onChange={(e) => {
              setOutcomeFilter(e.target.value as typeof outcomeFilter);
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'All Outcomes' },
              { value: 'success', label: 'Success' },
              { value: 'failure', label: 'Failure' },
            ]}
          />
          <Select
            label="Severity"
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value as typeof severityFilter);
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'All Severities' },
              { value: 'info', label: 'Info' },
              { value: 'warning', label: 'Warning' },
              { value: 'critical', label: 'Critical' },
            ]}
          />
          <Input
            label="Search Ledger"
            placeholder="Resource ID, actor, detail..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>
      </Card>

      <Card padding="none">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing <strong className="font-mono tabular-nums">{paged.length}</strong> of{' '}
            <strong className="font-mono tabular-nums">{filtered.length}</strong> audit event(s) ·
            Workspace <span className="font-mono">{activeWorkspace?.name ?? 'Local'}</span>
          </span>
          <span className="font-mono tabular-nums">
            Page {safePage} / {totalPages}
          </span>
        </div>

        {paged.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Shield className="w-5 h-5" />}
              title="No matching audit events"
              description="Workspace writes, exports, settings changes, and security actions are appended automatically."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {paged.map((evt) => (
              <div
                key={evt.id}
                className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-[#101827]/70"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-semibold text-slate-900 dark:text-white">
                      {evt.eventType}
                    </span>
                    <Badge
                      tone={
                        evt.severity === 'critical'
                          ? 'danger'
                          : evt.severity === 'warning'
                            ? 'warning'
                            : 'info'
                      }
                    >
                      {evt.severity}
                    </Badge>
                    <Badge tone={evt.outcome === 'failure' ? 'danger' : 'success'}>
                      {evt.outcome}
                    </Badge>
                    {evt.resourceType && (
                      <span className="text-[11px] font-mono text-slate-500">
                        {evt.resourceType}
                        {evt.resourceId ? `:${evt.resourceId}` : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300">{evt.detail}</p>
                  <p className="text-[11px] font-mono text-slate-400">
                    Actor: {evt.actorEmail || evt.actorId}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    {new Date(evt.createdAt).toLocaleString()}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Eye className="w-3.5 h-3.5" />}
                    onClick={() => setSelectedEvent(evt)}
                  >
                    Inspect
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <Button
              size="sm"
              variant="outline"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        )}
      </Card>

      <Dialog
        open={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        title={selectedEvent ? `Audit Event: ${selectedEvent.eventType}` : 'Audit Event'}
        size="md"
      >
        {selectedEvent && (
          <div className="space-y-3 text-xs">
            <CardHeader
              title={selectedEvent.detail}
              description={`Recorded ${new Date(selectedEvent.createdAt).toLocaleString()} · Append-only`}
            />
            <div className="grid grid-cols-2 gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-800 font-mono">
              <div>
                <span className="text-slate-500 block">Actor</span>
                <span>{selectedEvent.actorEmail || selectedEvent.actorId}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Resource</span>
                <span>
                  {selectedEvent.resourceType} {selectedEvent.resourceId}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Outcome</span>
                <span>{selectedEvent.outcome}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Correlation ID</span>
                <span>{selectedEvent.correlationId || selectedEvent.id}</span>
              </div>
            </div>
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Scrubbed Metadata JSON
              </p>
              <pre className="p-3 rounded-lg bg-slate-950 text-slate-100 font-mono text-[11px] overflow-x-auto max-h-56">
                {selectedEvent.metadataJson || '{}'}
              </pre>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};
