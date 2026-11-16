import React, { useState } from 'react';
import { Briefcase, CheckCircle2, Database, Sparkles } from 'lucide-react';
import { Button, Dialog, Input, Select, useToast } from '../../components/ui';
import { SUPPORTED_CURRENCIES } from '../../domain/calculations/money';
import { repositories } from '../../database/repositories/dexieRepositories';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import type { DateFormatPreference } from '../../domain/calculations/dates';

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ open, onClose }) => {
  const { businessProfile, settings, refresh, loadDemoWorkspace } = useWorkspace();
  const { pushToast } = useToast();

  const [businessName, setBusinessName] = useState(
    businessProfile?.businessName && businessProfile.businessName !== 'My Freelance Studio'
      ? businessProfile.businessName
      : ''
  );
  const [ownerName, setOwnerName] = useState(businessProfile?.ownerName ?? '');
  const [currency, setCurrency] = useState(settings?.defaultCurrency ?? 'USD');
  const [dateFormat, setDateFormat] = useState<DateFormatPreference>(
    settings?.dateFormat ?? 'DD MMM YYYY'
  );
  const [withDemo, setWithDemo] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await repositories.saveBusinessProfile({
        businessName: businessName.trim() || 'My Freelance Studio',
        ownerName: ownerName.trim(),
      });
      await repositories.saveSettings({
        defaultCurrency: currency,
        dateFormat,
        onboardingCompleted: true,
      });
      if (withDemo) {
        await loadDemoWorkspace();
      } else {
        await refresh();
      }
      pushToast({
        tone: 'success',
        title: 'Workspace ready',
        description: withDemo
          ? 'Sample demo records loaded. You can clear them anytime from Settings.'
          : 'Clean workspace initialized.',
      });
      onClose();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Setup failed',
        description: err instanceof Error ? err.message : 'Unable to save workspace preferences.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    await repositories.saveSettings({ onboardingCompleted: true });
    await refresh();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={() => void handleSkip()}
      title="Welcome to SOLODESK AI"
      description="Your local-first freelancer business workspace. Configure your defaults in 30 seconds."
      size="md"
    >
      <form onSubmit={handleFinish} className="space-y-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#101827] p-3.5 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2.5">
          <Database className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" aria-hidden="true" />
          <p className="leading-relaxed">
            All clients, projects, invoices, and financial logs are stored privately in your browser&apos;s
            IndexedDB. No account is required, and core workflows run 100% offline. Use JSON Backup
            regularly to safeguard your records.
          </p>
        </div>

        <Input
          label="Business or Studio Name"
          placeholder="e.g. Studio North, Ali Digital Consulting"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
        />

        <Input
          label="Your Name"
          placeholder="e.g. Muhammad Sulaiman"
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Default Currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            options={SUPPORTED_CURRENCIES.map((c) => ({
              value: c.code,
              label: `${c.code} — ${c.name}`,
            }))}
          />

          <Select
            label="Date Format"
            value={dateFormat}
            onChange={(e) => setDateFormat(e.target.value as DateFormatPreference)}
            options={[
              { value: 'DD MMM YYYY', label: '15 Nov 2026' },
              { value: 'YYYY-MM-DD', label: '2026-11-15' },
              { value: 'DD/MM/YYYY', label: '15/11/2026' },
              { value: 'MM/DD/YYYY', label: '11/15/2026' },
            ]}
          />
        </div>

        <div className="space-y-2 pt-1">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Initial Workspace</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setWithDemo(true)}
              className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                withDemo
                  ? 'border-[#2563EB] bg-blue-50/70 dark:bg-blue-950/30'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                <Sparkles className="w-4 h-4 text-[#2563EB]" aria-hidden="true" />
                <span>Load Sample Demo Data</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Includes clearly labelled [Demo] clients, projects, quotes, and invoices.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setWithDemo(false)}
              className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                !withDemo
                  ? 'border-[#2563EB] bg-blue-50/70 dark:bg-blue-950/30'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                <Briefcase className="w-4 h-4 text-slate-600 dark:text-slate-300" aria-hidden="true" />
                <span>Start Empty</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Begin immediately with zero sample records.
              </p>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
          <Button variant="ghost" onClick={() => void handleSkip()} disabled={saving}>
            Skip for now
          </Button>
          <Button type="submit" loading={saving} icon={<CheckCircle2 className="w-4 h-4" />}>
            Launch Workspace
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
