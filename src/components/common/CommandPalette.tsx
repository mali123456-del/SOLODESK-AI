import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Focus, Pin, Search, Star } from 'lucide-react';
import { Dialog, Input } from '../ui';
import { APP_NAVIGATION, type AppRouteId } from '../../types/navigation';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (route: AppRouteId) => void;
  onActivateFocusMode?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  onNavigate,
  onActivateFocusMode,
}) => {
  const { clients, projects, tasks, invoices, vaultFiles, savedViews, settings } = useWorkspace();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const pinnedSet = useMemo(() => new Set(settings?.pinnedIds ?? []), [settings?.pinnedIds]);
  const favoriteSet = useMemo(() => new Set(settings?.favoriteIds ?? []), [settings?.favoriteIds]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list: Array<{
      id: string;
      label: string;
      category: string;
      route: AppRouteId;
      isFocusAction?: boolean;
      pinned?: boolean;
      favorite?: boolean;
    }> = [
      ...(onActivateFocusMode
        ? [
            {
              id: 'action_focus_mode',
              label: 'Toggle Focus Mode (Distraction-Free Workspace)',
              category: 'Productivity Action',
              route: 'focus-mode' as AppRouteId,
              isFocusAction: true,
            },
          ]
        : []),
      ...savedViews.map((sv) => ({
        id: `view_${sv.id}`,
        label: `Saved View: ${sv.name}`,
        category: `Filter View (${sv.route})`,
        route: (APP_NAVIGATION.find((n) => n.id === sv.route)?.id ?? 'dashboard') as AppRouteId,
      })),
      ...APP_NAVIGATION.map((n) => ({
        id: `nav_${n.id}`,
        label: n.label,
        category: n.group,
        route: n.id,
      })),
      ...projects.map((p) => ({
        id: `prj_${p.id}`,
        label: `Project: ${p.name}`,
        category: p.status,
        route: 'projects' as AppRouteId,
        pinned: pinnedSet.has(p.id),
        favorite: favoriteSet.has(p.id),
      })),
      ...tasks.slice(0, 20).map((t) => ({
        id: `tsk_${t.id}`,
        label: `Task: ${t.title}`,
        category: `${t.priority} · ${t.status}`,
        route: 'tasks' as AppRouteId,
        pinned: pinnedSet.has(t.id),
        favorite: favoriteSet.has(t.id),
      })),
      ...clients.map((c) => ({
        id: `cli_${c.id}`,
        label: `Client: ${c.name}`,
        category: c.company || 'Clients',
        route: 'clients' as AppRouteId,
      })),
      ...invoices.map((i) => ({
        id: `inv_${i.id}`,
        label: `Invoice: ${i.number}`,
        category: i.status,
        route: 'invoices' as AppRouteId,
      })),
      ...vaultFiles.slice(0, 10).map((v) => ({
        id: `vlt_${v.id}`,
        label: `Vault: ${v.name}`,
        category: v.folder,
        route: 'vault' as AppRouteId,
      })),
    ];

    if (!q) {
      const prioritized = [
        ...list.filter((i) => i.isFocusAction || i.pinned || i.favorite),
        ...list.filter((i) => !i.isFocusAction && !i.pinned && !i.favorite),
      ];
      return prioritized.slice(0, 14);
    }
    return list
      .filter(
        (item) =>
          item.label.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
      )
      .slice(0, 16);
  }, [
    query,
    onActivateFocusMode,
    savedViews,
    projects,
    tasks,
    clients,
    invoices,
    vaultFiles,
    pinnedSet,
    favoriteSet,
  ]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Command Palette"
      description="Jump to any module, saved view, pinned project, or activate Focus Mode (Ctrl+K)"
      size="md"
    >
      <div className="space-y-3">
        <Input
          autoFocus
          placeholder="Type a module, project, task, saved view, or 'focus'..."
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
                    if (item.isFocusAction && onActivateFocusMode) {
                      onActivateFocusMode();
                    } else {
                      onNavigate(item.route);
                    }
                    onClose();
                  }}
                  className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-lg cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {item.isFocusAction && <Focus className="w-4 h-4 text-[#2563EB] shrink-0" />}
                    {item.pinned && <Pin className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                    {item.favorite && <Star className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {item.label}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">{item.category}</p>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </Dialog>
  );
};
