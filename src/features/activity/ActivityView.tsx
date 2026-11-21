import React, { useMemo, useState } from 'react';
import { Activity, Search, Shield } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select } from '../../components/ui';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import { formatDisplayDate } from '../../domain/calculations/dates';
import type { AppRouteId } from '../../types/navigation';

interface ActivityViewProps {
  onNavigate?: (route: AppRouteId) => void;
}

export const ActivityView: React.FC<ActivityViewProps> = ({ onNavigate }) => {
  const { activities, settings } = useWorkspace();
  const [entityFilter, setEntityFilter] = useState('all');
  const [search, setSearch] = useState('');
  const dateFormat = settings?.dateFormat ?? 'DD MMM YYYY';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activities.filter((a) => {
      if (entityFilter !== 'all' && a.entityType !== entityFilter) return false;
      if (!q) return true;
      return a.summary.toLowerCase().includes(q) || a.action.toLowerCase().includes(q);
    });
  }, [activities, entityFilter, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity Log"
        description="Chronological audit trail of local workspace changes across clients, documents, and finances."
        actions={
          onNavigate && (
            <Button
              variant="outline"
              size="sm"
              icon={<Shield className="w-4 h-4" />}
              onClick={() => onNavigate('audit-logs')}
            >
              Open Centralized Audit Log
            </Button>
          )
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="w-full sm:w-56">
          <Select
            aria-label="Filter activity type"
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Entity Types' },
              { value: 'client', label: 'Clients' },
              { value: 'project', label: 'Projects' },
              { value: 'task', label: 'Tasks' },
              { value: 'proposal', label: 'Proposals' },
              { value: 'quotation', label: 'Quotations' },
              { value: 'contract', label: 'Contracts' },
              { value: 'invoice', label: 'Invoices' },
              { value: 'payment', label: 'Payments' },
              { value: 'finance', label: 'Finance' },
              { value: 'time', label: 'Time Tracker' },
              { value: 'knowledge', label: 'Knowledge Hub' },
              { value: 'backup', label: 'Backup & Restore' },
            ]}
          />
        </div>
        <div className="w-full sm:w-72">
          <Input
            placeholder="Filter activity..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
            aria-label="Search activity log"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Activity className="w-5 h-5" />}
          title="No activity recorded"
          description="Actions such as creating clients, converting quotations, or logging payments appear here."
        />
      ) : (
        <Card padding="none" className="divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.map((evt) => (
            <div key={evt.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Badge tone="neutral">{evt.entityType}</Badge>
                <span className="text-sm text-slate-800 dark:text-slate-100 truncate">
                  {evt.summary}
                </span>
              </div>
              <span className="text-xs text-slate-400 shrink-0 font-mono">
                {formatDisplayDate(evt.createdAt, dateFormat)}
              </span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
};
