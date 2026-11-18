export type PlanTier = 'free' | 'pro' | 'ultimate' | 'business' | 'enterprise';

export interface PlanEntitlementSpec {
  id: PlanTier;
  name: string;
  priceLabel: string;
  monthlyUsdPrice: number | null;
  seatLimit: number | null;
  maxClients: number | null;
  maxActiveProjects: number | null;
  maxVaultFiles: number | null;
  clientPortalEnabled: boolean;
  customWorkflowsEnabled: boolean;
  multiCurrencyEnabled: boolean;
  cloudSyncAdapterEnabled: boolean;
  aiWorkforceEnabled: boolean;
  checkoutStatus: 'local_free' | 'BLOCKED_EXTERNAL_PROVIDER_REQUIRED';
  notes: string;
}

export const PAKISTAN_PAYMENT_GUIDANCE = {
  stripeStatus: 'UNSUPPORTED_IN_PAKISTAN_WITHOUT_FOREIGN_ENTITY',
  summary:
    'Stripe does not directly onboard Pakistan-resident entities without a foreign incorporated company (e.g., US LLC / UK Ltd). Live card checkout stays disabled until a verified processor is connected.',
  supportedLaunchPaths: [
    'PayFast Pakistan (PKR domestic cards, bank transfer & wallets)',
    'Safepay Pakistan (PKR + international card acceptance for PK merchants)',
    'JazzCash / Easypaisa Merchant API (local PKR checkout)',
    'Wise Business / Payoneer Receiving Account (manual USD/GBP/EUR invoices & bank wire)',
  ],
};

export const PLAN_ENTITLEMENTS: Record<PlanTier, PlanEntitlementSpec> = {
  free: {
    id: 'free',
    name: 'Free Offline Solo',
    priceLabel: '$0 / forever',
    monthlyUsdPrice: 0,
    seatLimit: 1,
    maxClients: 15,
    maxActiveProjects: 10,
    maxVaultFiles: 25,
    clientPortalEnabled: true,
    customWorkflowsEnabled: true,
    multiCurrencyEnabled: true,
    cloudSyncAdapterEnabled: false,
    aiWorkforceEnabled: true,
    checkoutStatus: 'local_free',
    notes: 'Full local IndexedDB PWA with Hybrid RAG v3, PDF export, and zero paid server required.',
  },
  pro: {
    id: 'pro',
    name: 'Pro Solo',
    priceLabel: '$15 / mo (Checkout Blocked)',
    monthlyUsdPrice: 15,
    seatLimit: 1,
    maxClients: 200,
    maxActiveProjects: 100,
    maxVaultFiles: 500,
    clientPortalEnabled: true,
    customWorkflowsEnabled: true,
    multiCurrencyEnabled: true,
    cloudSyncAdapterEnabled: true,
    aiWorkforceEnabled: true,
    checkoutStatus: 'BLOCKED_EXTERNAL_PROVIDER_REQUIRED',
    notes: 'Adds cloud sync outbox & recurring automation. Live billing BLOCKED — EXTERNAL REQUIREMENT.',
  },
  ultimate: {
    id: 'ultimate',
    name: 'Ultimate Studio',
    priceLabel: '$39 / mo (Checkout Blocked)',
    monthlyUsdPrice: 39,
    seatLimit: 3,
    maxClients: null,
    maxActiveProjects: null,
    maxVaultFiles: null,
    clientPortalEnabled: true,
    customWorkflowsEnabled: true,
    multiCurrencyEnabled: true,
    cloudSyncAdapterEnabled: true,
    aiWorkforceEnabled: true,
    checkoutStatus: 'BLOCKED_EXTERNAL_PROVIDER_REQUIRED',
    notes: '3-seat studio tier with unlimited projects, 15-Agent AI Workforce & BI forecasts.',
  },
  business: {
    id: 'business',
    name: 'Business Team',
    priceLabel: '$29 / seat / mo (Checkout Blocked)',
    monthlyUsdPrice: 29,
    seatLimit: 25,
    maxClients: null,
    maxActiveProjects: null,
    maxVaultFiles: null,
    clientPortalEnabled: true,
    customWorkflowsEnabled: true,
    multiCurrencyEnabled: true,
    cloudSyncAdapterEnabled: true,
    aiWorkforceEnabled: true,
    checkoutStatus: 'BLOCKED_EXTERNAL_PROVIDER_REQUIRED',
    notes: 'Multi-tenant RBAC, PostgreSQL RLS migration readiness, and compliance audit logs.',
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise Custom',
    priceLabel: 'Custom (Manual Sales)',
    monthlyUsdPrice: null,
    seatLimit: null,
    maxClients: null,
    maxActiveProjects: null,
    maxVaultFiles: null,
    clientPortalEnabled: true,
    customWorkflowsEnabled: true,
    multiCurrencyEnabled: true,
    cloudSyncAdapterEnabled: true,
    aiWorkforceEnabled: true,
    checkoutStatus: 'BLOCKED_EXTERNAL_PROVIDER_REQUIRED',
    notes: 'Dedicated VPC / self-hosted deployment, custom SSO, and SLA onboarding via inquiry.',
  },
};

export function evaluateUsageAgainstPlan(input: {
  tier: PlanTier;
  clientCount: number;
  activeProjectCount: number;
  vaultFileCount: number;
}) {
  const spec = PLAN_ENTITLEMENTS[input.tier] ?? PLAN_ENTITLEMENTS.free;
  return {
    spec,
    clientsWithinLimit: spec.maxClients === null || input.clientCount <= spec.maxClients,
    projectsWithinLimit:
      spec.maxActiveProjects === null || input.activeProjectCount <= spec.maxActiveProjects,
    vaultWithinLimit: spec.maxVaultFiles === null || input.vaultFileCount <= spec.maxVaultFiles,
  };
}
