import { repositories, type DexieSolodeskRepositories } from '../database/repositories/dexieRepositories';
import type { IntegrationConnection } from '../domain/schemas/entities';
import { recordStructuredAudit } from '../security/auditLogger';
import { validatePublicHttpUrl } from '../security/urlPolicy';

export interface IntegrationCatalogEntry {
  provider: string;
  category: IntegrationConnection['category'];
  displayName: string;
  description: string;
  requiresExternalCredentials: boolean;
  requiresEndpointUrl: boolean;
  defaultScopes: string[];
  setupGuidance: string;
}

export const INTEGRATION_CATALOG: IntegrationCatalogEntry[] = [
  {
    provider: 'google_workspace_oauth',
    category: 'calendar',
    displayName: 'Google Calendar & Gmail OAuth',
    description:
      'Sync appointments and send client follow-ups from your Google account when OAuth client credentials are provisioned.',
    requiresExternalCredentials: true,
    requiresEndpointUrl: false,
    defaultScopes: ['calendar.events', 'gmail.send'],
    setupGuidance:
      'Blocked — Credentials Required. Local .ics calendar export and mailto: launch remain fully operational offline.',
  },
  {
    provider: 'outbound_webhooks',
    category: 'webhook',
    displayName: 'SSRF-Hardened Outbound Webhooks',
    description:
      'Push signed event payloads to Zapier, Make, n8n, or custom endpoints verified against private IP/DNS SSRF policy.',
    requiresExternalCredentials: false,
    requiresEndpointUrl: true,
    defaultScopes: ['invoice.overdue', 'payment.received', 'proposal.accepted'],
    setupGuidance:
      'Public HTTPS/HTTP URLs only. Loopback, RFC 1918 private, and link-local metadata endpoints are blocked.',
  },
  {
    provider: 'ai_gateway_adapters',
    category: 'ai',
    displayName: 'AI Provider Adapters (Gemini / OpenAI / Ollama)',
    description:
      'Route prompts via memory-only BYOK session keys, server proxy (/api/v1/ai/generate), or local Ollama.',
    requiresExternalCredentials: false,
    requiresEndpointUrl: false,
    defaultScopes: ['copilot.draft', 'workforce.agents'],
    setupGuidance:
      'Zero secrets stored in IndexedDB/localStorage/sessionStorage. Configure active session keys in AI Configuration.',
  },
  {
    provider: 'payment_gateway_adapters',
    category: 'payment',
    displayName: 'Payment Gateways (PayFast, Safepay, JazzCash, Stripe)',
    description:
      'Merchant billing & invoice checkout connectors for Pakistan & international card settlements.',
    requiresExternalCredentials: true,
    requiresEndpointUrl: false,
    defaultScopes: ['billing.checkout', 'webhooks.verify'],
    setupGuidance:
      'Blocked — Merchant API Credentials Required. Manual ledger payment logging & atomic invoice balance updates work 100% offline.',
  },
];

export async function configureIntegrationAdapter(
  input: {
    provider: string;
    accountLabel?: string;
    endpointUrl?: string;
  },
  repo: DexieSolodeskRepositories = repositories
): Promise<IntegrationConnection> {
  const catalog = INTEGRATION_CATALOG.find((c) => c.provider === input.provider);
  if (!catalog) {
    throw new Error(`Unknown integration provider "${input.provider}".`);
  }

  let normalizedEndpoint = '';
  if (input.endpointUrl?.trim()) {
    const check = validatePublicHttpUrl(input.endpointUrl.trim());
    if (!check.valid || !check.normalizedUrl) {
      throw new Error(check.reason || 'Endpoint URL blocked by SSRF security policy.');
    }
    normalizedEndpoint = check.normalizedUrl;
  } else if (catalog.requiresEndpointUrl) {
    throw new Error(`Endpoint URL is required for ${catalog.displayName}.`);
  }

  const nextStatus: IntegrationConnection['status'] = catalog.requiresExternalCredentials
    ? 'blocked_credentials'
    : 'configured';

  const saved = await repo.saveIntegrationConnection({
    provider: catalog.provider,
    category: catalog.category,
    displayName: catalog.displayName,
    status: nextStatus,
    accountLabel: input.accountLabel?.trim() || '',
    endpointUrl: normalizedEndpoint,
    scopes: catalog.defaultScopes,
    lastSyncAt: new Date().toISOString(),
    lastError: catalog.requiresExternalCredentials
      ? 'External OAuth / merchant API credentials not provisioned.'
      : '',
  });

  await recordStructuredAudit({
    eventType: 'INTEGRATION_UPDATED',
    action: 'integration.configured',
    resourceType: 'integration',
    resourceId: catalog.provider,
    detail: `Configured ${catalog.displayName} (${nextStatus}).`,
    metadata: { provider: catalog.provider, status: nextStatus },
  });

  return saved;
}

export async function testIntegrationConnection(
  connection: IntegrationConnection,
  repo: DexieSolodeskRepositories = repositories
): Promise<IntegrationConnection> {
  const catalog = INTEGRATION_CATALOG.find((c) => c.provider === connection.provider);
  const now = new Date().toISOString();

  if (catalog?.requiresExternalCredentials) {
    return repo.saveIntegrationConnection({
      provider: connection.provider,
      category: connection.category,
      displayName: connection.displayName,
      status: 'blocked_credentials',
      accountLabel: connection.accountLabel,
      endpointUrl: connection.endpointUrl,
      scopes: connection.scopes,
      lastSyncAt: now,
      lastError: 'Blocked — external provider OAuth/API credentials required in runtime environment.',
    });
  }

  if (connection.endpointUrl) {
    const check = validatePublicHttpUrl(connection.endpointUrl);
    if (!check.valid) {
      return repo.saveIntegrationConnection({
        provider: connection.provider,
        category: connection.category,
        displayName: connection.displayName,
        status: 'error',
        accountLabel: connection.accountLabel,
        endpointUrl: connection.endpointUrl,
        scopes: connection.scopes,
        lastSyncAt: now,
        lastError: check.reason || 'Endpoint failed SSRF validation.',
      });
    }
  }

  return repo.saveIntegrationConnection({
    provider: connection.provider,
    category: connection.category,
    displayName: connection.displayName,
    status: 'configured',
    accountLabel: connection.accountLabel,
    endpointUrl: connection.endpointUrl,
    scopes: connection.scopes,
    lastSyncAt: now,
    lastError: '',
  });
}

export async function disconnectIntegrationAdapter(
  connection: IntegrationConnection,
  repo: DexieSolodeskRepositories = repositories
): Promise<IntegrationConnection> {
  const saved = await repo.saveIntegrationConnection({
    provider: connection.provider,
    category: connection.category,
    displayName: connection.displayName,
    status: 'disconnected',
    accountLabel: '',
    endpointUrl: '',
    scopes: connection.scopes,
    lastSyncAt: new Date().toISOString(),
    lastError: '',
  });

  await recordStructuredAudit({
    eventType: 'INTEGRATION_UPDATED',
    action: 'integration.disconnected',
    resourceType: 'integration',
    resourceId: connection.provider,
    detail: `Disconnected ${connection.displayName}.`,
    metadata: { provider: connection.provider, status: 'disconnected' },
  });

  return saved;
}
