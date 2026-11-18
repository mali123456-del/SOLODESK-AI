import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { AppShell } from './layouts/AppShell';
import { ErrorBoundary } from './error-boundary/ErrorBoundary';
import { ThemeProvider } from './providers/ThemeProvider';
import { WorkspaceProvider, useWorkspace } from './providers/WorkspaceProvider';
import { Card, CardHeader, Dialog, Skeleton, ToastProvider } from '../components/ui';
import { APP_NAVIGATION, type AppRouteId } from '../types/navigation';
import { OnboardingModal } from '../features/onboarding/OnboardingModal';
import { CommandPalette } from '../components/common/CommandPalette';
import { PWAInstallButton } from '../pwa/PWAInstallButton';

const DashboardView = lazy(() =>
  import('../features/dashboard/DashboardView').then((m) => ({ default: m.DashboardView }))
);
const FocusModeView = lazy(() =>
  import('../features/focus/FocusModeView').then((m) => ({ default: m.FocusModeView }))
);
const ActivityView = lazy(() =>
  import('../features/activity/ActivityView').then((m) => ({ default: m.ActivityView }))
);
const NotificationsView = lazy(() =>
  import('../features/notifications/NotificationsView').then((m) => ({
    default: m.NotificationsView,
  }))
);
const ClientsView = lazy(() =>
  import('../features/clients/ClientsView').then((m) => ({ default: m.ClientsView }))
);
const ClientPortalView = lazy(() =>
  import('../features/portal/ClientPortalView').then((m) => ({ default: m.ClientPortalView }))
);
const ProjectsView = lazy(() =>
  import('../features/projects/ProjectsView').then((m) => ({ default: m.ProjectsView }))
);
const TasksView = lazy(() =>
  import('../features/tasks/TasksView').then((m) => ({ default: m.TasksView }))
);
const ProposalsView = lazy(() =>
  import('../features/proposals/ProposalsView').then((m) => ({ default: m.ProposalsView }))
);
const QuotationsView = lazy(() =>
  import('../features/quotations/QuotationsView').then((m) => ({ default: m.QuotationsView }))
);
const ContractsView = lazy(() =>
  import('../features/contracts/ContractsView').then((m) => ({ default: m.ContractsView }))
);
const InvoicesView = lazy(() =>
  import('../features/invoices/InvoicesView').then((m) => ({ default: m.InvoicesView }))
);
const PaymentsView = lazy(() =>
  import('../features/payments/PaymentsView').then((m) => ({ default: m.PaymentsView }))
);
const DocumentVaultView = lazy(() =>
  import('../features/vault/DocumentVaultView').then((m) => ({ default: m.DocumentVaultView }))
);
const FinanceView = lazy(() =>
  import('../features/finance/FinanceView').then((m) => ({ default: m.FinanceView }))
);
const TimeTrackerView = lazy(() =>
  import('../features/time-tracker/TimeTrackerView').then((m) => ({ default: m.TimeTrackerView }))
);
const ReportsView = lazy(() =>
  import('../features/reports/ReportsView').then((m) => ({ default: m.ReportsView }))
);
const TemplatesView = lazy(() =>
  import('../features/templates/TemplatesView').then((m) => ({ default: m.TemplatesView }))
);
const GlobalSearchView = lazy(() =>
  import('../features/search/GlobalSearchView').then((m) => ({ default: m.GlobalSearchView }))
);
const BackupRestoreView = lazy(() =>
  import('../features/backup/BackupRestoreView').then((m) => ({
    default: m.BackupRestoreView,
  }))
);
const ImportExportView = lazy(() =>
  import('../features/backup/ImportExportView').then((m) => ({ default: m.ImportExportView }))
);
const AICopilotView = lazy(() =>
  import('../features/assistant/AICopilotView').then((m) => ({ default: m.AICopilotView }))
);
const KnowledgeHubView = lazy(() =>
  import('../features/knowledge/KnowledgeHubView').then((m) => ({ default: m.KnowledgeHubView }))
);
const SettingsView = lazy(() =>
  import('../features/settings/SettingsView').then((m) => ({ default: m.SettingsView }))
);
const WorkflowsView = lazy(() =>
  import('../features/workflows/WorkflowsView').then((m) => ({ default: m.WorkflowsView }))
);
const CloudSyncView = lazy(() =>
  import('../features/cloud/CloudSyncView').then((m) => ({ default: m.CloudSyncView }))
);
const SecurityCenterView = lazy(() =>
  import('../features/security/SecurityCenterView').then((m) => ({ default: m.SecurityCenterView }))
);
const HelpPlansTourView = lazy(() =>
  import('../features/commercial/HelpPlansTourView').then((m) => ({ default: m.HelpPlansTourView }))
);
const CommunicationHubView = lazy(() =>
  import('../features/communication/CommunicationHubView').then((m) => ({
    default: m.CommunicationHubView,
  }))
);
const MarketingView = lazy(() =>
  import('../features/marketing/MarketingView').then((m) => ({ default: m.MarketingView }))
);

function parseHashLocation(): { route: AppRouteId; portalToken: string } {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const params = new URLSearchParams(queryPart ?? '');
  const portalToken = params.get('token') ?? '';
  if (pathPart === 'marketing') return { route: 'marketing', portalToken };
  const match = APP_NAVIGATION.find((n) => n.id === pathPart);
  return { route: match ? match.id : 'dashboard', portalToken };
}

const ViewLoadingFallback: React.FC = () => (
  <div className="space-y-4">
    <Skeleton className="h-9 w-56" />
    <Skeleton className="h-4 w-80" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
    </div>
  </div>
);

const SHORTCUT_ITEMS = [
  { keys: 'Ctrl / Cmd + K', desc: 'Open global Command Palette & search' },
  { keys: '?', desc: 'Open this Keyboard Shortcuts cheat sheet' },
  { keys: 'Esc', desc: 'Close active dialogs or exit Focus Mode' },
  { keys: 'Tab / Shift + Tab', desc: 'Navigate interactive workspace controls' },
];

const WorkspaceRouter: React.FC = () => {
  const initialHash = parseHashLocation();
  const [route, setRoute] = useState<AppRouteId>(initialHash.route);
  const [portalToken, setPortalToken] = useState<string>(initialHash.portalToken);
  const [commandOpen, setCommandOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [focusModeActive, setFocusModeActive] = useState(initialHash.route === 'focus-mode');
  const [focusTarget, setFocusTarget] = useState<{ type: 'project' | 'task'; id: string } | null>(
    null
  );
  const {
    loading,
    error,
    isOnline,
    syncStatus,
    pendingSyncCount,
    syncError,
    lastSyncedAt,
    retrySync,
    runningTimer,
    timerElapsedSeconds,
    stopGlobalTimer,
    settings,
    notifications,
    recordRecentItem,
  } = useWorkspace();
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  const exitFocusMode = useCallback(() => {
    setFocusModeActive(false);
    setRoute((prev) => {
      if (prev === 'focus-mode') {
        window.location.hash = '#/dashboard';
        return 'dashboard';
      }
      return prev;
    });
  }, []);

  const enterFocusMode = useCallback(
    (target?: { type: 'project' | 'task'; id: string }) => {
      if (target) {
        setFocusTarget(target);
      }
      setFocusModeActive(true);
    },
    []
  );

  useEffect(() => {
    const onHash = () => {
      const parsed = parseHashLocation();
      setRoute(parsed.route);
      setPortalToken(parsed.portalToken);
      if (parsed.route === 'focus-mode') {
        setFocusModeActive(true);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
        return;
      }
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (!isTyping && e.key === '?') {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }
      if (e.key === 'Escape') {
        if (shortcutsOpen) {
          setShortcutsOpen(false);
        } else if (focusModeActive && !commandOpen) {
          exitFocusMode();
        }
      }
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [commandOpen, exitFocusMode, focusModeActive, shortcutsOpen]);

  const navigate = (next: AppRouteId) => {
    setRoute(next);
    if (next === 'focus-mode') {
      setFocusModeActive(true);
    } else {
      setFocusModeActive(false);
    }
    window.location.hash = `#/${next}`;
    const navMeta = APP_NAVIGATION.find((n) => n.id === next);
    if (navMeta && next !== 'focus-mode') {
      void recordRecentItem({
        id: `route_${next}`,
        entityType: 'page',
        label: navMeta.label,
        route: next,
      });
    }
  };

  const unreadCount = notifications.filter(
    (n) => !n.read && (!n.snoozedUntil || n.snoozedUntil <= new Date().toISOString())
  ).length;
  const showOnboarding =
    !loading &&
    !onboardingDismissed &&
    settings !== null &&
    !settings.onboardingCompleted &&
    route !== 'marketing';

  const renderRouteContent = () => {
    if (error) {
      return (
        <Card>
          <CardHeader
            title="Workspace Storage Issue"
            description="IndexedDB could not be initialized cleanly."
          />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </Card>
      );
    }

    if (focusModeActive || route === 'focus-mode') {
      return (
        <FocusModeView
          initialTarget={focusTarget}
          onExitFocusMode={exitFocusMode}
          onNavigate={navigate}
        />
      );
    }

    switch (route) {
      case 'dashboard':
        return <DashboardView onNavigate={navigate} onEnterFocusMode={enterFocusMode} />;
      case 'activity':
        return <ActivityView />;
      case 'notifications':
        return <NotificationsView onNavigate={navigate} />;
      case 'clients':
        return <ClientsView />;
      case 'client-portal':
        return (
          <ClientPortalView
            initialToken={portalToken}
            standaloneTokenMode={route === 'client-portal' && portalToken.trim().length > 0}
          />
        );
      case 'projects':
        return (
          <ProjectsView
            onFocusProject={(id) => enterFocusMode({ type: 'project', id })}
          />
        );
      case 'tasks':
        return (
          <TasksView
            onFocusTask={(id) => enterFocusMode({ type: 'task', id })}
          />
        );
      case 'proposals':
        return <ProposalsView />;
      case 'quotations':
        return <QuotationsView onNavigate={navigate} />;
      case 'contracts':
        return <ContractsView />;
      case 'invoices':
        return <InvoicesView onNavigate={navigate} />;
      case 'payments':
        return <PaymentsView />;
      case 'vault':
        return <DocumentVaultView />;
      case 'income':
        return <FinanceView mode="income" />;
      case 'expenses':
        return <FinanceView mode="expenses" />;
      case 'profitability':
        return <FinanceView mode="profitability" />;
      case 'time-tracker':
        return <TimeTrackerView />;
      case 'communication':
        return <CommunicationHubView />;
      case 'reports':
        return <ReportsView />;
      case 'templates':
        return <TemplatesView />;
      case 'workflows':
        return <WorkflowsView onNavigate={navigate} />;
      case 'cloud-sync':
        return <CloudSyncView />;
      case 'search':
        return <GlobalSearchView onNavigate={navigate} />;
      case 'import-export':
        return <ImportExportView />;
      case 'settings-backup':
        return <BackupRestoreView />;
      case 'ai-copilot':
        return <AICopilotView onNavigate={navigate} />;
      case 'knowledge':
        return <KnowledgeHubView />;
      case 'security-center':
        return <SecurityCenterView />;
      case 'help-plans':
        return (
          <HelpPlansTourView
            onNavigate={navigate}
            onEnterFocusMode={() => enterFocusMode()}
          />
        );
      case 'settings-profile':
      case 'settings-appearance':
      case 'settings-localization':
      case 'settings-ai':
      case 'settings-privacy':
      case 'settings-cloud-sync':
      case 'about':
        return <SettingsView section={route} onNavigate={navigate} />;
      case 'marketing':
        return <MarketingView onNavigate={navigate} />;
      default:
        return <DashboardView onNavigate={navigate} onEnterFocusMode={enterFocusMode} />;
    }
  };

  // Security isolation: external share URLs (#/client-portal?token=...) never mount the admin AppShell,
  // workspace sidebar, command palette, or onboarding modal.
  const isIsolatedPortalSession = route === 'client-portal' && portalToken.trim().length > 0;
  if (isIsolatedPortalSession) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0B1220] text-slate-900 dark:text-slate-100">
        <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#101827] px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <span className="font-bold tracking-tight text-slate-900 dark:text-white">
              SOLODESK AI · Scoped Client Portal
            </span>
            <span className="text-xs font-mono text-slate-500">Isolated Read-Scoped Session</span>
          </div>
        </header>
        <main className="max-w-6xl mx-auto p-6">
          <Suspense fallback={<ViewLoadingFallback />}>
            <ClientPortalView initialToken={portalToken} standaloneTokenMode />
          </Suspense>
        </main>
      </div>
    );
  }

  return (
    <AppShell
      activeRoute={route}
      onNavigate={navigate}
      onOpenCommandPalette={() => setCommandOpen(true)}
      onOpenShortcuts={() => setShortcutsOpen(true)}
      focusModeActive={focusModeActive || route === 'focus-mode'}
      onToggleFocusMode={() =>
        focusModeActive || route === 'focus-mode' ? exitFocusMode() : enterFocusMode()
      }
      unreadNotifications={unreadCount}
      isOnline={isOnline}
      syncStatus={syncStatus}
      pendingSyncCount={pendingSyncCount}
      syncError={syncError}
      lastSyncedAt={lastSyncedAt}
      onRetrySync={() => void retrySync()}
      runningTimer={runningTimer}
      timerElapsedSeconds={timerElapsedSeconds}
      onStopGlobalTimer={() => void stopGlobalTimer()}
      headerRightExtra={<PWAInstallButton />}
    >
      <Suspense fallback={<ViewLoadingFallback />}>{renderRouteContent()}</Suspense>
      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        onNavigate={navigate}
      />
      <Dialog
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        title="Keyboard Shortcuts"
        description="Fast keyboard controls available across the SOLODESK AI workspace."
      >
        <div className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
          {SHORTCUT_ITEMS.map((item) => (
            <div key={item.keys} className="py-2.5 flex items-center justify-between gap-4">
              <span className="text-slate-700 dark:text-slate-200">{item.desc}</span>
              <kbd className="font-mono text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101827] text-slate-900 dark:text-white shrink-0">
                {item.keys}
              </kbd>
            </div>
          ))}
        </div>
      </Dialog>
      <OnboardingModal
        open={showOnboarding}
        onClose={() => setOnboardingDismissed(true)}
      />
    </AppShell>
  );
};

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <WorkspaceProvider>
            <WorkspaceRouter />
          </WorkspaceProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
