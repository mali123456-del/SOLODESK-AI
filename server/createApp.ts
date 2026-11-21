import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { createApiV1Router } from './api/v1/router';
import { openSqliteDatabase } from './database/sqliteDb';
import { sendApiError } from './middleware/auth';
import { logStructured, requestTelemetryMiddleware, scrubSensitiveData } from './monitoring/telemetry';

export interface BackendAppOptions {
  sqlitePath?: string;
  distDir?: string;
  serveStatic?: boolean;
}

export function createBackendApp(options: BackendAppOptions = {}): {
  app: Express;
  db: DatabaseSync;
} {
  const db = openSqliteDatabase(options.sqlitePath ?? process.env.SOLODESK_SQLITE_PATH ?? './data/solodesk-saas.sqlite');
  const app = express();

  app.disable('x-powered-by');
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=()');
    const forwardedProto = req.headers['x-forwarded-proto'];
    if (req.secure || (typeof forwardedProto === 'string' && forwardedProto.split(',')[0]?.trim() === 'https')) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.use(
    express.json({
      limit: '6mb',
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );

  // Defense-in-depth CSRF check for mutating cookie-authenticated browser requests without Bearer token
  app.use('/api/v1', (req: Request, res: Response, next: NextFunction) => {
    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      next();
      return;
    }
    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
      next();
      return;
    }
    const cookieHeader = req.headers.cookie;
    if (typeof cookieHeader === 'string' && cookieHeader.includes('solodesk_session=')) {
      const originRaw =
        (typeof req.headers.origin === 'string' ? req.headers.origin : '') ||
        (typeof req.headers.referer === 'string' ? req.headers.referer : '');
      if (originRaw) {
        try {
          const parsedOrigin = new URL(originRaw);
          const reqHost = (req.headers.host || '').trim().toLowerCase();
          if (reqHost && parsedOrigin.host.toLowerCase() !== reqHost) {
            sendApiError(
              res,
              403,
              'CSRF_ORIGIN_MISMATCH',
              'Cross-origin cookie-authenticated mutation blocked.',
              req
            );
            return;
          }
        } catch {
          sendApiError(res, 403, 'CSRF_ORIGIN_MISMATCH', 'Invalid request Origin header.', req);
          return;
        }
      }
    }
    next();
  });

  app.use(requestTelemetryMiddleware);

  app.use('/api/v1', createApiV1Router(db));

  if (options.serveStatic) {
    const distDir = path.resolve(options.distDir ?? 'dist');
    app.use(express.static(distDir));
    app.get(/^(?!\/api\/).*/, (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const isSyntax = err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400;
    const rawMsg = err instanceof Error ? err.message : 'Unexpected server error.';
    const safeMsg = String(scrubSensitiveData(rawMsg));
    if (isSyntax) {
      sendApiError(res, 400, 'INVALID_JSON', 'Malformed JSON request body.', req);
      return;
    }
    logStructured('error', 'unhandled_express_error', {
      path: req.path,
      method: req.method,
      error: safeMsg,
    });
    sendApiError(res, 500, 'INTERNAL_ERROR', 'An unexpected internal error occurred.', req);
  });

  return { app, db };
}
