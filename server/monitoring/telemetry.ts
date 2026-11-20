import { trace } from '@opentelemetry/api';
import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';

export const tracer = trace.getTracer('solodesk-saas-backend', '1.0.0');

const SENSITIVE_KEY_RE =
  /password|token|secret|apikey|api_key|authorization|cookie|x-gemini-key|passphrase|credential|private_?key/i;

function scrubStringSecrets(input: string): string {
  return input
    .replace(/AIza[0-9A-Za-z_-]{16,}/g, '[REDACTED_KEY]')
    .replace(/sk-[0-9A-Za-z_-]{16,}/g, '[REDACTED_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/\bsd(?:r|i|wh)?_[0-9a-f]{16,}\b/gi, '[REDACTED_TOKEN]');
}

export function scrubSensitiveData(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return scrubStringSecrets(value);
  }
  if (Array.isArray(value)) {
    return value.map(scrubSensitiveData);
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = scrubSensitiveData(v);
      }
    }
    return out;
  }
  return value;
}

export function logStructured(
  level: 'info' | 'warn' | 'error',
  event: string,
  meta: Record<string, unknown> = {}
): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...((scrubSensitiveData(meta) as Record<string, unknown>) ?? {}),
  };
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(entry));
  } else if (process.env.NODE_ENV !== 'test') {
    console.info(JSON.stringify(entry));
  }
}

export interface ServerMetricsSnapshot {
  totalRequests: number;
  errorResponses: number;
  aiCalls: number;
  syncPushCount: number;
}

export const serverMetrics: ServerMetricsSnapshot = {
  totalRequests: 0,
  errorResponses: 0,
  aiCalls: 0,
  syncPushCount: 0,
};

export function requestTelemetryMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId =
    (typeof req.headers['x-request-id'] === 'string' && req.headers['x-request-id']) ||
    `req_${crypto.randomUUID()}`;
  const startNs = process.hrtime.bigint();
  res.setHeader('X-Request-Id', requestId);
  (req as Request & { requestId?: string }).requestId = requestId;
  serverMetrics.totalRequests += 1;

  const span = tracer.startSpan(`${req.method} ${req.path}`);
  span.setAttribute('http.request_id', requestId);

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;
    if (res.statusCode >= 500) {
      serverMetrics.errorResponses += 1;
    }
    span.setAttribute('http.status_code', res.statusCode);
    span.setAttribute('http.duration_ms', Number(durationMs.toFixed(2)));
    span.end();

    if (req.path.startsWith('/api/')) {
      logStructured(res.statusCode >= 500 ? 'error' : 'info', 'http_request', {
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
      });
    }
  });

  next();
}
