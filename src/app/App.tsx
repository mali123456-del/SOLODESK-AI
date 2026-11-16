import React, { Suspense, lazy, useEffect, useState } from 'react';
import { AppShell } from './layouts/AppShell';
import { ErrorBoundary } from './error-boundary/ErrorBoundary';
import { ThemeProvider } from './providers/ThemeProvider';
import { WorkspaceProvider, useWorkspace } from './providers/WorkspaceProvider';
import { Card, CardHeader, Skeleton, ToastProvider } from '../components/ui';
import { APP_NAVIGATION, type AppRouteId } from '../types/navigation';
import { OnboardingModal } from '../features/onboarding/OnboardingModal';
import { CommandPalette } from '../components/common/CommandPalette';
import { PWAInstallButton } from '../pwa/PWAInstallButton';

const DashboardView = lazy(() =>
  import('../features/dashboard/DashboardView').then((m) => ({ default: m.DashboardView }))
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
const MarketingView = lazy(() =>
  import('../features/marketing/MarketingView').then((m) => ({ default: m.MarketingView }))
);

function readRouteFromHash(): AppRouteId {
  const raw = window.location.hash.replace(/^#\/?/, '');
  if (raw === 'marketing') return 'marketing';
  const match = APP_NAVIGATION.find((n) => n.id === raw);
  return match ? match.id : 'dashboard';
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

const WorkspaceRouter: React.FC = () => {
  const [route, setRoute] = useState<AppRouteId>(readRouteFromHash);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [commandOpen, setCommandOpen] = useState(false);
  const { loading, error, settings, notifications } = useWorkspace();
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  useEffect(() => {
    const onHash = () => setRoute(readRouteFromHash());
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const navigate = (next: AppRouteId) => {
    setRoute(next);
    window.location.hash = `#/${next}`;
  };

  const unreadCount = notifications.filter((n) => !n.read).length;
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

    switch (route) {
      case 'dashboard':
        return <DashboardView onNavigate={navigate} />;
      case 'activity':
        return <ActivityView />;
      case 'notifications':
        return <NotificationsView onNavigate={navigate} />;
      case 'clients':
        return <ClientsView />;
      case 'projects':
        return <ProjectsView />;
      case 'tasks':
        return <TasksView />;
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
      case 'income':
        return <FinanceView mode="income" />;
      case 'expenses':
        return <FinanceView mode="expenses" />;
      case 'profitability':
        return <FinanceView mode="profitability" />;
      case 'time-tracker':
        return <TimeTrackerView />;
      case 'reports':
        return <ReportsView />;
      case 'templates':
        return <TemplatesView />;
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
      case 'settings-profile':
      case 'settings-appearance':
      case 'settings-localization':
      case 'settings-ai':
      case 'settings-privacy':
      case 'about':
        return <SettingsView section={route} onNavigate={navigate} />;
      case 'marketing':
        return <MarketingView onNavigate={navigate} />;
      default:
        return <DashboardView onNavigate={navigate} />;
    }
  };

  return (
    <AppShell
      activeRoute={route}
      onNavigate={navigate}
      onOpenCommandPalette={() => setCommandOpen(true)}
      unreadNotifications={unreadCount}
      isOnline={isOnline}
      headerRightExtra={<PWAInstallButton />}
    >
      <Suspense fallback={<ViewLoadingFallback />}>{renderRouteContent()}</Suspense>
      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        onNavigate={navigate}
      />
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
