import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Cloud,
  Database,
  Globe,
  KeyRound,
  Moon,
  RefreshCw,
  Shield,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-react';
import { useTheme, type ThemePreference } from '../../app/providers/ThemeProvider';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import { requestPersistentBrowserStorage } from '../../database/db';
import { repositories } from '../../database/repositories/dexieRepositories';
import { getActiveWorkspaceDatabase } from '../../database/workspaceManager';
import { runDatabaseHealthCheck, type DatabaseHealthReport } from '../../observability/healthCheck';
import { SYNC_LIFECYCLE_LABELS } from '../../services/cloudSyncService';
import type { DateFormatPreference } from '../../domain/calculations/dates';
import { SUPPORTED_CURRENCIES } from '../../domain/calculations/money';
import {
  clearSessionGeminiKey,
  clearSessionOpenAIConfig,
  createAIProvider,
  getSessionGeminiKey,
  getSessionOllamaConfig,
  getSessionOpenAIConfig,
  hasSessionGeminiKey,
  maskApiKey,
  setSessionGeminiKey,
  setSessionOllamaConfig,
  setSessionOpenAIConfig,
} from '../../ai/providers/providerFactory';
import type { AIProviderId } from '../../ai/providers/AIProvider';
import { LANGUAGE_PACKS, type SupportedLanguage } from '../../i18n/translations';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  Input,
  PageHeader,
  Select,
  Textarea,
  useToast,
} from '../../components/ui';
import type { AppRouteId } from '../../types/navigation';

interface SettingsViewProps {
  section:
    | 'settings-profile'
    | 'settings-appearance'
    | 'settings-localization'
    | 'settings-ai'
    | 'settings-privacy'
    | 'settings-cloud-sync'
    | 'about';
  onNavigate: (route: AppRouteId) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ section, onNavigate }) => {
  const {
    businessProfile,
    settings,
    storageHealth,
    isOnline,
    syncStatus,
    syncLifecycleStatus,
    pendingSyncCount,
    lastSyncedAt,
    syncError,
    autoSyncEnabled,
    syncPaused,
    syncQueue,
    retrySync,
    setAutoSyncEnabled,
    setSyncPaused,
    refresh,
    loadDemoWorkspace,
    removeDemoWorkspace,
  } = useWorkspace();
  const { preference, setPreference } = useTheme();
  const { pushToast } = useToast();

  // Business Profile state
  const [businessName, setBusinessName] = useState(businessProfile?.businessName ?? '');
  const [ownerName, setOwnerName] = useState(businessProfile?.ownerName ?? '');
  const [email, setEmail] = useState(businessProfile?.email ?? '');
  const [phone, setPhone] = useState(businessProfile?.phone ?? '');
  const [website, setWebsite] = useState(businessProfile?.website ?? '');
  const [address, setAddress] = useState(businessProfile?.address ?? '');
  const [taxIdLabel, setTaxIdLabel] = useState(businessProfile?.taxIdLabel ?? '');
  const [invoiceFooterNote, setInvoiceFooterNote] = useState(
    businessProfile?.invoiceFooterNote ?? ''
  );
  const [paymentInstructions, setPaymentInstructions] = useState(
    businessProfile?.paymentInstructions ?? ''
  );

  // Localization state
  const [defaultCurrency, setDefaultCurrency] = useState(settings?.defaultCurrency ?? 'USD');
  const [dateFormat, setDateFormat] = useState<DateFormatPreference>(
    settings?.dateFormat ?? 'DD MMM YYYY'
  );
  const [invoicePrefix, setInvoicePrefix] = useState(settings?.invoicePrefix ?? 'INV-');
  const [quotationPrefix, setQuotationPrefix] = useState(settings?.quotationPrefix ?? 'QUO-');
  const [proposalPrefix, setProposalPrefix] = useState(settings?.proposalPrefix ?? 'PRP-');
  const [contractPrefix, setContractPrefix] = useState(settings?.contractPrefix ?? 'CTR-');
  const [defaultTaxRate, setDefaultTaxRate] = useState(String(settings?.defaultTaxRate ?? 0));
  const [defaultHourlyRate, setDefaultHourlyRate] = useState(
    String(settings?.defaultHourlyRate ?? 50)
  );
  const [language, setLanguage] = useState<SupportedLanguage>(settings?.language ?? 'en');
  const [rtl, setRtl] = useState<boolean>(settings?.rtl ?? false);
  const [fxRatesText, setFxRatesText] = useState<string>(() =>
    JSON.stringify(
      settings?.fxRates ?? { USD: 1, EUR: 0.92, GBP: 0.79, PKR: 278.5, CAD: 1.36, AUD: 1.52, AED: 3.67 },
      null,
      0
    )
  );

  // AI settings state (all secrets held strictly in JS tab memory)
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasKey, setHasKey] = useState(() => hasSessionGeminiKey());
  const [providerTestTarget, setProviderTestTarget] = useState<'auto' | AIProviderId>('auto');
  const [openAiBaseUrl, setOpenAiBaseUrl] = useState(() => getSessionOpenAIConfig().baseUrl);
  const [openAiModelId, setOpenAiModelId] = useState(() => getSessionOpenAIConfig().modelId);
  const [openAiKeyInput, setOpenAiKeyInput] = useState('');
  const [hasOpenAiKey, setHasOpenAiKey] = useState(() => Boolean(getSessionOpenAIConfig().apiKey));
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(() => getSessionOllamaConfig().baseUrl);
  const [ollamaModelId, setOllamaModelId] = useState(() => getSessionOllamaConfig().modelId);
  const [ollamaEnabled, setOllamaEnabled] = useState(() => getSessionOllamaConfig().enabled);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Save/Reset & Health diagnostics state
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingLocalization, setSavingLocalization] = useState(false);
  const [savingReset, setSavingReset] = useState(false);
  const [confirmResetAll, setConfirmResetAll] = useState(false);
  const [healthReport, setHealthReport] = useState<DatabaseHealthReport | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const handleRunHealthCheck = async () => {
    setCheckingHealth(true);
    try {
      const report = await runDatabaseHealthCheck();
      setHealthReport(report);
    } finally {
      setCheckingHealth(false);
    }
  };

  useEffect(() => {
    if (section === 'settings-privacy') {
      void handleRunHealthCheck();
    }
  }, [section]);

  useEffect(() => {
    if (businessProfile) {
      setBusinessName(businessProfile.businessName);
      setOwnerName(businessProfile.ownerName);
      setEmail(businessProfile.email);
      setPhone(businessProfile.phone);
      setWebsite(businessProfile.website);
      setAddress(businessProfile.address);
      setTaxIdLabel(businessProfile.taxIdLabel);
      setInvoiceFooterNote(businessProfile.invoiceFooterNote);
      setPaymentInstructions(businessProfile.paymentInstructions);
    }
  }, [businessProfile]);

  useEffect(() => {
    if (settings) {
      setDefaultCurrency(settings.defaultCurrency);
      setDateFormat(settings.dateFormat);
      setInvoicePrefix(settings.invoicePrefix);
      setQuotationPrefix(settings.quotationPrefix);
      setProposalPrefix(settings.proposalPrefix);
      setContractPrefix(settings.contractPrefix);
      setDefaultTaxRate(String(settings.defaultTaxRate));
      setDefaultHourlyRate(String(settings.defaultHourlyRate));
      setLanguage((settings.language as SupportedLanguage) ?? 'en');
      setRtl(Boolean(settings.rtl));
      if (settings.fxRates) {
        setFxRatesText(JSON.stringify(settings.fxRates));
      }
    }
  }, [settings]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await repositories.saveBusinessProfile({
        businessName: businessName.trim() || 'Solo Studio',
        ownerName: ownerName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        website: website.trim(),
        address: address.trim(),
        taxIdLabel: taxIdLabel.trim(),
        invoiceFooterNote: invoiceFooterNote.trim(),
        paymentInstructions: paymentInstructions.trim(),
      });
      await refresh();
      pushToast({
        tone: 'success',
        title: 'Business profile saved',
        description: 'PDF invoices, proposals, and quotations will reflect these details.',
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Invalid business profile values.',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveLocalization = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLocalization(true);
    try {
      let parsedFx = settings?.fxRates;
      if (fxRatesText.trim()) {
        const raw = JSON.parse(fxRatesText) as Record<string, unknown>;
        const cleaned: Record<string, number> = {};
        for (const [k, v] of Object.entries(raw)) {
          const num = Number(v);
          if (Number.isFinite(num) && num > 0) {
            cleaned[k.toUpperCase()] = num;
          }
        }
        if (Object.keys(cleaned).length > 0) parsedFx = cleaned;
      }

      await repositories.saveSettings({
        defaultCurrency,
        dateFormat,
        invoicePrefix: invoicePrefix.trim() || 'INV-',
        quotationPrefix: quotationPrefix.trim() || 'QUO-',
        proposalPrefix: proposalPrefix.trim() || 'PRP-',
        contractPrefix: contractPrefix.trim() || 'CTR-',
        defaultTaxRate: Math.max(0, Math.min(100, Number(defaultTaxRate) || 0)),
        defaultHourlyRate: Math.max(0, Number(defaultHourlyRate) || 0),
        language,
        rtl,
        fxRates: parsedFx,
      });
      await refresh();
      pushToast({
        tone: 'success',
        title: 'Localization & FX defaults saved',
        description: `Currency ${defaultCurrency}, Language ${language.toUpperCase()}, Direction ${rtl ? 'RTL' : 'LTR'}.`,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Could not update settings',
        description: err instanceof Error ? err.message : 'Invalid input or FX JSON.',
      });
    } finally {
      setSavingLocalization(false);
    }
  };

  const handleThemeChange = async (next: ThemePreference) => {
    setPreference(next);
    await repositories.saveSettings({ theme: next });
    await refresh();
    pushToast({
      tone: 'success',
      title: 'Theme updated',
      description: `Appearance preference set to ${next}.`,
    });
  };

  const handleAccentChange = async (
    next: 'blue' | 'cyan' | 'emerald' | 'indigo' | 'amber'
  ) => {
    await repositories.saveSettings({ accentColor: next });
    await refresh();
    pushToast({
      tone: 'success',
      title: 'Accent color updated',
      description: `Workspace accent preference set to ${next}.`,
    });
  };

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;
    setSessionGeminiKey(apiKeyInput);
    setApiKeyInput('');
    setHasKey(hasSessionGeminiKey());
    setTestResult(null);
    pushToast({
      tone: 'success',
      title: 'Session Gemini key updated',
      description: 'Held strictly in browser JS memory for this tab session.',
    });
  };

  const handleSaveOpenAiMemory = (e: React.FormEvent) => {
    e.preventDefault();
    setSessionOpenAIConfig({
      baseUrl: openAiBaseUrl,
      modelId: openAiModelId,
      ...(openAiKeyInput.trim() ? { apiKey: openAiKeyInput } : {}),
    });
    setOpenAiKeyInput('');
    setHasOpenAiKey(Boolean(getSessionOpenAIConfig().apiKey));
    setTestResult(null);
    pushToast({
      tone: 'success',
      title: 'OpenAI-compatible config saved in memory',
      description: 'Never stored on disk or exported.',
    });
  };

  const handleSaveOllamaMemory = (e: React.FormEvent) => {
    e.preventDefault();
    setSessionOllamaConfig({
      baseUrl: ollamaBaseUrl,
      modelId: ollamaModelId,
      enabled: ollamaEnabled,
    });
    setTestResult(null);
    pushToast({
      tone: 'success',
      title: 'Local Ollama endpoint updated',
      description: ollamaEnabled ? `Enabled for ${ollamaBaseUrl}` : 'Saved (disabled).',
    });
  };

  const handleTestKey = async () => {
    setTestingConnection(true);
    try {
      const provider = createAIProvider(providerTestTarget);
      const res = await provider.testConnection();
      setTestResult(res);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleRequestPersistence = async () => {
    const granted = await requestPersistentBrowserStorage();
    await refresh();
    pushToast({
      tone: granted ? 'success' : 'info',
      title: granted ? 'Persistent storage enabled' : 'Storage persistence requested',
      description: granted
        ? 'Your browser marked SOLODESK AI IndexedDB storage as persistent.'
        : 'Browser policy kept standard eviction rules—export regular JSON backups.',
    });
  };

  const handleFactoryReset = async () => {
    setSavingReset(true);
    try {
      const targetDb = getActiveWorkspaceDatabase();
      await targetDb.transaction('rw', targetDb.tables, async () => {
        await Promise.all(targetDb.tables.map((t) => t.clear()));
      });
      clearSessionGeminiKey();
      setHasKey(false);
      await refresh();
      setConfirmResetAll(false);
      pushToast({
        tone: 'success',
        title: 'Local workspace cleared',
        description: 'All local browser records were removed.',
      });
    } finally {
      setSavingReset(false);
    }
  };

  const navTabs: Array<{ id: SettingsViewProps['section']; label: string }> = [
    { id: 'settings-profile', label: 'Business Profile' },
    { id: 'settings-appearance', label: 'Appearance' },
    { id: 'settings-localization', label: 'Currency & Dates' },
    { id: 'settings-ai', label: 'AI (Gemini 4 Hydrogen)' },
    { id: 'settings-privacy', label: 'Privacy & Storage' },
    { id: 'settings-cloud-sync', label: 'Cloud Sync' },
    { id: 'about', label: 'About' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={navTabs.find((t) => t.id === section)?.label ?? 'Settings'}
        description="Configure your local-first SOLODESK AI workspace, branding, defaults, and privacy controls."
        actions={
          <Button variant="outline" onClick={() => onNavigate('settings-backup')}>
            Open Backup & Restore
          </Button>
        }
      />

      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-3">
        {navTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onNavigate(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              section === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-[#172338] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {section === 'settings-profile' && (
        <Card>
          <CardHeader
            title="Business Identity & PDF Defaults"
            description="Displayed on exported Proposals, Quotations, Contracts, and Invoices."
          />
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Studio / Business Name"
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
              />
              <Input
                label="Your Name"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
              />
              <Input
                label="Business Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                label="Phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <Input
                label="Website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
              <Input
                label="Tax / Registration ID Label (Optional)"
                placeholder="e.g., NTN / VAT / EIN"
                value={taxIdLabel}
                onChange={(e) => setTaxIdLabel(e.target.value)}
              />
            </div>

            <Textarea
              label="Business Address"
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <Textarea
              label="Default Payment Instructions"
              rows={2}
              placeholder="Bank IBAN, SWIFT, wallet handle, or wire note..."
              value={paymentInstructions}
              onChange={(e) => setPaymentInstructions(e.target.value)}
            />
            <Textarea
              label="Default Invoice Footer Note"
              rows={2}
              value={invoiceFooterNote}
              onChange={(e) => setInvoiceFooterNote(e.target.value)}
            />

            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={savingProfile}>
                Save Business Profile
              </Button>
            </div>
          </form>
        </Card>
      )}

      {section === 'settings-appearance' && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Theme & Display"
              description="Choose a comfortable high-contrast theme for extended client work."
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(
                [
                  { id: 'light', title: 'Light Mode', desc: 'Crisp alabaster canvas & slate borders', icon: <Sun className="w-5 h-5" /> },
                  { id: 'dark', title: 'Dark Mode', desc: 'Deep navy surfaces for low-light focus', icon: <Moon className="w-5 h-5" /> },
                  { id: 'system', title: 'Match System', desc: 'Automatically follows OS theme preference', icon: <Globe className="w-5 h-5" /> },
                ] as Array<{ id: ThemePreference; title: string; desc: string; icon: React.ReactNode }>
              ).map((opt) => {
                const active = preference === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => void handleThemeChange(opt.id)}
                    className={`p-4 rounded-xl border text-left transition-colors cursor-pointer space-y-2 ${
                      active
                        ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/30'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-slate-700 dark:text-slate-200">{opt.icon}</span>
                      {active && <Badge tone="info">Active</Badge>}
                    </div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{opt.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Accent Color"
              description="Customize workspace accent highlights saved locally."
            />
            <div className="flex flex-wrap gap-2.5">
              {(['blue', 'cyan', 'emerald', 'indigo', 'amber'] as const).map((accent) => {
                const active = (settings?.accentColor ?? 'blue') === accent;
                return (
                  <Button
                    key={accent}
                    variant={active ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => void handleAccentChange(accent)}
                  >
                    {accent.charAt(0).toUpperCase() + accent.slice(1)}
                  </Button>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {section === 'settings-localization' && (
        <Card>
          <CardHeader
            title="Currency, Numbering & Rates"
            description="Applies to new documents, reports, and time tracker billing estimates."
          />
          <form onSubmit={handleSaveLocalization} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Default Currency"
                value={defaultCurrency}
                onChange={(e) => setDefaultCurrency(e.target.value)}
                options={SUPPORTED_CURRENCIES.map((c) => ({
                  value: c.code,
                  label: `${c.code} — ${c.name} (${c.symbol.trim()})`,
                }))}
              />
              <Select
                label="Date Display Format"
                value={dateFormat}
                onChange={(e) => setDateFormat(e.target.value as DateFormatPreference)}
                options={[
                  { value: 'DD MMM YYYY', label: 'DD MMM YYYY (15 Nov 2026)' },
                  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (2026-11-15)' },
                  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (15/11/2026)' },
                  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (11/15/2026)' },
                ]}
              />
              <Input
                label="Invoice Prefix"
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value)}
              />
              <Input
                label="Quotation Prefix"
                value={quotationPrefix}
                onChange={(e) => setQuotationPrefix(e.target.value)}
              />
              <Input
                label="Proposal Prefix"
                value={proposalPrefix}
                onChange={(e) => setProposalPrefix(e.target.value)}
              />
              <Input
                label="Contract Prefix"
                value={contractPrefix}
                onChange={(e) => setContractPrefix(e.target.value)}
              />
              <Input
                label="Default Tax Rate (%)"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={defaultTaxRate}
                onChange={(e) => setDefaultTaxRate(e.target.value)}
              />
              <Input
                label="Default Hourly Rate"
                type="number"
                min="0"
                step="1"
                value={defaultHourlyRate}
                onChange={(e) => setDefaultHourlyRate(e.target.value)}
              />
              <Select
                label="Interface Language"
                value={language}
                onChange={(e) => {
                  const nextLang = e.target.value as SupportedLanguage;
                  setLanguage(nextLang);
                  if (nextLang === 'ur' || nextLang === 'ar') {
                    setRtl(true);
                  } else {
                    setRtl(false);
                  }
                }}
                options={Object.values(LANGUAGE_PACKS).map((l) => ({
                  value: l.code,
                  label: `${l.label} (${l.rtl ? 'RTL' : 'LTR'})`,
                }))}
              />
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rtl}
                    onChange={(e) => setRtl(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Enable Right-to-Left (RTL) layout direction</span>
                </label>
              </div>
            </div>

            <Input
              label="Informational FX Rates Relative to USD (JSON)"
              value={fxRatesText}
              onChange={(e) => setFxRatesText(e.target.value)}
              placeholder='{"USD":1,"EUR":0.92,"GBP":0.79,"PKR":278.5}'
            />

            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={savingLocalization}>
                Save Localization & Defaults
              </Button>
            </div>
          </form>
        </Card>
      )}

      {section === 'settings-ai' && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Optional AI Configuration (Gemini 4 Hydrogen, OpenAI-Compatible, Ollama)"
              description="SOLODESK AI works 100% offline without AI. Add API keys strictly in tab memory or configure a local Ollama endpoint."
              action={
                <Badge tone={hasKey || hasOpenAiKey || ollamaEnabled ? 'success' : 'neutral'}>
                  {hasKey
                    ? `Gemini Key (${maskApiKey(getSessionGeminiKey())})`
                    : hasOpenAiKey
                      ? 'OpenAI-Compatible Ready'
                      : ollamaEnabled
                        ? `Ollama (${ollamaModelId})`
                        : 'Offline Draft Mode'}
                </Badge>
              }
            />
            <div className="space-y-5">
              <form onSubmit={handleSaveKey} className="flex flex-col sm:flex-row gap-2.5 sm:items-end">
                <div className="flex-1">
                  <Input
                    type="password"
                    label="Session Gemini API Key (Memory-Only)"
                    placeholder="Enter key for gemini-4-hydrogen..."
                    leftIcon={<KeyRound className="w-4 h-4" />}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                  />
                </div>
                <Button type="submit" variant="primary" disabled={!apiKeyInput.trim()}>
                  Save to Tab Memory
                </Button>
                {hasKey && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      clearSessionGeminiKey();
                      setHasKey(false);
                      setTestResult(null);
                    }}
                  >
                    Clear Key
                  </Button>
                )}
              </form>

              <form
                onSubmit={handleSaveOpenAiMemory}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    OpenAI-Compatible Endpoint (Memory-Only)
                  </p>
                  <Badge tone={hasOpenAiKey ? 'success' : 'neutral'}>
                    {hasOpenAiKey ? 'Configured in Tab' : 'Not Configured'}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Input
                    label="Base URL"
                    value={openAiBaseUrl}
                    onChange={(e) => setOpenAiBaseUrl(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                  />
                  <Input
                    label="Model ID"
                    value={openAiModelId}
                    onChange={(e) => setOpenAiModelId(e.target.value)}
                    placeholder="gpt-4o-mini"
                  />
                  <Input
                    type="password"
                    label="Session Bearer Key"
                    value={openAiKeyInput}
                    onChange={(e) => setOpenAiKeyInput(e.target.value)}
                    placeholder="sk-..."
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" size="sm" variant="outline">
                    Save OpenAI-Compatible in Memory
                  </Button>
                  {hasOpenAiKey && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        clearSessionOpenAIConfig();
                        setHasOpenAiKey(false);
                      }}
                    >
                      Clear OpenAI Config
                    </Button>
                  )}
                </div>
              </form>

              <form
                onSubmit={handleSaveOllamaMemory}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    Local Ollama Adapter (Optional Self-Hosted Runtime)
                  </p>
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ollamaEnabled}
                      onChange={(e) => setOllamaEnabled(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <span>Enable Ollama</span>
                  </label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    label="Ollama Loopback URL"
                    value={ollamaBaseUrl}
                    onChange={(e) => setOllamaBaseUrl(e.target.value)}
                  />
                  <Input
                    label="Ollama Model Tag"
                    value={ollamaModelId}
                    onChange={(e) => setOllamaModelId(e.target.value)}
                  />
                </div>
                <Button type="submit" size="sm" variant="outline">
                  Apply Ollama Settings
                </Button>
              </form>

              <div className="flex flex-wrap items-end gap-3 pt-1">
                <div className="w-60">
                  <Select
                    label="Provider to Test"
                    value={providerTestTarget}
                    onChange={(e) =>
                      setProviderTestTarget(e.target.value as 'auto' | AIProviderId)
                    }
                    options={[
                      { value: 'auto', label: 'Auto-Detect Active Provider' },
                      { value: 'gemini', label: 'Gemini 4 Hydrogen' },
                      { value: 'openai_compatible', label: 'OpenAI-Compatible' },
                      { value: 'ollama', label: 'Local Ollama' },
                      { value: 'mock', label: 'Offline Deterministic Mock' },
                    ]}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  loading={testingConnection}
                  icon={<Sparkles className="w-4 h-4" />}
                  onClick={() => void handleTestKey()}
                >
                  Test Connection
                </Button>
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-lg text-xs border ${
                    testResult.ok
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200'
                      : 'bg-red-50/70 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-900 dark:text-red-200'
                  }`}
                >
                  {testResult.message}
                </div>
              )}

              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#101827]/70 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
                <p className="font-semibold text-slate-900 dark:text-white">
                  Security & Privacy Guarantees
                </p>
                <p>• Your API keys are never written to IndexedDB, localStorage, sessionStorage, or exported JSON backups.</p>
                <p>• Closing or reloading this browser tab clears keys automatically.</p>
                <p>• When offline or when no key is provided, AI Copilot falls back cleanly to deterministic local templates.</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {section === 'settings-privacy' && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Browser Storage Health & Persistence"
              description="Browser IndexedDB keeps your workspace on your device. Always export JSON backups for long-term safety."
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">Persistent Storage</p>
                <p className="font-semibold mt-1 text-slate-900 dark:text-white">
                  {storageHealth.persisted ? 'Granted by Browser' : 'Standard (Best-Effort)'}
                </p>
              </div>
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">Local Usage</p>
                <p className="font-mono font-semibold mt-1 text-slate-900 dark:text-white">
                  {storageHealth.usageBytes !== null
                    ? `${(storageHealth.usageBytes / (1024 * 1024)).toFixed(2)} MB`
                    : 'Unavailable'}
                </p>
              </div>
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">Cloud Telemetry</p>
                <p className="font-semibold mt-1 text-emerald-700 dark:text-emerald-400">
                  Zero Tracking / Disabled
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Button
                variant="outline"
                icon={<Database className="w-4 h-4" />}
                onClick={() => void handleRequestPersistence()}
              >
                Request Persistent Storage
              </Button>
              <Button variant="primary" onClick={() => onNavigate('settings-backup')}>
                Export Encrypted Backup
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Database Integrity & Diagnostics"
              description="Live local scan across all IndexedDB tables, schema migration state, and foreign-key relationships."
              action={
                <div className="flex items-center gap-2">
                  {healthReport && (
                    <Badge tone={healthReport.status === 'healthy' ? 'success' : 'warning'}>
                      {healthReport.status === 'healthy' ? 'Healthy' : 'Attention'}
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<RefreshCw className="w-3.5 h-3.5" />}
                    loading={checkingHealth}
                    onClick={() => void handleRunHealthCheck()}
                  >
                    Re-run Check
                  </Button>
                </div>
              }
            />
            {healthReport ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Schema Version</p>
                    <p className="font-mono font-semibold mt-0.5 text-slate-900 dark:text-white">
                      v{healthReport.schemaVersion}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Total Local Records</p>
                    <p className="font-mono font-semibold mt-0.5 text-slate-900 dark:text-white">
                      {healthReport.totalRecords}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Orphaned Links</p>
                    <p className="font-mono font-semibold mt-0.5 text-slate-900 dark:text-white">
                      {healthReport.orphans.reduce((s, o) => s + o.count, 0)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Quota Used</p>
                    <p className="font-mono font-semibold mt-0.5 text-slate-900 dark:text-white">
                      {healthReport.storage.usagePercent !== null
                        ? `${healthReport.storage.usagePercent}%`
                        : 'N/A'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  {Object.entries(healthReport.tableCounts).map(([table, count]) => (
                    <span
                      key={table}
                      className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#101827]/70 font-mono text-slate-700 dark:text-slate-300"
                    >
                      {table}: {count}
                    </span>
                  ))}
                </div>

                {healthReport.issues.length > 0 && (
                  <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <Activity className="w-3.5 h-3.5" />
                      <span>Diagnostic Advisories</span>
                    </div>
                    {healthReport.issues.map((issue) => (
                      <p key={issue}>• {issue}</p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">Running local IndexedDB diagnostics...</p>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Local Database Synchronization & Shortcuts"
              description="Tracks browser connectivity, IndexedDB read/write synchronization state, and workspace keyboard shortcuts."
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void retrySync()}
                  icon={<RefreshCw className="w-3.5 h-3.5" />}
                >
                  Sync Now
                </Button>
              }
            />
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <p className="text-slate-500">Connectivity</p>
                <p className="font-semibold mt-0.5 text-slate-900 dark:text-white">
                  {isOnline ? 'Online' : 'Offline (Local Mode)'}
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <p className="text-slate-500">Sync Lifecycle</p>
                <p className="font-semibold mt-0.5 text-slate-900 dark:text-white">
                  {SYNC_LIFECYCLE_LABELS[syncLifecycleStatus]} ({syncStatus}{pendingSyncCount > 0 ? `, ${pendingSyncCount} pending` : ''})
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <p className="text-slate-500">Last Verified Sync</p>
                <p className="font-mono mt-0.5 text-slate-900 dark:text-white">
                  {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : 'Not yet synced'}
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <p className="text-slate-500">Keyboard Shortcuts</p>
                <p className="mt-0.5 text-slate-900 dark:text-white">
                  <kbd className="font-mono px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">Ctrl/Cmd + K</kbd> Search ·{' '}
                  <kbd className="font-mono px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">Esc</kbd> Close
                </p>
              </div>
            </div>
            {syncError && (
              <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">Last Sync Error: {syncError}</p>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Demo Data & Workspace Reset"
              description="Manage sample data or erase all locally stored records on this browser."
            />
            <div className="flex flex-wrap items-center gap-3">
              {settings?.demoDataActive ? (
                <Button
                  variant="outline"
                  onClick={() =>
                    void removeDemoWorkspace().then(() =>
                      pushToast({
                        tone: 'success',
                        title: 'Demo records removed',
                        description: 'Sample workspace data was cleanly removed.',
                      })
                    )
                  }
                >
                  Clear Sample Demo Data
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() =>
                    void loadDemoWorkspace().then(() =>
                      pushToast({
                        tone: 'success',
                        title: 'Sample demo data loaded',
                        description: 'Explore pre-populated clients, projects, and invoices.',
                      })
                    )
                  }
                >
                  Load Sample Demo Workspace
                </Button>
              )}

              <Button
                variant="danger"
                icon={<Trash2 className="w-4 h-4" />}
                onClick={() => setConfirmResetAll(true)}
              >
                Delete All Local Data
              </Button>
            </div>
          </Card>
        </div>
      )}

      {section === 'settings-cloud-sync' && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Cloud Sync & Background Behavior"
              description="Control how SOLODESK AI synchronizes local IndexedDB changes and queues offline edits."
              action={
                <Button variant="outline" onClick={() => onNavigate('cloud-sync')} icon={<Cloud className="w-4 h-4" />}>
                  Open Sync Queue & Multi-Role
                </Button>
              }
            />
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Auto-sync
                    </p>
                    <Badge tone={autoSyncEnabled ? 'success' : 'neutral'}>
                      {autoSyncEnabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    When enabled, background synchronization automatically triggers when online for queued changes.
                    While working offline or disabled, edits remain safely stored in local IndexedDB.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2.5 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label="Auto-sync"
                    aria-checked={autoSyncEnabled}
                    checked={autoSyncEnabled}
                    onChange={(e) => {
                      const next = e.target.checked;
                      void setAutoSyncEnabled(next).then(() =>
                        pushToast({
                          tone: 'info',
                          title: next ? 'Auto-sync enabled' : 'Auto-sync paused for offline-first manual control',
                          description: next
                            ? 'Pending outbox changes will auto-sync when connected.'
                            : 'Background sync disabled; changes queue locally until manual sync.',
                        })
                      );
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    {autoSyncEnabled ? 'On' : 'Off'}
                  </span>
                </label>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Pause Outbox Transmission
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Temporarily hold outbound remote pushes while continuing local IndexedDB writes.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={syncPaused ? 'primary' : 'outline'}
                  onClick={() => void setSyncPaused(!syncPaused)}
                >
                  {syncPaused ? 'Resume Sync Queue' : 'Pause Sync Queue'}
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="text-slate-500">Connectivity</p>
                  <p className="font-semibold mt-0.5 text-slate-900 dark:text-white">
                    {isOnline ? 'Online' : 'Offline (Queued Locally)'}
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="text-slate-500">Queued Outbox Items</p>
                  <p className="font-mono tabular-nums font-semibold mt-0.5 text-slate-900 dark:text-white">
                    {syncQueue.filter((i) => i.status === 'pending' || i.status === 'failed').length} pending
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="text-slate-500">Sync Lifecycle</p>
                  <p className="font-semibold mt-0.5 text-slate-900 dark:text-white">
                    {SYNC_LIFECYCLE_LABELS[syncLifecycleStatus]} ({lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : 'Local Only'})
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {section === 'about' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader
              title="SOLODESK AI"
              description="Your Work. Your Clients. All in One Place."
            />
            <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              <p>
                SOLODESK AI is a local-first, offline-capable Freelancer Business Management Workspace
                built to manage the complete solo workflow—Clients, Projects, Tasks, Time Tracking,
                Proposals, Quotations, Contracts, Invoices, Payments, Finance, Knowledge Hub, and
                encrypted JSON Backups—without requiring a paid backend subscription.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge tone="info">IndexedDB (Dexie)</Badge>
                <Badge tone="success">Offline PWA Ready</Badge>
                <Badge tone="neutral">Optional BYOK Gemini 4 Hydrogen</Badge>
              </div>
              <div className="pt-2 flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => onNavigate('marketing')}>
                  View Product & Pricing Overview
                </Button>
                <Button variant="outline" onClick={() => onNavigate('settings-backup')}>
                  Download Backup
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Architecture & Disclaimers"
              description="Important operational notes for independent operators."
            />
            <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Financial totals, profitability estimates, and tax breakdowns are informational helpers
                  and do not replace certified accounting or tax filing advice.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Contract templates are provided for convenience only and do not constitute legal counsel.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Database className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Browser storage stays private on your device; clearing site data removes local records
                  unless you maintain regular JSON backups.
                </span>
              </li>
            </ul>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirmResetAll}
        onClose={() => setConfirmResetAll(false)}
        onConfirm={handleFactoryReset}
        title="Erase Entire Local Workspace?"
        description="This permanently deletes all clients, projects, tasks, documents, payments, finance entries, and Knowledge Hub notes from this browser's IndexedDB. Export a JSON backup first if needed."
        confirmLabel="Yes, Erase Everything"
        danger
        loading={savingReset}
      />
    </div>
  );
};
