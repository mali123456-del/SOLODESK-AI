import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArchiveRestore,
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  Calendar,
  CheckSquare,
  Clock,
  Cloud,
  CreditCard,
  DollarSign,
  EyeOff,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Focus,
  FolderKanban,
  FolderLock,
  Globe,
  HelpCircle,
  Info,
  Keyboard,
  LayoutDashboard,
  Menu,
  Moon,
  Palette,
  Receipt,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Square,
  Sun,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
  WifiOff,
  Workflow,
  X,
} from 'lucide-react';
import type { LocalSyncStatus } from '../../core/syncEvents';
import type { TimeEntry } from '../../domain/schemas/entities';
import { formatDurationHMS } from '../../domain/calculations/dates';
import { SolodeskLogo } from '../../assets/SolodeskLogo';
import { WorkspaceSwitcher } from '../../features/workspaces/WorkspaceSwitcher';
import { cn } from '../../lib/cn';
import {
  SYNC_LIFECYCLE_LABELS,
  type SyncLifecycleStatus,
} from '../../services/cloudSyncService';
import { APP_NAVIGATION, NAV_GROUPS, type AppRouteId } from '../../types/navigation';
import { useTheme } from '../providers/ThemeProvider';

export const ROUTE_ICONS: Record<AppRouteId, React.ReactNode> = {
  dashboard: <LayoutDashboard className="w-4 h-4" />,
  'focus-mode': <Focus className="w-4 h-4" />,
  activity: <Activity className="w-4 h-4" />,
  notifications: <Bell className="w-4 h-4" />,
  clients: <Users className="w-4 h-4" />,
  'client-portal': <UserCheck className="w-4 h-4" />,
  projects: <FolderKanban className="w-4 h-4" />,
  tasks: <CheckSquare className="w-4 h-4" />,
  'time-tracker': <Clock className="w-4 h-4" />,
  communication: <Calendar className="w-4 h-4" />,
  proposals: <FileText className="w-4 h-4" />,
  quotations: <FileSpreadsheet className="w-4 h-4" />,
  contracts: <FileCheck2 className="w-4 h-4" />,
  invoices: <Receipt className="w-4 h-4" />,
  payments: <CreditCard className="w-4 h-4" />,
  vault: <FolderLock className="w-4 h-4" />,
  income: <TrendingUp className="w-4 h-4" />,
  expenses: <TrendingDown className="w-4 h-4" />,
  profitability: <DollarSign className="w-4 h-4" />,
  reports: <BarChart3 className="w-4 h-4" />,
  'ai-copilot': <Sparkles className="w-4 h-4" />,
  knowledge: <BookOpen className="w-4 h-4" />,
  templates: <Briefcase className="w-4 h-4" />,
  workflows: <Workflow className="w-4 h-4" />,
  'cloud-sync': <Cloud className="w-4 h-4" />,
  search: <Search className="w-4 h-4" />,
  'import-export': <ArchiveRestore className="w-4 h-4" />,
  'settings-profile': <UserCheck className="w-4 h-4" />,
  'settings-appearance': <Palette className="w-4 h-4" />,
  'settings-localization': <Globe className="w-4 h-4" />,
  'settings-ai': <Sparkles className="w-4 h-4" />,
  'settings-backup': <ArchiveRestore className="w-4 h-4" />,
  'settings-privacy': <Shield className="w-4 h-4" />,
  'settings-cloud-sync': <Cloud className="w-4 h-4" />,
  'security-center': <ShieldCheck className="w-4 h-4" />,
  'help-plans': <HelpCircle className="w-4 h-4" />,
  about: <Info className="w-4 h-4" />,
  marketing: <Globe className="w-4 h-4" />,
};

interface AppShellProps {
  activeRoute: AppRouteId;
  onNavigate: (route: AppRouteId) => void;
  onOpenCommandPalette?: () => void;
  onOpenShortcuts?: () => void;
  focusModeActive?: boolean;
  onToggleFocusMode?: () => void;
  unreadNotifications?: number;
  isOnline?: boolean;
  syncStatus?: LocalSyncStatus;
  syncLifecycleStatus?: SyncLifecycleStatus;
  pendingSyncCount?: number;
  syncError?: string | null;
  lastSyncedAt?: string | null;
  onRetrySync?: () => void;
  runningTimer?: TimeEntry | null;
  timerElapsedSeconds?: number;
  onStopGlobalTimer?: () => void;
  headerRightExtra?: React.ReactNode;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  activeRoute,
  onNavigate,
  onOpenCommandPalette,
  onOpenShortcuts,
  focusModeActive = false,
  onToggleFocusMode,
  unreadNotifications = 0,
  isOnline = true,
  syncStatus = 'idle',
  syncLifecycleStatus = 'local_only',
  pendingSyncCount = 0,
  syncError = null,
  lastSyncedAt = null,
  onRetrySync,
  runningTimer = null,
  timerElapsedSeconds = 0,
  onStopGlobalTimer,
  headerRightExtra,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { resolvedTheme, toggleTheme } = useTheme();

  const currentNav = useMemo(
    () => APP_NAVIGATION.find((n) => n.id === activeRoute),
    [activeRoute]
  );

  const handleSelect = (id: AppRouteId) => {
    onNavigate(id);
    setMobileMenuOpen(false);
  };

  const renderNavLinks = () => (
    <nav aria-label="Primary Workspace Navigation" className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
      {NAV_GROUPS.map((group) => {
        const items = APP_NAVIGATION.filter((item) => item.group === group);
        return (
          <div key={group}>
            <p className="px-2.5 mb-1.5 text-[11px] font-semibold tracking-wider text-slate-400">
              {group}
            </p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const isActive = activeRoute === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-[10px] text-sm font-medium transition-colors cursor-pointer text-left',
                        isActive
                          ? 'bg-[#2563EB] text-white'
                          : 'text-slate-300 hover:text-white hover:bg-[#172338]'
                      )}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span className={cn('shrink-0', isActive ? 'text-[#20C7D9]' : 'text-slate-400')}>
                          {ROUTE_ICONS[item.id]}
                        </span>
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.id === 'notifications' && unreadNotifications > 0 && (
                        <span className="text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-slate-800 text-[#20C7D9]">
                          {unreadNotifications}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen flex bg-[#F5F7FB] dark:bg-[#101827] text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar — Hidden cleanly in Focus Mode */}
      {!focusModeActive && (
        <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-[#101827] border-r border-slate-800 no-print">
          <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800/80">
            <button
              type="button"
              onClick={() => handleSelect('dashboard')}
              className="cursor-pointer rounded-lg py-1"
            >
              <SolodeskLogo inverted />
            </button>
          </div>
          <div className="px-3 pt-3">
            <WorkspaceSwitcher />
          </div>
          {renderNavLinks()}
          <div className="p-3 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => handleSelect('marketing')}
              className="w-full px-3 py-2 rounded-[10px] text-xs font-medium text-slate-300 hover:text-white hover:bg-[#172338] flex items-center justify-between cursor-pointer transition-colors"
            >
              <span>Product & Pricing Overview</span>
              <Globe className="w-3.5 h-3.5 text-[#20C7D9]" aria-hidden="true" />
            </button>
          </div>
        </aside>
      )}

      {/* Mobile Drawer */}
      {!focusModeActive && mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] bg-[#101827] text-white flex flex-col h-full border-r border-slate-800 z-10">
            <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800">
              <SolodeskLogo inverted />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#172338] cursor-pointer"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <div className="px-3 pt-3">
              <WorkspaceSwitcher />
            </div>
            {renderNavLinks()}
            <div className="p-3 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => handleSelect('marketing')}
                className="w-full px-3 py-2 rounded-[10px] text-xs font-medium text-slate-300 hover:text-white hover:bg-[#172338] flex items-center justify-between cursor-pointer"
              >
                <span>Product & Pricing Overview</span>
                <Globe className="w-3.5 h-3.5 text-[#20C7D9]" aria-hidden="true" />
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className={cn('flex-1 flex flex-col min-w-0', !focusModeActive && 'lg:pl-64')}>
        <header className="sticky top-0 z-30 h-16 bg-white/95 dark:bg-[#172338]/95 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            {!focusModeActive && (
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open navigation menu"
                className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Menu className="w-5 h-5" aria-hidden="true" />
              </button>
            )}
            <div className="min-w-0 flex items-center gap-2 text-sm">
              <span className="hidden sm:inline text-slate-400 dark:text-slate-500">
                {focusModeActive ? 'Distraction-Free' : (currentNav?.group ?? 'SOLODESK AI')}
              </span>
              <span className="hidden sm:inline text-slate-300 dark:text-slate-600" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 dark:text-white truncate">
                {focusModeActive
                  ? 'Focus Mode'
                  : activeRoute === 'marketing'
                    ? 'Product Overview'
                    : (currentNav?.label ?? 'Dashboard')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {runningTimer && (
              <div
                data-testid="global-timer-indicator"
                className="inline-flex items-center gap-1.5 h-9 pl-2.5 pr-1.5 rounded-[10px] border border-blue-200 dark:border-blue-800/80 bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-100 text-xs font-medium whitespace-nowrap shrink-0"
              >
                <button
                  type="button"
                  onClick={() => handleSelect('time-tracker')}
                  aria-label={`Active timer: ${runningTimer.description}`}
                  className="inline-flex items-center gap-1.5 cursor-pointer hover:underline max-w-[160px]"
                >
                  <Clock className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#20C7D9] shrink-0" aria-hidden="true" />
                  <span className="font-mono tabular-nums font-semibold">
                    {formatDurationHMS(timerElapsedSeconds)}
                  </span>
                  <span className="hidden xl:inline truncate text-slate-600 dark:text-slate-300">
                    · {runningTimer.description}
                  </span>
                </button>
                {onStopGlobalTimer && (
                  <button
                    type="button"
                    onClick={onStopGlobalTimer}
                    aria-label="Stop global timer"
                    title="Stop active timer"
                    className="p-1 rounded-md text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 cursor-pointer"
                  >
                    <Square className="w-3 h-3 fill-current" aria-hidden="true" />
                  </button>
                )}
              </div>
            )}

            {!isOnline && (
              <span
                role="status"
                aria-label="Browser is offline; working on local IndexedDB"
                title={
                  lastSyncedAt
                    ? `Offline — working locally. Last DB sync: ${new Date(lastSyncedAt).toLocaleTimeString()}`
                    : 'Offline — working on local IndexedDB'
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-800/80 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs font-medium whitespace-nowrap"
              >
                <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">Offline · Local DB</span>
              </span>
            )}

            {(syncStatus === 'syncing' || pendingSyncCount > 0) && (
              <span
                role="status"
                aria-live="polite"
                aria-label="Synchronizing with local database"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-cyan-200 dark:border-cyan-800/80 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-800 dark:text-cyan-300 text-xs font-medium whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin" aria-hidden="true" />
                <span>
                  {pendingSyncCount > 1 ? `Syncing DB (${pendingSyncCount})` : 'Syncing DB…'}
                </span>
              </span>
            )}

            {!focusModeActive && (
              <button
                type="button"
                onClick={() => handleSelect('cloud-sync')}
                data-testid="sync-lifecycle-badge"
                aria-label={`Cloud sync state: ${SYNC_LIFECYCLE_LABELS[syncLifecycleStatus]}`}
                title="View Cloud Sync outbox & conflict status"
                className={cn(
                  'hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium whitespace-nowrap cursor-pointer',
                  syncLifecycleStatus === 'synced'
                    ? 'border-emerald-200 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
                    : syncLifecycleStatus === 'conflict' || syncLifecycleStatus === 'failed'
                      ? 'border-rose-200 dark:border-rose-800/80 bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200'
                      : syncLifecycleStatus === 'pending' || syncLifecycleStatus === 'syncing'
                        ? 'border-amber-200 dark:border-amber-800/80 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101827] text-slate-700 dark:text-slate-300'
                )}
              >
                <Cloud className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{SYNC_LIFECYCLE_LABELS[syncLifecycleStatus]}</span>
              </button>
            )}

            {syncStatus === 'error' && (
              <div
                role="alert"
                title={syncError ?? 'Synchronization with local IndexedDB failed.'}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-800/80 bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 text-xs font-medium whitespace-nowrap"
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Local DB Sync Failed</span>
                {onRetrySync && (
                  <button
                    type="button"
                    onClick={onRetrySync}
                    className="ml-1 px-1.5 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold cursor-pointer"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}

            {onToggleFocusMode && (
              <button
                type="button"
                onClick={onToggleFocusMode}
                aria-pressed={focusModeActive}
                aria-label={focusModeActive ? 'Exit Focus Mode' : 'Enter Focus Mode'}
                className={cn(
                  'h-9 px-3 rounded-[10px] border text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors',
                  focusModeActive
                    ? 'border-[#2563EB] bg-[#2563EB] text-white'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101827] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                )}
              >
                {focusModeActive ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Exit Focus</span>
                  </>
                ) : (
                  <>
                    <Focus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span className="hidden md:inline">Focus Mode</span>
                  </>
                )}
              </button>
            )}

            {!focusModeActive && headerRightExtra}

            {!focusModeActive && onOpenCommandPalette && (
              <button
                type="button"
                onClick={onOpenCommandPalette}
                aria-label="Open command palette and search"
                className="h-9 px-3 rounded-[10px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101827] text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <Search className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden md:inline">Search / Command</span>
                <kbd className="hidden sm:inline font-mono text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-[#172338] border border-slate-200 dark:border-slate-700">
                  Ctrl K
                </kbd>
              </button>
            )}

            {!focusModeActive && onOpenShortcuts && (
              <button
                type="button"
                onClick={onOpenShortcuts}
                aria-label="Keyboard shortcuts"
                title="Keyboard shortcuts (?)"
                className="hidden sm:inline-flex p-2 rounded-[10px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Keyboard className="w-4 h-4" aria-hidden="true" />
              </button>
            )}

            {/* Notifications button hidden during Focus Mode to minimize distractions */}
            {!focusModeActive && (
              <button
                type="button"
                onClick={() => handleSelect('notifications')}
                aria-label="Open notifications"
                className="relative p-2 rounded-[10px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Bell className="w-4 h-4" aria-hidden="true" />
                {unreadNotifications > 0 && (
                  <span className="sr-only">{unreadNotifications} unread notifications</span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 rounded-[10px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Moon className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto pb-20 lg:pb-8">
          {children}
        </main>

        {/* Mobile Bottom Quick Nav — Hidden in Focus Mode */}
        {!focusModeActive && (
          <nav
            aria-label="Mobile Quick Navigation"
            className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-14 bg-white/95 dark:bg-[#172338]/95 backdrop-blur-xs border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 no-print"
          >
            {(
              [
                { id: 'dashboard', label: 'Home' },
                { id: 'clients', label: 'Clients' },
                { id: 'projects', label: 'Projects' },
                { id: 'invoices', label: 'Invoices' },
                { id: 'tasks', label: 'Tasks' },
              ] as Array<{ id: AppRouteId; label: string }>
            ).map((item) => {
              const active = activeRoute === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer',
                    active
                      ? 'text-[#2563EB] dark:text-[#20C7D9]'
                      : 'text-slate-500 dark:text-slate-400'
                  )}
                >
                  {ROUTE_ICONS[item.id]}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
};
