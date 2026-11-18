import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { validatePublicHttpUrl } from '../../src/security/urlPolicy';

export function signHmacSha256(secret: string, bodyJson: string): string {
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(bodyJson).digest('hex');
}

export function registerServerWebhook(
  db: DatabaseSync,
  input: {
    workspaceId: string;
    actorUserId: string;
    name: string;
    url: string;
    eventType: string;
    secret?: string;
  }
) {
  const urlCheck = validatePublicHttpUrl(input.url);
  if (!urlCheck.valid || !urlCheck.normalizedUrl) {
    db.prepare(
      `INSERT INTO audit_logs (id, workspace_id, actor_user_id, event_type, severity, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `aud_${crypto.randomUUID()}`,
      input.workspaceId,
      input.actorUserId,
      'webhook_ssrf_blocked',
      'warning',
      `Blocked unsafe webhook destination "${input.url}": ${urlCheck.reason ?? 'Policy denied'}`,
      new Date().toISOString()
    );
    throw new Error(urlCheck.reason || 'Webhook destination violates SSRF policy.');
  }

  const now = new Date().toISOString();
  const id = `whk_${crypto.randomUUID()}`;
  const secretHash = input.secret
    ? crypto.createHash('sha256').update(input.secret).digest('hex')
    : '';

  db.prepare(
    `INSERT INTO webhooks (id, workspace_id, name, url, event_type, secret_hash, enabled, last_status, last_attempt_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, 'Registered', '', ?)`
  ).run(id, input.workspaceId, input.name.trim(), urlCheck.normalizedUrl, input.eventType, secretHash, now);

  return {
    id,
    workspaceId: input.workspaceId,
    name: input.name.trim(),
    url: urlCheck.normalizedUrl,
    eventType: input.eventType,
    enabled: true,
    createdAt: now,
  };
}

export async function dispatchServerWebhookTest(
  db: DatabaseSync,
  input: {
    workspaceId: string;
    webhookId: string;
    signingSecret?: string;
    fetchImpl?: typeof fetch;
  }
) {
  const hook = db
    .prepare('SELECT id, workspace_id, url, event_type FROM webhooks WHERE id = ? AND workspace_id = ?')
    .get(input.webhookId, input.workspaceId) as
    | { id: string; workspace_id: string; url: string; event_type: string }
    | undefined;

  if (!hook) {
    throw new Error('WEBHOOK_NOT_FOUND');
  }

  const urlCheck = validatePublicHttpUrl(hook.url);
  if (!urlCheck.valid || !urlCheck.normalizedUrl) {
    throw new Error(urlCheck.reason || 'SSRF validation failed');
  }

  const deliveryId = `del_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const bodyJson = JSON.stringify({
    source: 'SOLODESK AI',
    deliveryId,
    workspaceId: hook.workspace_id,
    eventType: hook.event_type,
    test: true,
    timestamp: now,
  });
  const sig = signHmacSha256(input.signingSecret ?? '', bodyJson);

  let statusCode = 0;
  let ok = false;
  let errorMessage = '';

  const fetchFn = input.fetchImpl ?? fetch;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Solodesk-Delivery-Id': deliveryId,
        'X-Solodesk-Event': hook.event_type,
      };
      if (sig) {
        headers['X-Solodesk-Signature'] = `sha256=${sig}`;
      }
      const res = await fetchFn(urlCheck.normalizedUrl, {
        method: 'POST',
        headers,
        body: bodyJson,
        signal: controller.signal,
      });
      statusCode = res.status;
      ok = res.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : 'Network error during webhook dispatch';
  }

  const lastStatus = ok
    ? `HTTP ${statusCode} (Delivered)`
    : statusCode > 0
      ? `HTTP ${statusCode} (Failed)`
      : `Failed (${errorMessage || 'Network error'})`;

  db.prepare('UPDATE webhooks SET last_status = ?, last_attempt_at = ? WHERE id = ?').run(
    lastStatus,
    now,
    hook.id
  );
  db.prepare(
    `INSERT INTO webhook_deliveries (id, webhook_id, workspace_id, delivery_id, event_type, status_code, ok, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    `whd_${crypto.randomUUID()}`,
    hook.id,
    hook.workspace_id,
    deliveryId,
    hook.event_type,
    statusCode,
    ok ? 1 : 0,
    errorMessage,
    now
  );

  return { deliveryId, statusCode, ok, errorMessage, signatureIncluded: Boolean(sig) };
}

export function enqueueServerJob(
  db: DatabaseSync,
  input: {
    workspaceId: string;
    jobType: string;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
    runAt?: string;
  }
) {
  const idemKey = input.idempotencyKey?.trim() || `job_${crypto.randomUUID()}`;
  const existing = db
    .prepare('SELECT id, status, created_at FROM jobs WHERE idempotency_key = ?')
    .get(idemKey) as { id: string; status: string; created_at: string } | undefined;
  if (existing) {
    return { ...existing, deduplicated: true };
  }

  const id = `job_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO jobs (id, workspace_id, job_type, payload_json, status, idempotency_key, attempts, run_at, created_at)
     VALUES (?, ?, ?, ?, 'queued', ?, 0, ?, ?)`
  ).run(id, input.workspaceId, input.jobType, JSON.stringify(input.payload), idemKey, input.runAt ?? now, now);

  return { id, status: 'queued', created_at: now, deduplicated: false };
}

export function runDueServerJobs(db: DatabaseSync, workspaceId: string) {
  const now = new Date().toISOString();
  const due = db
    .prepare(
      `SELECT id, job_type, payload_json, attempts
       FROM jobs
       WHERE workspace_id = ? AND status = 'queued' AND run_at <= ?
       ORDER BY created_at ASC`
    )
    .all(workspaceId, now) as Array<{
    id: string;
    job_type: string;
    payload_json: string;
    attempts: number;
  }>;

  const executed: Array<{ id: string; jobType: string; status: string }> = [];
  for (const job of due) {
    db.prepare(
      `UPDATE jobs SET status = 'completed', attempts = ?, executed_at = ? WHERE id = ?`
    ).run(job.attempts + 1, now, job.id);
    db.prepare(
      `INSERT INTO audit_logs (id, workspace_id, actor_user_id, event_type, severity, detail, created_at)
       VALUES (?, ?, 'job-runner', 'background_job_completed', 'info', ?, ?)`
    ).run(
      `aud_${crypto.randomUUID()}`,
      workspaceId,
      `Executed job ${job.job_type} (${job.id})`,
      now
    );
    executed.push({ id: job.id, jobType: job.job_type, status: 'completed' });
  }

  return { executedCount: executed.length, executed };
}
