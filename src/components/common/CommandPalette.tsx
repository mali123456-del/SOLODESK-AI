import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import { Dialog, Input } from '../ui';
import { APP_NAVIGATION, type AppRouteId } from '../../types/navigation';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (route: AppRouteId) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  onNavigate,
}) => {
  const { clients, projects, invoices } = useWorkspace();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list: Array<{ id: string; label: string; category: string; route: AppRouteId }> = [
      ...APP_NAVIGATION.map((n) => ({
        id: `nav_${n.id}`,
        label: n.label,
        category: n.group,
        route: n.id,
      })),
      ...clients.map((c) => ({
        id: `cli_${c.id}`,
        label: `Client: ${c.name}`,
        category: c.company || 'Clients',
        route: 'clients' as AppRouteId,
      })),
      ...projects.map((p) => ({
        id: `prj_${p.id}`,
        label: `Project: ${p.name}`,
        category: p.status,
        route: 'projects' as AppRouteId,
      })),
      ...invoices.map((i) => ({
        id: `inv_${i.id}`,
        label: `Invoice: ${i.number}`,
        category: i.status,
        route: 'invoices' as AppRouteId,
      })),
    ];

    if (!q) return list.slice(0, 12);
    return list
      .filter(
        (item) =>
          item.label.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
      )
      .slice(0, 14);
  }, [query, clients, projects, invoices]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Command Palette"
      description="Jump to any page or record (Ctrl+K)"
      size="md"
    >
      <div className="space-y-3">
        <Input
          autoFocus
          placeholder="Type a module, client, project, or invoice #..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          leftIcon={<Search className="w-4 h-4" />}
          aria-label="Command palette search"
        />
        <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {items.length === 0 ? (
            <li className="py-6 text-center text-xs text-slate-500">No matching commands.</li>
          ) : (
            items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate(item.route);
                    onClose();
                  }}
                  className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-lg cursor-pointer"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {item.label}
                    </p>
                    <p className="text-[11px] text-slate-500">{item.category}</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </Dialog>
  );
};
