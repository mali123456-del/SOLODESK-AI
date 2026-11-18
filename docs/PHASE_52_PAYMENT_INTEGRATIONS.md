# Phase 52 — Payment Provider Adapters & Honesty Gate

- **Connector Registry (`src/integrations/paymentConnectors.ts`):**
  - Defines structured provider metadata for `payfast_pk`, `safepay`, `jazzcash`, and `stripe` covering PK/global multi-currency support (`PKR`, `USD`), webhook requirements, and credential status.
  - `initiateHostedCheckoutSession(input)`: validates positive decimal amount via `big.js`, then **honestly returns `{ blocked: true, status: 'blocked_external_credentials' }`** rather than faking a checkout session when merchant API keys are absent.
  - `verifyPaymentWebhookPayload(...)`: performs server-grade HMAC-SHA256 verification, duplicate `eventId` idempotency detection (`payment_webhook_events` table), currency normalization check, and decimal amount comparison.
- **Live Transaction Status:** Live checkout execution remains `BLOCKED — EXTERNAL REQUIREMENT` until merchant API credentials and HTTPS webhook callbacks are configured.
