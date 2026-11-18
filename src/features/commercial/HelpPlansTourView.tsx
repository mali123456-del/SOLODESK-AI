import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Compass,
  Globe,
  HelpCircle,
  Keyboard,
  Palette,
  Send,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  PageHeader,
  Select,
  Tabs,
  Textarea,
  useToast,
} from '../../components/ui';
import { repositories } from '../../database/repositories/dexieRepositories';
import {
  LANGUAGE_PACKS,
  type SupportedLanguage,
} from '../../i18n/translations';
import { submitBackendSupportRequest } from '../../services/backendAuthClient';
import {
  evaluateUsageAgainstPlan,
  PAKISTAN_PAYMENT_GUIDANCE,
  PLAN_ENTITLEMENTS,
  type PlanTier,
} from '../../services/entitlementService';
import type { AppRouteId } from '../../types/navigation';

interface HelpPlansTourViewProps {
  onNavigate: (route: AppRouteId) => void;
  onEnterFocusMode: () => void;
}

const TOUR_STEPS: Array<{
  title: string;
  description: string;
  route: AppRouteId;
  actionLabel: string;
}> = [
  {
    title: '1. Daily Digest & Productivity Center',
    description:
      'Review today’s deadlines, overdue tasks, pending invoices, upcoming milestones, and enter distraction-free Focus Mode.',
    route: 'dashboard',
    actionLabel: 'Open Dashboard',
  },
  {
    title: '2. Clients & Scoped Client Portal',
    description:
      'Manage CRM records, issue expiring portal tokens with strict internal-note isolation, and capture new leads.',
    route: 'client-portal',
    actionLabel: 'Open Client Portal',
  },
  {
    title: '3. Projects, Gantt & Critical Path',
    description:
      'Track milestones, visualize Gantt timelines, guard against circular task dependencies, and inspect project health.',
    route: 'projects',
    actionLabel: 'Open Projects',
  },
  {
    title: '4. Multi-Currency Invoices & Forecasts',
    description:
      'Issue exact big.js multi-currency invoices, schedule recurring bills, manage retainers, and run informational cashflow scenarios.',
    route: 'reports',
    actionLabel: 'Open Reports',
  },
  {
    title: '5. Document Vault & Security Center',
    description:
      'Verify file magic bytes with SHA-256 versioning and run non-destructive AES-GCM backup recovery self-tests.',
    route: 'security-center',
    actionLabel: 'Open Security Center',
  },
  {
    title: '6. AI Copilot & Hybrid RAG Knowledge Hub',
    description:
      'Use Gemini BYOK, OpenAI-compatible, Ollama loopback, or offline drafts over your hybrid keyword + semantic knowledge base.',
    route: 'ai-copilot',
    actionLabel: 'Open AI Copilot',
  },
];

const HELP_FAQ = [
  {
    q: 'Where is my SOLODESK AI data stored?',
    a: 'All workspace data is stored locally inside your browser’s IndexedDB database (schema v5). There is no mandatory cloud server.',
  },
  {
    q: 'How do I protect against browser cache eviction?',
    a: 'Export an encrypted or plain JSON backup regularly from Backup & Restore, and verify integrity anytime in Security Center.',
  },
  {
    q: 'How does Focus Mode work?',
    a: 'Focus Mode hides sidebar navigation, mobile quick navigation, and notifications, surfacing one active task or project with an embedded live timer.',
  },
  {
    q: 'Are financial forecasts or AI estimates certified advice?',
    a: 'No. Reports, FX conversions, and What-If scenarios are informational estimates built from your local entries.',
  },
  {
    q: 'Does Client Portal expose my internal notes or margins?',
    a: 'No. Client Portal view models strictly exclude internal CRM notes, expense entries, and internal/confidential Vault files.',
  },
];

export const HelpPlansTourView: React.FC<HelpPlansTourViewProps> = ({
  onNavigate,
  onEnterFocusMode,
}) => {
  const { settings, clients, projects, vaultFiles, refresh } = useWorkspace();
  const { pushToast } = useToast();

  const [tab, setTab] = useState<'plans' | 'tour' | 'help' | 'localization'>('plans');
  const [faqQuery, setFaqQuery] = useState('');
  const [tourIdx, setTourIdx] = useState(0);
  const [supportCategory, setSupportCategory] = useState<
    'billing_upgrade' | 'payment_gateway' | 'technical_support' | 'enterprise'
  >('billing_upgrade');
  const [supportSubject, setSupportSubject] = useState('');
  const [supportDetails, setSupportDetails] = useState('');
  const [sendingSupport, setSendingSupport] = useState(false);

  const activeTier = (settings?.activePlanTier ?? 'free') as PlanTier;
  const activeProjectsCount = projects.filter(
    (p) => !p.isTemplate && p.status !== 'archived' && p.status !== 'completed'
  ).length;

  const usageEval = useMemo(
    () =>
      evaluateUsageAgainstPlan({
        tier: activeTier,
        clientCount: clients.length,
        activeProjectCount: activeProjectsCount,
        vaultFileCount: vaultFiles.length,
      }),
    [activeTier, clients.length, activeProjectsCount, vaultFiles.length]
  );

  const filteredFaq = useMemo(() => {
    const q = faqQuery.trim().toLowerCase();
    if (!q) return HELP_FAQ;
    return HELP_FAQ.filter((f) => `${f.q} ${f.a}`.toLowerCase().includes(q));
  }, [faqQuery]);

  const handleSelectPlan = async (tier: PlanTier) => {
    await repositories.saveSettings({ activePlanTier: tier });
    pushToast({
      title: `Active entitlement preview switched to ${PLAN_ENTITLEMENTS[tier].name}`,
      tone: 'info',
    });
    await refresh();
  };

  const handleCompleteTour = async () => {
    await repositories.saveSettings({ tourCompleted: true });
    pushToast({ title: 'Interactive product tour marked completed', tone: 'success' });
    await refresh();
  };

  const handleLanguageChange = async (lang: SupportedLanguage) => {
    const pack = LANGUAGE_PACKS[lang];
    await repositories.saveSettings({ language: lang, rtl: pack.rtl });
    pushToast({
      title: `Interface language set to ${pack.label}`,
      description: pack.rtl ? 'Document layout switched to RTL.' : 'Document layout set to LTR.',
      tone: 'success',
    });
    await refresh();
  };

  const handleAccentChange = async (accentColor: 'blue' | 'cyan' | 'emerald' | 'indigo' | 'amber') => {
    await repositories.saveSettings({ accentColor });
    pushToast({ title: `Accent theme set to ${accentColor}`, tone: 'info' });
    await refresh();
  };

  const handleSubmitSupport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportSubject.trim() || !supportDetails.trim()) return;
    setSendingSupport(true);
    try {
      const res = await submitBackendSupportRequest({
        workspaceId: 'local-workspace',
        category: supportCategory,
        subject: supportSubject.trim(),
        details: supportDetails.trim(),
      });
      await repositories.logActivity({
        entityType: 'settings',
        entityId: res.referenceId ?? 'local',
        action: 'inquiry',
        summary: `Support/Upgrade inquiry: ${supportSubject.trim()} (${res.message})`,
      });
      setSupportSubject('');
      setSupportDetails('');
      pushToast({
        title: res.ok ? 'Inquiry submitted to backend' : 'Inquiry saved locally',
        description: res.message,
        tone: res.ok ? 'success' : 'info',
      });
      await refresh();
    } finally {
      setSendingSupport(false);
    }
  };

  const currentStep = TOUR_STEPS[tourIdx];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Help, Product Tour, Localization & Plans"
        description="Explore interactive workspace walkthroughs, keyboard shortcuts, language/RTL settings, and local plan entitlement profiles."
        actions={
          <Button variant="outline" onClick={onEnterFocusMode}>
            Try Focus Mode
          </Button>
        }
      />

      <Tabs
        activeId={tab}
        onChange={(id) => setTab(id as typeof tab)}
        items={[
          { id: 'plans', label: 'Plans & Entitlements' },
          { id: 'tour', label: 'Interactive Product Tour' },
          { id: 'localization', label: 'Language, RTL & Theme' },
          { id: 'help', label: 'Help Center & Shortcuts' },
        ]}
      />

      {tab === 'plans' && (
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Current Workspace Usage vs Entitlement Profile"
              description="Local configuration preview only — no billing or payment gateway is connected in this static MVP."
              action={<Badge tone="info">{usageEval.spec.name}</Badge>}
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-500">Clients</p>
                <p className="text-lg font-bold font-mono tabular-nums mt-1">
                  {clients.length} / {usageEval.spec.maxClients ?? '∞'}
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-500">Active Projects</p>
                <p className="text-lg font-bold font-mono tabular-nums mt-1">
                  {activeProjectsCount} / {usageEval.spec.maxActiveProjects ?? '∞'}
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-500">Vault Files</p>
                <p className="text-lg font-bold font-mono tabular-nums mt-1">
                  {vaultFiles.length} / {usageEval.spec.maxVaultFiles ?? '∞'}
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-start gap-3 text-xs">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-slate-900 dark:text-white">
                    Automated Checkout Status:
                  </span>
                  <Badge tone="warning">BLOCKED — EXTERNAL REQUIREMENT</Badge>
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {PAKISTAN_PAYMENT_GUIDANCE.summary}
                </p>
                <p className="text-slate-500">
                  <strong>Recommended Pakistan & Exporter Payment Paths:</strong>{' '}
                  {PAKISTAN_PAYMENT_GUIDANCE.supportedLaunchPaths.join(' · ')}
                </p>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            {(Object.keys(PLAN_ENTITLEMENTS) as PlanTier[]).map((tier) => {
              const spec = PLAN_ENTITLEMENTS[tier];
              const isSelected = activeTier === tier;
              return (
                <Card
                  key={tier}
                  className={isSelected ? 'border-[#2563EB] dark:border-[#20C7D9]' : undefined}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="text-base font-bold">{spec.name}</h3>
                    {isSelected && <Badge tone="info">Active</Badge>}
                  </div>
                  <p className="text-sm font-mono font-semibold text-[#2563EB] dark:text-[#20C7D9] mb-1">
                    {spec.priceLabel}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 mb-2">
                    Seats: {spec.seatLimit ?? 'Unlimited'} · Clients: {spec.maxClients ?? 'Unlimited'}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mb-4 min-h-[48px]">
                    {spec.notes}
                  </p>
                  <Button
                    size="sm"
                    variant={isSelected ? 'primary' : 'outline'}
                    className="w-full"
                    onClick={() => void handleSelectPlan(tier)}
                  >
                    {isSelected ? 'Selected Profile' : 'Preview Profile'}
                  </Button>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader
              title="Support, Upgrade & Enterprise Inquiry"
              description="Submit a manual billing/gateway setup or support request without fake card forms."
            />
            <form onSubmit={handleSubmitSupport} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Select
                  label="Category"
                  value={supportCategory}
                  onChange={(e) => setSupportCategory(e.target.value as typeof supportCategory)}
                  options={[
                    { value: 'billing_upgrade', label: 'Manual Plan Upgrade' },
                    { value: 'payment_gateway', label: 'Pakistan Gateway Setup (PayFast / Safepay)' },
                    { value: 'enterprise', label: 'Enterprise VPC / SSO Inquiry' },
                    { value: 'technical_support', label: 'Technical Support' },
                  ]}
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Subject"
                    required
                    value={supportSubject}
                    onChange={(e) => setSupportSubject(e.target.value)}
                    placeholder="e.g., Request PayFast Pakistan manual invoice onboarding"
                  />
                </div>
              </div>
              <Textarea
                label="Details"
                required
                rows={3}
                value={supportDetails}
                onChange={(e) => setSupportDetails(e.target.value)}
                placeholder="Describe desired seats, payment rail, or workspace issue..."
              />
              <Button type="submit" size="sm" variant="primary" loading={sendingSupport} icon={<Send className="w-3.5 h-3.5" />}>
                Submit Support / Upgrade Request
              </Button>
            </form>
          </Card>
        </div>
      )}

      {tab === 'tour' && (
        <Card className="max-w-2xl">
          <CardHeader
            title="Interactive SOLODESK AI Product Tour"
            description={`Step ${tourIdx + 1} of ${TOUR_STEPS.length}${settings?.tourCompleted ? ' · Completed' : ''}`}
            action={<Compass className="w-5 h-5 text-[#2563EB]" />}
          />
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#101827] border border-slate-200 dark:border-slate-800 space-y-2">
              <h3 className="text-base font-semibold">{currentStep.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">{currentStep.description}</p>
              <Button size="sm" variant="outline" onClick={() => onNavigate(currentStep.route)}>
                {currentStep.actionLabel}
              </Button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                disabled={tourIdx === 0}
                onClick={() => setTourIdx((i) => Math.max(0, i - 1))}
              >
                Previous Step
              </Button>
              {tourIdx < TOUR_STEPS.length - 1 ? (
                <Button onClick={() => setTourIdx((i) => Math.min(TOUR_STEPS.length - 1, i + 1))}>
                  Next Step
                </Button>
              ) : (
                <Button variant="primary" onClick={() => void handleCompleteTour()}>
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  Finish Product Tour
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {tab === 'localization' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader
              title="Multi-Language & RTL Layout"
              description="Supports English, Urdu (RTL), Spanish, and Arabic (RTL) with live document direction sync."
              action={<Globe className="w-5 h-5 text-[#2563EB]" />}
            />
            <div className="space-y-3">
              <Select
                label="Workspace Language"
                value={settings?.language ?? 'en'}
                onChange={(e) => void handleLanguageChange(e.target.value as SupportedLanguage)}
                options={(Object.keys(LANGUAGE_PACKS) as SupportedLanguage[]).map((code) => ({
                  value: code,
                  label: `${LANGUAGE_PACKS[code].nativeLabel} — ${LANGUAGE_PACKS[code].label}`,
                }))}
              />
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(settings?.rtl)}
                  onChange={async (e) => {
                    await repositories.saveSettings({ rtl: e.target.checked });
                    await refresh();
                  }}
                />
                Force Right-to-Left (RTL) layout direction
              </label>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Accent Theme Customization"
              description="Choose your preferred workspace accent color."
              action={<Palette className="w-5 h-5 text-[#2563EB]" />}
            />
            <div className="flex flex-wrap gap-2">
              {(['blue', 'cyan', 'emerald', 'indigo', 'amber'] as const).map((color) => {
                const active = (settings?.accentColor ?? 'blue') === color;
                return (
                  <Button
                    key={color}
                    size="sm"
                    variant={active ? 'primary' : 'outline'}
                    onClick={() => void handleAccentChange(color)}
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    {color}
                  </Button>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {tab === 'help' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader
              title="Frequently Asked Questions"
              description="Search SOLODESK AI local-first guides."
              action={<HelpCircle className="w-5 h-5 text-[#2563EB]" />}
            />
            <div className="space-y-3">
              <Input
                placeholder="Search help articles..."
                value={faqQuery}
                onChange={(e) => setFaqQuery(e.target.value)}
              />
              {filteredFaq.map((item) => (
                <div
                  key={item.q}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1"
                >
                  <p className="text-sm font-semibold">{item.q}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{item.a}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Keyboard Shortcuts"
              description="Fast navigation across the workspace."
              action={<Keyboard className="w-5 h-5 text-[#2563EB]" />}
            />
            <div className="space-y-2 text-sm">
              {[
                { keys: 'Ctrl / Cmd + K', desc: 'Open Command Palette & Quick Search' },
                { keys: '?', desc: 'Open Keyboard Shortcuts Reference' },
                { keys: 'Esc', desc: 'Close active dialog or exit Focus Mode' },
              ].map((s) => (
                <div
                  key={s.keys}
                  className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800"
                >
                  <span className="text-slate-700 dark:text-slate-300">{s.desc}</span>
                  <kbd className="font-mono text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
