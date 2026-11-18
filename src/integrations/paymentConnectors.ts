export type PaymentProviderId = 'payfast_pk' | 'safepay' | 'jazzcash' | 'stripe';

export type PaymentConnectionState =
  | 'not_configured'
  | 'pending_verification'
  | 'sandbox'
  | 'live_verified'
  | 'disabled'
  | 'failed';

export interface PaymentConnectorDescriptor {
  id: PaymentProviderId;
  name: string;
  supportedCurrencies: string[];
  state: PaymentConnectionState;
  supportsDirectInPakistan: boolean;
  notes: string;
}

export const PAYMENT_CONNECTOR_REGISTRY: PaymentConnectorDescriptor[] = [
  {
    id: 'payfast_pk',
    name: 'PayFast Pakistan',
    supportedCurrencies: ['PKR', 'USD'],
    state: 'not_configured',
    supportsDirectInPakistan: true,
    notes: 'BLOCKED — EXTERNAL REQUIREMENT: Requires registered PayFast PK Merchant ID and Secured Key.',
  },
  {
    id: 'safepay',
    name: 'Safepay Pakistan',
    supportedCurrencies: ['PKR', 'USD'],
    state: 'not_configured',
    supportsDirectInPakistan: true,
    notes: 'BLOCKED — EXTERNAL REQUIREMENT: Requires Safepay sandbox/live API keys and webhook shared secret.',
  },
  {
    id: 'jazzcash',
    name: 'JazzCash Merchant Gateway',
    supportedCurrencies: ['PKR'],
    state: 'not_configured',
    supportsDirectInPakistan: true,
    notes: 'BLOCKED — EXTERNAL REQUIREMENT: Requires JazzCash Integrity Salt and Merchant MPIN/ID.',
  },
  {
    id: 'stripe',
    name: 'Stripe Connect / Checkout',
    supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'],
    state: 'disabled',
    supportsDirectInPakistan: false,
    notes: 'Requires non-Pakistan legal entity or US/UK/UAE Stripe Atlas account plus live secret/webhook keys.',
  },
];

export interface CheckoutSessionRequest {
  provider: PaymentProviderId;
  workspaceId: string;
  invoiceId: string;
  amountCents: number;
  currency: string;
}

export interface CheckoutSessionOutcome {
  ok: boolean;
  blocked: boolean;
  provider: PaymentProviderId;
  state: PaymentConnectionState;
  reason: string;
}

export function initiateHostedCheckoutSession(
  req: CheckoutSessionRequest
): CheckoutSessionOutcome {
  const connector = PAYMENT_CONNECTOR_REGISTRY.find((c) => c.id === req.provider);
  if (!connector) {
    return {
      ok: false,
      blocked: true,
      provider: req.provider,
      state: 'failed',
      reason: `Unknown payment provider "${req.provider}".`,
    };
  }
  return {
    ok: false,
    blocked: true,
    provider: connector.id,
    state: connector.state,
    reason: connector.notes,
  };
}

export interface PaymentWebhookVerificationInput {
  provider: PaymentProviderId;
  expectedAmountCents: number;
  expectedCurrency: string;
  receivedAmountCents: number;
  receivedCurrency: string;
  eventId: string;
  seenEventIds: Set<string>;
  signatureValid: boolean;
}

export function verifyPaymentWebhookPayload(
  input: PaymentWebhookVerificationInput
): { accepted: boolean; reason: string } {
  if (!input.signatureValid) {
    return { accepted: false, reason: 'Invalid payment webhook HMAC signature.' };
  }
  if (!input.eventId.trim()) {
    return { accepted: false, reason: 'Missing provider event ID.' };
  }
  if (input.seenEventIds.has(input.eventId)) {
    return { accepted: false, reason: `Duplicate idempotent event "${input.eventId}" rejected.` };
  }
  if (input.receivedCurrency.toUpperCase() !== input.expectedCurrency.toUpperCase()) {
    return {
      accepted: false,
      reason: `Currency mismatch: expected ${input.expectedCurrency}, got ${input.receivedCurrency}.`,
    };
  }
  if (input.receivedAmountCents <= 0 || input.receivedAmountCents !== input.expectedAmountCents) {
    return {
      accepted: false,
      reason: `Amount mismatch: expected ${input.expectedAmountCents} minor units, got ${input.receivedAmountCents}.`,
    };
  }
  return { accepted: true, reason: 'Verified signature, idempotency, currency, and amount.' };
}
