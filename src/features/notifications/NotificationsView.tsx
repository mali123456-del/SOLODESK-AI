import React, { useMemo } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { Badge, Button, Card, EmptyState, PageHeader } from '../../components/ui';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import { repositories } from '../../database/repositories/dexieRepositories';
import { formatDisplayDate, isDateOverdue, todayDateStr } from '../../domain/calculations/dates';
import { formatMoney } from '../../domain/calculations/money';
import type { AppRouteId } from '../../types/navigation';

interface NotificationsViewProps {
  onNavigate: (route: AppRouteId) => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({ onNavigate }) => {
  const { invoices, tasks, settings, notifications, clients, refresh } = useWorkspace();
  const today = todayDateStr();
  const dateFormat = settings?.dateFormat ?? 'DD MMM YYYY';

  const derivedAlerts = useMemo(() => {
    const list: Array<{
      id: string;
      title: string;
      message: string;
      severity: 'warning' | 'danger' | 'info';
      route: AppRouteId;
    }> = [];

    invoices
      .filter((i) => i.status !== 'cancelled' && i.balanceDue > 0 && isDateOverdue(i.dueDate, today))
      .forEach((inv) => {
        list.push({
          id: `overdue_inv_${inv.id}`,
          title: `Overdue Invoice ${inv.number}`,
          message: `Balance of ${formatMoney(inv.balanceDue, inv.currency)} was due on ${formatDisplayDate(inv.dueDate, dateFormat)}.`,
          severity: 'danger',
          route: 'invoices',
        });
      });

    tasks
      .filter((t) => t.status !== 'done' && t.status !== 'archived' && isDateOverdue(t.dueDate, today))
      .forEach((t) => {
        list.push({
          id: `overdue_tsk_${t.id}`,
          title: `Overdue Task: ${t.title}`,
          message: `Due ${formatDisplayDate(t.dueDate, dateFormat)}.`,
          severity: 'warning',
          route: 'tasks',
        });
      });

    if (clients.length > 0 && !settings?.lastBackupAt) {
      list.push({
        id: 'backup_reminder',
        title: 'Create your first JSON backup',
        message:
          'Browser IndexedDB storage can be cleared by OS cleanup or browser resets. Download a backup from Settings.',
        severity: 'info',
        route: 'settings-backup',
      });
    }

    return list;
  }, [invoices, tasks, clients.length, settings?.lastBackupAt, today, dateFormat]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Live workspace reminders for overdue invoices, overdue tasks, and backups."
        actions={
          notifications.some((n) => !n.read) ? (
            <Button
              variant="outline"
              onClick={async () => {
                await repositories.markAllNotificationsRead();
                await refresh();
              }}
              icon={<CheckCheck className="w-4 h-4" />}
            >
              Mark All Read
            </Button>
          ) : undefined
        }
      />

      {derivedAlerts.length === 0 && notifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="w-5 h-5" />}
          title="All caught up"
          description="No overdue invoices, overdue tasks, or unread alerts right now."
        />
      ) : (
        <div className="space-y-3">
          {derivedAlerts.map((alert) => (
            <Card key={alert.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge tone={alert.severity}>{alert.severity}</Badge>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{alert.title}</p>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{alert.message}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => onNavigate(alert.route)}>
                Open
              </Button>
            </Card>
          ))}

          {notifications.map((n) => (
            <Card key={n.id} className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{n.title}</p>
                <p className="text-xs text-slate-500">{n.message}</p>
              </div>
              {!n.read && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await repositories.markNotificationRead(n.id);
                    await refresh();
                  }}
                >
                  Dismiss
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
