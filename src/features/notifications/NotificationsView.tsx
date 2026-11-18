import React, { useMemo } from 'react';
import { Bell, CheckCheck, Clock } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, useToast } from '../../components/ui';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import { repositories } from '../../database/repositories/dexieRepositories';
import {
  addDaysToDateStr,
  formatDisplayDate,
  isDateOverdue,
  todayDateStr,
} from '../../domain/calculations/dates';
import { formatMoney } from '../../domain/calculations/money';
import type { AppRouteId } from '../../types/navigation';

interface NotificationsViewProps {
  onNavigate: (route: AppRouteId) => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({ onNavigate }) => {
  const { invoices, tasks, settings, notifications, clients, refresh } = useWorkspace();
  const { pushToast } = useToast();
  const today = todayDateStr();
  const dateFormat = settings?.dateFormat ?? 'DD MMM YYYY';
  const prefs = settings?.notificationPrefs ?? {
    invoiceReminders: true,
    taskDeadlines: true,
    appointmentReminders: true,
    digestHour: 9,
    snoozedIds: {},
  };

  const derivedAlerts = useMemo(() => {
    const list: Array<{
      id: string;
      title: string;
      message: string;
      severity: 'warning' | 'danger' | 'info';
      route: AppRouteId;
    }> = [];

    if (prefs.invoiceReminders) {
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
    }

    if (prefs.taskDeadlines) {
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
    }

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

    return list.filter((item) => {
      const snoozedUntil = prefs.snoozedIds?.[item.id];
      return !snoozedUntil || snoozedUntil <= today;
    });
  }, [invoices, tasks, clients.length, settings?.lastBackupAt, today, dateFormat, prefs]);

  const visibleNotifications = useMemo(
    () => notifications.filter((n) => !n.snoozedUntil || n.snoozedUntil <= today),
    [notifications, today]
  );

  const handleSnoozeDerived = async (alertId: string, days: number) => {
    const until = addDaysToDateStr(today, days);
    await repositories.saveSettings({
      notificationPrefs: {
        ...prefs,
        snoozedIds: { ...(prefs.snoozedIds ?? {}), [alertId]: until },
      },
    });
    pushToast({ title: `Snoozed alert until ${until}`, tone: 'info' });
    await refresh();
  };

  const handleTogglePref = async (key: 'invoiceReminders' | 'taskDeadlines' | 'appointmentReminders') => {
    await repositories.saveSettings({
      notificationPrefs: {
        ...prefs,
        [key]: !prefs[key],
      },
    });
    await refresh();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Live workspace reminders with per-alert snooze controls and notification preferences."
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

      <Card padding="sm">
        <CardHeader
          title="Notification Preferences"
          description="Choose which live reminder streams surface in your workspace."
        />
        <div className="flex flex-wrap gap-4 text-xs">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.invoiceReminders}
              onChange={() => void handleTogglePref('invoiceReminders')}
            />
            Overdue invoice alerts
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.taskDeadlines}
              onChange={() => void handleTogglePref('taskDeadlines')}
            />
            Task deadline alerts
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.appointmentReminders}
              onChange={() => void handleTogglePref('appointmentReminders')}
            />
            Appointment reminders
          </label>
        </div>
      </Card>

      {derivedAlerts.length === 0 && visibleNotifications.length === 0 ? (
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
              <div className="flex items-center gap-1.5 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => void handleSnoozeDerived(alert.id, 1)}>
                  <Clock className="w-3.5 h-3.5 mr-1" />
                  1d
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void handleSnoozeDerived(alert.id, 7)}>
                  7d
                </Button>
                <Button size="sm" variant="outline" onClick={() => onNavigate(alert.route)}>
                  Open
                </Button>
              </div>
            </Card>
          ))}

          {visibleNotifications.map((n) => (
            <Card key={n.id} className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{n.title}</p>
                <p className="text-xs text-slate-500">{n.message}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await repositories.snoozeNotification(n.id, addDaysToDateStr(today, 1));
                    await refresh();
                  }}
                >
                  Snooze 1d
                </Button>
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
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
