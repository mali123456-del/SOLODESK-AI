import React, { useState } from 'react';
import {
  Activity,
  ArchiveRestore,
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  CheckSquare,
  Clock,
  CreditCard,
  DollarSign,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  Globe,
  Info,
  LayoutDashboard,
  Menu,
  Moon,
  Palette,
  Receipt,
  Search,
  Shield,
  Sparkles,
  Sun,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { SolodeskLogo } from '../../assets/SolodeskLogo';
import { cn } from '../../lib/cn';
import { APP_NAVIGATION, NAV_GROUPS, type AppRouteId } from '../../types/navigation';
import { useTheme } from '../providers/ThemeProvider';

export const ROUTE_ICONS: Record<AppRouteId, React.ReactNode> = {
  dashboard: <LayoutDashboard className="w-4 h-4" />,
  activity: <Activity className="w-4 h-4" />,
  notifications: <Bell className="w-4 h-4" />,
  clients: <Users className="w-4 h-4" />,
  projects: <FolderKanban className="w-4 h-4" />,
  tasks: <CheckSquare className="w-4 h-4" />,
  'time-tracker': <Clock className="w-4 h-4" />,
  proposals: <FileText className="w-4 h-4" />,
  quotations: <FileSpreadsheet className="w-4 h-4" />,
  contracts: <FileCheck2 className="w-4 h-4" />,
  invoices: <Receipt className="w-4 h-4" />,
  payments: <CreditCard className="w-4 h-4" />,
  income: <TrendingUp className="w-4 h-4" />,
  expenses: <TrendingDown className="w-4 h-4" />,
  profitability: <DollarSign className="w-4 h-4" />,
  reports: <BarChart3 className="w-4 h-4" />,
  'ai-copilot': <Sparkles className="w-4 h-4" />,
  knowledge: <BookOpen className="w-4 h-4" />,
  templates: <Briefcase className="w-4 h-4" />,
  search: <Search className="w-4 h-4" />,
  'import-export': <ArchiveRestore className="w-4 h-4" />,
  'settings-profile': <UserCheck className="w-4 h-4" />,
  'settings-appearance': <Palette className="w-4 h-4" />,
  'settings-localization': <Globe className="w-4 h-4" />,
  'settings-ai': <Sparkles className="w-4 h-4" />,
  'settings-backup': <ArchiveRestore className="w-4 h-4" />,
  'settings-privacy': <Shield className="w-4 h-4" />,
  about: <Info className="w-4 h-4" />,
  marketing: <Globe className="w-4 h-4" />,
};

interface AppShellProps {
  activeRoute: AppRouteId;
  onNavigate: (route: AppRouteId) => void;
  onOpenCommandPalette?: () => void;
  unreadNotifications?: number;
  isOnline?: boolean;
  headerRightExtra?: React.ReactNode;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  activeRoute,
  onNavigate,
  onOpenCommandPalette,
  unreadNotifications = 0,
  isOnline = true,
  headerRightExtra,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { resolvedTheme, toggleTheme } = useTheme();

  const currentNav = APP_NAVIGATION.find((n) => n.id === activeRoute);

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
      {/* Desktop Sidebar */}
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

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
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
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <header className="sticky top-0 z-30 h-16 bg-white/95 dark:bg-[#172338]/95 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
            <div className="min-w-0 flex items-center gap-2 text-sm">
              <span className="hidden sm:inline text-slate-400 dark:text-slate-500">
                {currentNav?.group ?? 'SOLODESK AI'}
              </span>
              <span className="hidden sm:inline text-slate-300 dark:text-slate-600" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 dark:text-white truncate">
                {activeRoute === 'marketing'
                  ? 'Product Overview'
                  : (currentNav?.label ?? 'Dashboard')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isOnline && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs font-medium">
                <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Offline</span>
              </span>
            )}

            {headerRightExtra}

            {onOpenCommandPalette && (
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

        {/* Mobile Bottom Quick Nav */}
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
      </div>
    </div>
  );
};
