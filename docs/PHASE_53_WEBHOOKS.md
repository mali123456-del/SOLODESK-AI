# Phase 53 — Outbound & Payment Webhooks, Replay Protection & Secret Rotation

Implemented in `server/jobs/jobRunner.ts`, `server/api/v1/router.ts`, and `server/database/sqliteDb.ts`:
- **HMAC-SHA256 Signing & Timestamp Replay Window (`verifyWebhookSignatureAndTimestamp`):**
  - Verifies signature header (`X-Solodesk-Signature`) over `${timestamp}.${rawBody}` using `timingSafeEqual`.
  - Rejects stale timestamps outside a strict 300-second (5-minute) tolerance window to prevent replay attacks.
- **Secret Rotation (`POST /api/v1/webhooks/:webhookId/rotate-secret`):**
  - RBAC-restricted (`owner`/`admin`) endpoint generating a new 32-byte cryptographically random secret, recording rotation audit events without returning plaintext secrets in subsequent reads.
- **Event Delivery & Idempotency:** SQLite `webhook_deliveries` and `payment_webhook_events` prevent duplicate processing of identical provider event IDs. Verified in `tests/integration/phase36-60-backend.test.ts`.
