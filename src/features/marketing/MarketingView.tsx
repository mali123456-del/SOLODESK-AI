import React from 'react';
import {
  ArrowRight,
  Check,
  Database,
  FileText,
  HardDriveDownload,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Badge, Button, Card } from '../../components/ui';
import type { AppRouteId } from '../../types/navigation';

interface MarketingViewProps {
  onNavigate: (route: AppRouteId) => void;
}

const CAPABILITY_PILLARS = [
  {
    num: '01',
    title: 'Client CRM & Project Delivery',
    detail:
      'Keep contacts, duplicate detection, linked projects, milestones, and list/Kanban tasks organized in one workspace.',
    span: 'lg:col-span-2',
  },
  {
    num: '02',
    title: 'Document Studio & One-Click Conversion',
    detail:
      'Generate Proposals, Quotations, Contracts, and Invoices with exact decimal math, unique invoice numbers, print views, and PDF export.',
    span: 'lg:col-span-1',
  },
  {
    num: '03',
    title: 'Payments, Time & Profitability',
    detail:
      'Track billable sessions with persistent recovery, record partial payments, log expenses, and inspect net project margins.',
    span: 'lg:col-span-1',
  },
  {
    num: '04',
    title: 'Offline-First Knowledge & Optional AI',
    detail:
      'Index studio SOPs locally for instant cited search. Add a session-only Gemini 4 Hydrogen BYOK key anytime or run 100% offline.',
    span: 'lg:col-span-2',
  },
];

const PRICING_TIERS = [
  {
    name: 'Free (Local-First Workspace)',
    price: '$0',
    cadence: 'No subscription required',
    highlight: true,
    summary: 'Complete local-first MVP unlocked directly in your browser.',
    items: [
      'Clients, Projects, Tasks & Persistent Time Tracker',
      'Proposals, Quotations, Contracts & Invoices + PDF Export',
      'Payments, Income, Expenses & Profitability Reports',
      'Knowledge Hub Local RAG Search + Offline Draft Mode',
      'AES-GCM Encrypted JSON Backup & Restore',
    ],
  },
  {
    name: 'Pro (Optional BYOK Cloud AI)',
    price: 'BYOK',
    cadence: 'Pay your own API usage if needed',
    highlight: false,
    summary: 'Connect your personal Gemini 4 Hydrogen key strictly in memory.',
    items: [
      'Everything in Free Local Workspace',
      'Live Gemini 4 Hydrogen proposal & email drafting',
      'Approval-gated workspace actions & RAG citations',
      'Zero key persistence on disk or servers',
    ],
  },
  {
    name: 'Ultimate / Business',
    price: 'Planned',
    cadence: 'Future optional sync adapters',
    highlight: false,
    summary: 'Repository-backed architecture ready for future encrypted team/cloud sync.',
    items: [
      'Multi-device encrypted sync adapter (repository interface ready)',
      'Client approval portal & custom domain export',
      'Team role permissions when backend services are added',
    ],
  },
];

export const MarketingView: React.FC<MarketingViewProps> = ({ onNavigate }) => {
  return (
    <div className="space-y-10 pb-8">
      {/* Hero */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#172338] p-6 sm:p-10">
        <div className="max-w-3xl space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Badge tone="info">SOLODESK AI</Badge>
            <span>Local-First Freelancer Business Workspace & PWA</span>
          </div>

          <h1
            className="font-bold tracking-tight text-slate-900 dark:text-white leading-[1.12]"
            style={{ fontSize: 'clamp(2rem, 4vw, 3.25rem)' }}
          >
            Your Work. Your Clients. All in One Place.
          </h1>

          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
            Manage clients, projects, tasks, proposals, quotations, contracts, invoices, payments,
            time logs, and encrypted backups directly inside your browser—with zero mandatory cloud
            accounts or server fees.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              variant="primary"
              size="lg"
              icon={<ArrowRight className="w-4 h-4" />}
              onClick={() => onNavigate('dashboard')}
            >
              Open Workspace Dashboard
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => onNavigate('settings-backup')}
            >
              Backup & Encryption Controls
            </Button>
          </div>
        </div>
      </section>

      {/* Core Capabilities */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            End-to-End Solo Operator Workflow
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Client → Proposal → Quotation → Contract → Project → Tasks → Time → Invoice → Payment → Reports
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {CAPABILITY_PILLARS.map((item) => (
            <Card key={item.num} className={item.span}>
              <div className="space-y-2">
                <span className="font-mono text-xs font-semibold text-blue-600 dark:text-[#20C7D9]">
                  {item.num}
                </span>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {item.title}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {item.detail}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Architecture Trust Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="space-y-2">
            <Database className="w-5 h-5 text-blue-600 dark:text-[#20C7D9]" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              IndexedDB Persistence
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Every record lives locally via versioned Dexie schemas and decimal-safe monetary calculations.
            </p>
          </div>
        </Card>
        <Card>
          <div className="space-y-2">
            <HardDriveDownload className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              AES-GCM Backup Safety
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Export portable JSON backups or passphrase-encrypt archives locally using browser Web Crypto.
            </p>
          </div>
        </Card>
        <Card>
          <div className="space-y-2">
            <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Transparent Optional AI
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Works fully without an AI key. When enabled, Gemini 4 Hydrogen keys stay strictly in tab memory.
            </p>
          </div>
        </Card>
      </section>

      {/* Honest Pricing & Roadmap */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Transparent Editions & Capabilities
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            All local-first MVP features are unlocked right now with no paywall or account lock-in.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {PRICING_TIERS.map((tier) => (
            <Card
              key={tier.name}
              className={
                tier.highlight
                  ? 'border-blue-600 dark:border-blue-500 ring-1 ring-blue-600/20'
                  : undefined
              }
            >
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                      {tier.name}
                    </h3>
                    {tier.highlight && <Badge tone="info">Included Now</Badge>}
                  </div>
                  <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                    {tier.price}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{tier.cadence}</p>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {tier.summary}
                </p>

                <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-200">
                  {tier.items.map((point) => (
                    <li key={point} className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Quick Actions Footer */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#101827] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-[#20C7D9]" />
            Ready to organize your freelance studio?
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Jump into your dashboard or inspect offline PDF generation inside Invoices.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" icon={<FileText className="w-4 h-4" />} onClick={() => onNavigate('invoices')}>
            Open Invoice Studio
          </Button>
          <Button variant="primary" onClick={() => onNavigate('dashboard')}>
            Go to Dashboard
          </Button>
        </div>
      </section>
    </div>
  );
};
