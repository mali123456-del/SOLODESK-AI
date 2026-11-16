import React, { useMemo, useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import { Badge, Card, EmptyState, Input, PageHeader } from '../../components/ui';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import type { AppRouteId } from '../../types/navigation';

interface GlobalSearchViewProps {
  onNavigate: (route: AppRouteId) => void;
}

interface SearchResultItem {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  route: AppRouteId;
}

export const GlobalSearchView: React.FC<GlobalSearchViewProps> = ({ onNavigate }) => {
  const {
    clients,
    projects,
    tasks,
    proposals,
    quotations,
    contracts,
    invoices,
    knowledgeDocs,
  } = useWorkspace();
  const [query, setQuery] = useState('');

  const results = useMemo<SearchResultItem[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: SearchResultItem[] = [];

    clients.forEach((c) => {
      if (
        c.name.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
      ) {
        out.push({
          id: c.id,
          type: 'Client',
          title: c.name,
          subtitle: c.company || c.email || c.location,
          route: 'clients',
        });
      }
    });

    projects.forEach((p) => {
      if (p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)) {
        out.push({
          id: p.id,
          type: 'Project',
          title: p.name,
          subtitle: `${p.status} · ${p.progress}%`,
          route: 'projects',
        });
      }
    });

    tasks.forEach((t) => {
      if (t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)) {
        out.push({
          id: t.id,
          type: 'Task',
          title: t.title,
          subtitle: `${t.status.replace('_', ' ')} · ${t.priority}`,
          route: 'tasks',
        });
      }
    });

    proposals.forEach((p) => {
      if (p.title.toLowerCase().includes(q) || p.number.toLowerCase().includes(q)) {
        out.push({
          id: p.id,
          type: 'Proposal',
          title: `${p.number} — ${p.title}`,
          subtitle: p.status,
          route: 'proposals',
        });
      }
    });

    quotations.forEach((qt) => {
      if (qt.title.toLowerCase().includes(q) || qt.number.toLowerCase().includes(q)) {
        out.push({
          id: qt.id,
          type: 'Quotation',
          title: `${qt.number} — ${qt.title}`,
          subtitle: qt.status,
          route: 'quotations',
        });
      }
    });

    contracts.forEach((c) => {
      if (c.title.toLowerCase().includes(q) || c.number.toLowerCase().includes(q)) {
        out.push({
          id: c.id,
          type: 'Contract',
          title: `${c.number} — ${c.title}`,
          subtitle: c.status,
          route: 'contracts',
        });
      }
    });

    invoices.forEach((inv) => {
      if (inv.number.toLowerCase().includes(q) || inv.notes.toLowerCase().includes(q)) {
        out.push({
          id: inv.id,
          type: 'Invoice',
          title: inv.number,
          subtitle: `${inv.status.replace('_', ' ')} · ${inv.total} ${inv.currency}`,
          route: 'invoices',
        });
      }
    });

    knowledgeDocs.forEach((doc) => {
      if (doc.title.toLowerCase().includes(q) || doc.content.toLowerCase().includes(q)) {
        out.push({
          id: doc.id,
          type: 'Knowledge',
          title: doc.title,
          subtitle: `${doc.chunkCount} chunks`,
          route: 'knowledge',
        });
      }
    });

    return out.slice(0, 40);
  }, [query, clients, projects, tasks, proposals, quotations, contracts, invoices, knowledgeDocs]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Global Search"
        description="Search across clients, projects, tasks, invoices, quotations, contracts, and local knowledge."
      />

      <Input
        placeholder="Type a client name, invoice number, project, or keyword..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        leftIcon={<Search className="w-4 h-4" />}
        aria-label="Global workspace search"
      />

      {!query.trim() ? (
        <EmptyState
          icon={<Search className="w-5 h-5" />}
          title="Search your entire local workspace"
          description="Matches run locally against IndexedDB records without sending queries to any server."
        />
      ) : results.length === 0 ? (
        <EmptyState
          icon={<Search className="w-5 h-5" />}
          title="No matching records"
          description={`Nothing matched "${query}". Try a different name, number, or keyword.`}
        />
      ) : (
        <Card padding="none" className="divide-y divide-slate-100 dark:divide-slate-800">
          {results.map((item) => (
            <button
              key={`${item.type}_${item.id}`}
              type="button"
              onClick={() => onNavigate(item.route)}
              className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-left cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Badge tone="info">{item.type}</Badge>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {item.title}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{item.subtitle}</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            </button>
          ))}
        </Card>
      )}
    </div>
  );
};
