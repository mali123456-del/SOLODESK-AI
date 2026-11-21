import crypto from 'node:crypto';
import type { ServerPlanTier } from './entitlements';

export type ExternalIntegrationState =
  | 'VERIFIED_LIVE'
  | 'VERIFIED_SANDBOX'
  | 'IMPLEMENTED_NOT_CONFIGURED'
  | 'BLOCKED_EXTERNAL_CREDENTIALS'
  | 'BLOCKED_PROVIDER_ACCESS'
  | 'FAILED_VERIFICATION';

export interface ProviderReadinessItem {
  provider: string;
  category: 'database' | 'payments' | 'auth' | 'email' | 'ai' | 'esignature';
  status: ExternalIntegrationState;
  configured: boolean;
  details: string;
}

export function getExternalProviderReadiness(
  env: Record<string, string | undefined> = process.env
): ProviderReadinessItem[] {
  const hasPgUrl = Boolean(
    env.DATABASE_URL?.trim() || env.POSTGRES_URL?.trim() || env.SUPABASE_DB_URL?.trim()
  );
  const hasStripe = Boolean(env.STRIPE_SECRET_KEY?.trim());
  const hasSafepay = Boolean(env.SAFEPAY_SECRET_KEY?.trim() || env.SAFEPAY_API_KEY?.trim());
  const hasPayFast = Boolean(env.PAYFAST_MERCHANT_ID?.trim() && env.PAYFAST_SECURED_KEY?.trim());
  const hasWebhookSecret = Boolean(env.BILLING_WEBHOOK_SECRET?.trim());
  const hasGoogleOAuth = Boolean(env.GOOGLE_OAUTH_CLIENT_ID?.trim());
  const hasSmtp = Boolean(env.SMTP_HOST?.trim() || env.RESEND_API_KEY?.trim());
  const hasGemini = Boolean(env.GEMINI_API_KEY?.trim());
  const hasEsign = Boolean(env.ESIGN_API_KEY?.trim());

  return [
    {
      provider: 'postgresql_staging',
      category: 'database',
      status: hasPgUrl ? 'IMPLEMENTED_NOT_CONFIGURED' : 'BLOCKED_EXTERNAL_CREDENTIALS',
      configured: hasPgUrl,
      details: hasPgUrl
        ? 'Connection string detected in env; execute staging migration & RLS verification before promotion.'
        : 'DATABASE_URL / SUPABASE_DB_URL is not configured in this environment. SQLite WAL backend & static PG migrations 001–006 are verified locally.',
    },
    {
      provider: 'stripe_checkout',
      category: 'payments',
      status: hasStripe ? 'IMPLEMENTED_NOT_CONFIGURED' : 'BLOCKED_EXTERNAL_CREDENTIALS',
      configured: hasStripe,
      details: hasStripe
        ? 'STRIPE_SECRET_KEY detected; requires sandbox live test confirmation.'
        : 'STRIPE_SECRET_KEY not set. Direct Stripe onboarding is unavailable in Pakistan without a foreign corporate entity.',
    },
    {
      provider: 'safepay_pakistan',
      category: 'payments',
      status: hasSafepay ? 'IMPLEMENTED_NOT_CONFIGURED' : 'BLOCKED_EXTERNAL_CREDENTIALS',
      configured: hasSafepay,
      details: hasSafepay
        ? 'Safepay credentials detected; requires sandbox order creation test.'
        : 'SAFEPAY_API_KEY / SAFEPAY_SECRET_KEY not set in runtime environment.',
    },
    {
      provider: 'payfast_pakistan',
      category: 'payments',
      status: hasPayFast ? 'IMPLEMENTED_NOT_CONFIGURED' : 'BLOCKED_EXTERNAL_CREDENTIALS',
      configured: hasPayFast,
      details: hasPayFast
        ? 'PayFast merchant ID & secured key detected.'
        : 'PAYFAST_MERCHANT_ID / PAYFAST_SECURED_KEY not set in runtime environment.',
    },
    {
      provider: 'billing_webhooks_hmac',
      category: 'payments',
      status: hasWebhookSecret ? 'IMPLEMENTED_NOT_CONFIGURED' : 'BLOCKED_EXTERNAL_CREDENTIALS',
      configured: hasWebhookSecret,
      details: hasWebhookSecret
        ? 'BILLING_WEBHOOK_SECRET configured for raw-body HMAC-SHA256 verification.'
        : 'BILLING_WEBHOOK_SECRET not configured in runtime environment.',
    },
    {
      provider: 'google_workspace_oauth',
      category: 'auth',
      status: hasGoogleOAuth ? 'IMPLEMENTED_NOT_CONFIGURED' : 'BLOCKED_EXTERNAL_CREDENTIALS',
      configured: hasGoogleOAuth,
      details: hasGoogleOAuth
        ? 'GOOGLE_OAUTH_CLIENT_ID configured.'
        : 'GOOGLE_OAUTH_CLIENT_ID not configured; local email+password scrypt sessions remain active.',
    },
    {
      provider: 'transactional_email_smtp',
      category: 'email',
      status: hasSmtp ? 'IMPLEMENTED_NOT_CONFIGURED' : 'BLOCKED_EXTERNAL_CREDENTIALS',
      configured: hasSmtp,
      details: hasSmtp
        ? 'SMTP / Resend credentials detected.'
        : 'SMTP_HOST / RESEND_API_KEY not set; invitation & password reset tokens remain local-only.',
    },
    {
      provider: 'gemini_server_gateway',
      category: 'ai',
      status: hasGemini ? 'IMPLEMENTED_NOT_CONFIGURED' : 'BLOCKED_EXTERNAL_CREDENTIALS',
      configured: hasGemini,
      details: hasGemini
        ? 'GEMINI_API_KEY detected for server-side proxy.'
        : 'Server GEMINI_API_KEY not set; client session BYOK header & offline deterministic drafts remain active.',
    },
    {
      provider: 'remote_esignature',
      category: 'esignature',
      status: hasEsign ? 'IMPLEMENTED_NOT_CONFIGURED' : 'BLOCKED_EXTERNAL_CREDENTIALS',
      configured: hasEsign,
      details: hasEsign
        ? 'ESIGN_API_KEY detected.'
        : 'No remote e-signature provider configured; local contract signature capture & non-legal disclaimer active.',
    },
  ];
}

export function verifyRawBodyHmacSignature(input: {
  rawPayload: Buffer | string;
  signatureHeader: string;
  secret: string;
}): boolean {
  if (!input.secret || !input.signatureHeader.trim()) return false;
  const payloadBuf =
    typeof input.rawPayload === 'string'
      ? Buffer.from(input.rawPayload, 'utf8')
      : input.rawPayload;

  const expectedHex = crypto
    .createHmac('sha256', input.secret)
    .update(payloadBuf)
    .digest('hex');

  const trimmed = input.signatureHeader.trim();
  // Support either direct hex / `sha256=<hex>` OR `t=<ts>,v1=<hex>` style signature headers
  let providedHex = '';
  if (trimmed.includes('v1=')) {
    const parts = trimmed.split(',').map((p) => p.trim());
    const tPart = parts.find((p) => p.startsWith('t='))?.slice(2) ?? '';
    const v1Part = parts.find((p) => p.startsWith('v1='))?.slice(3) ?? '';
    if (tPart && v1Part) {
      const signedPayload = `${tPart}.${payloadBuf.toString('utf8')}`;
      const expectedTsHex = crypto
        .createHmac('sha256', input.secret)
        .update(signedPayload)
        .digest('hex');
      if (
        v1Part.length === expectedTsHex.length &&
        /^[0-9a-f]+$/i.test(v1Part) &&
        crypto.timingSafeEqual(
          Buffer.from(v1Part.toLowerCase(), 'hex'),
          Buffer.from(expectedTsHex, 'hex')
        )
      ) {
        return true;
      }
    }
    return false;
  }

  providedHex = trimmed.replace(/^sha256=/i, '').toLowerCase();
  if (providedHex.length !== expectedHex.length || !/^[0-9a-f]+$/.test(providedHex)) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(providedHex, 'hex'), Buffer.from(expectedHex, 'hex'));
}

export const TIER_MONTHLY_USD_CENTS: Record<Exclude<ServerPlanTier, 'free' | 'enterprise'>, number> = {
  pro: 1500,
  ultimate: 3900,
  business: 2900,
};

export async function initiateExternalCheckoutSession(input: {
  workspaceId: string;
  targetTier: ServerPlanTier;
  preferredProvider?: 'stripe' | 'safepay' | 'payfast';
  successUrl?: string;
  cancelUrl?: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): Promise<
  | { ok: true; checkoutStatus: 'local_free' | 'session_created'; provider: string; sessionId?: string; checkoutUrl?: string; message: string }
  | { ok: false; code: 'BLOCKED_EXTERNAL_PROVIDER_REQUIRED' | 'PROVIDER_API_ERROR'; status: 501 | 502; message: string }
> {
  if (input.targetTier === 'free') {
    return {
      ok: true,
      checkoutStatus: 'local_free',
      provider: 'local_free',
      message: 'Free Offline Solo requires no external checkout session.',
    };
  }

  const env = input.env ?? process.env;
  const stripeKey = env.STRIPE_SECRET_KEY?.trim() || '';
  const safepayKey = env.SAFEPAY_SECRET_KEY?.trim() || env.SAFEPAY_API_KEY?.trim() || '';
  const payfastMerchant = env.PAYFAST_MERCHANT_ID?.trim() || '';
  const payfastSecuredKey = env.PAYFAST_SECURED_KEY?.trim() || '';

  if (!stripeKey && !safepayKey && !(payfastMerchant && payfastSecuredKey)) {
    return {
      ok: false,
      code: 'BLOCKED_EXTERNAL_PROVIDER_REQUIRED',
      status: 501,
      message:
        'Live payment checkout is disabled until Stripe/Safepay/PayFast merchant credentials are configured in server environment variables.',
    };
  }

  if (input.targetTier === 'enterprise') {
    return {
      ok: false,
      code: 'BLOCKED_EXTERNAL_PROVIDER_REQUIRED',
      status: 501,
      message: 'Enterprise custom plans require manual invoicing/contract onboarding via Support Requests.',
    };
  }

  const fetcher = input.fetchImpl ?? fetch;
  const amountCents = TIER_MONTHLY_USD_CENTS[input.targetTier];

  if ((input.preferredProvider === 'stripe' || (!input.preferredProvider && stripeKey)) && stripeKey) {
    const form = new URLSearchParams({
      mode: 'subscription',
      success_url: input.successUrl || 'https://solodesk.invalid/billing/success',
      cancel_url: input.cancelUrl || 'https://solodesk.invalid/billing/cancel',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(amountCents),
      'line_items[0][price_data][recurring][interval]': 'month',
      'line_items[0][price_data][product_data][name]': `SOLODESK AI ${input.targetTier}`,
      'line_items[0][quantity]': '1',
      'metadata[workspaceId]': input.workspaceId,
      'metadata[targetTier]': input.targetTier,
    });
    const resp = await fetcher('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    if (!resp.ok) {
      return {
        ok: false,
        code: 'PROVIDER_API_ERROR',
        status: 502,
        message: `Stripe API returned HTTP ${resp.status}.`,
      };
    }
    const data = (await resp.json()) as { id?: string; url?: string };
    return {
      ok: true,
      checkoutStatus: 'session_created',
      provider: 'stripe',
      sessionId: data.id,
      checkoutUrl: data.url,
      message: 'Stripe checkout session initiated.',
    };
  }

  if ((input.preferredProvider === 'safepay' || (!input.preferredProvider && safepayKey)) && safepayKey) {
    const resp = await fetcher('https://sandbox.api.getsafepay.com/order/v1/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SFPY-MERCHANT-SECRET': safepayKey,
      },
      body: JSON.stringify({
        client: env.SAFEPAY_API_KEY?.trim() || 'configured',
        amount: amountCents / 100,
        currency: 'USD',
        environment: env.NODE_ENV === 'production' ? 'production' : 'sandbox',
        metadata: { workspaceId: input.workspaceId, targetTier: input.targetTier },
      }),
    });
    if (!resp.ok) {
      return {
        ok: false,
        code: 'PROVIDER_API_ERROR',
        status: 502,
        message: `Safepay API returned HTTP ${resp.status}.`,
      };
    }
    const data = (await resp.json()) as { data?: { token?: string } };
    return {
      ok: true,
      checkoutStatus: 'session_created',
      provider: 'safepay',
      sessionId: data.data?.token,
      message: 'Safepay sandbox checkout session initialized.',
    };
  }

  return {
    ok: false,
    code: 'BLOCKED_EXTERNAL_PROVIDER_REQUIRED',
    status: 501,
    message: 'Requested payment provider is not configured for automated server checkout.',
  };
}
