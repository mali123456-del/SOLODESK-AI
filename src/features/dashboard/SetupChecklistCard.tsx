import React, { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Circle, X } from 'lucide-react';
import { Button, Card, CardHeader } from '../../components/ui';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import { repositories } from '../../database/repositories/dexieRepositories';
import type { AppRouteId } from '../../types/navigation';

interface SetupChecklistCardProps {
  onNavigate: (route: AppRouteId) => void;
}

interface ChecklistStep {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  route: AppRouteId;
}

export const SetupChecklistCard: React.FC<SetupChecklistCardProps> = ({ onNavigate }) => {
  const {
    businessProfile,
    clients,
    projects,
    tasks,
    quotations,
    invoices,
    settings,
    refresh,
  } = useWorkspace();
  const [dismissing, setDismissing] = useState(false);

  const steps: ChecklistStep[] = useMemo(
    () => [
      {
        id: 'profile',
        label: 'Configure Business Profile',
        detail: 'Set business name, email, and invoice payment instructions.',
        done: Boolean(
          (businessProfile?.businessName &&
            businessProfile.businessName.trim() !== 'My Freelance Studio') ||
            businessProfile?.email?.trim()
        ),
        route: 'settings-profile',
      },
      {
        id: 'client',
        label: 'Add First Client',
        detail: 'Create a client record in the CRM directory.',
        done: clients.length > 0,
        route: 'clients',
      },
      {
        id: 'delivery',
        label: 'Create Project or Task',
        detail: 'Track deliverables, milestones, or daily tasks.',
        done: projects.length > 0 || tasks.length > 0,
        route: 'projects',
      },
      {
        id: 'billing',
        label: 'Draft Quotation or Invoice',
        detail: 'Issue a priced quotation or invoice with line items.',
        done: quotations.length > 0 || invoices.length > 0,
        route: 'invoices',
      },
      {
        id: 'backup',
        label: 'Verify Offline JSON Backup',
        detail: 'Create or verify an encrypted backup snapshot.',
        done: Boolean(settings?.lastBackupAt),
        route: 'settings-backup',
      },
    ],
    [businessProfile, clients.length, projects.length, tasks.length, quotations.length, invoices.length, settings?.lastBackupAt]
  );

  if (settings?.dismissedSetupChecklist) {
    return null;
  }

  const completedCount = steps.filter((s) => s.done).length;
  const percent = Math.round((completedCount / steps.length) * 100);

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      await repositories.saveSettings({ dismissedSetupChecklist: true });
      await refresh();
    } finally {
      setDismissing(false);
    }
  };

  return (
    <Card aria-label="Workspace Setup Checklist">
      <CardHeader
        title="Workspace Setup Checklist"
        description={`${completedCount} of ${steps.length} milestones complete (${percent}%) · Dismiss anytime without losing data.`}
        action={
          <Button
            size="sm"
            variant="ghost"
            loading={dismissing}
            onClick={() => void handleDismiss()}
            aria-label="Dismiss setup checklist"
          >
            <X className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
            Dismiss
          </Button>
        }
      />
      <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mb-3">
        <div
          className="h-full bg-[#2563EB] transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5 text-xs">
        {steps.map((step) => (
          <button
            key={step.id}
            type="button"
            onClick={() => onNavigate(step.route)}
            className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-[#101827] text-left cursor-pointer flex flex-col justify-between gap-2 transition-colors"
          >
            <div className="flex items-start gap-2">
              {step.done ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
              ) : (
                <Circle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p
                  className={`font-semibold ${
                    step.done
                      ? 'text-slate-500 dark:text-slate-400 line-through'
                      : 'text-slate-900 dark:text-white'
                  }`}
                >
                  {step.label}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{step.detail}</p>
              </div>
            </div>
            {!step.done && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#2563EB] dark:text-[#20C7D9]">
                Open <ArrowRight className="w-3 h-3" aria-hidden="true" />
              </span>
            )}
          </button>
        ))}
      </div>
    </Card>
  );
};
