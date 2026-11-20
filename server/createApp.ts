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
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  app.use(express.json({ limit: '6mb' }));
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
