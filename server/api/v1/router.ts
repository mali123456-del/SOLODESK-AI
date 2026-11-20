import crypto from 'node:crypto';
import express, { type Request, type Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  acceptWorkspaceInvitation,
  confirmPasswordReset,
  createWorkspaceInvitation,
  deleteUserAccount,
  getMemberRole,
  loginUser,
  registerUser,
  requestPasswordReset,
  resolveSessionUser,
  revokeSession,
} from '../../auth/authService';
import { generateWithServerGemini, GatewayError } from '../../ai/geminiGateway';
import { getAppliedMigrations } from '../../database/sqliteDb';
import {
  dispatchServerWebhookTest,
  enqueueServerJob,
  registerServerWebhook,
  rotateWebhookSecret,
  runDueServerJobs,
} from '../../jobs/jobRunner';
import {
  createRequireAuthMiddleware,
  extractSessionToken,
  requireWorkspaceRole,
  sendApiError,
  SESSION_COOKIE_NAME,
  type AuthenticatedRequest,
} from '../../middleware/auth';
import { serverMetrics } from '../../monitoring/telemetry';
import { indexKnowledgeDocumentOnServer, searchServerRag } from '../../rag/ragService';
import type { WorkspaceMemberRole } from '../../../src/services/cloudSyncService';

const registerSchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(120),
});

const loginSchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(1).max(128),
});

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/),
});

const addMemberSchema = z.object({
  userEmail: z.string().email().max(160),
  role: z.enum(['admin', 'manager', 'collaborator', 'client_viewer']),
});

const syncPushSchema = z.object({
  workspaceId: z.string().min(1),
  changes: z
    .array(
      z.object({
        id: z.string().min(1),
        entityType: z.string().min(1).max(64),
        entityId: z.string().min(1).max(120),
        operation: z.enum(['upsert', 'delete']),
        revision: z.number().int().min(1),
        payloadJson: z.string().max(250_000),
        updatedAt: z.string().min(1),
      })
    )
    .max(200),
});

const storageUploadSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1).max(180),
  mimeType: z.string().trim().min(1).max(120),
  classification: z.enum(['public', 'client_shared', 'internal', 'confidential']),
  contentBase64: z.string().min(1).max(6_800_000),
});

const aiGenerateSchema = z.object({
  workspaceId: z.string().optional(),
  agentId: z.string().max(64).optional(),
  provider: z.enum(['gemini', 'openai_compatible', 'ollama']).optional().default('gemini'),
  model: z.string().max(80).optional(),
  prompt: z.string().trim().min(1).max(20_000),
  context: z.string().max(32_000).optional(),
  systemInstruction: z.string().max(8_000).optional(),
  maxOutputTokens: z.number().int().min(16).max(4096).optional(),
});

const ragDocSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(200_000),
  collection: z.string().max(80).optional(),
  accessScope: z.enum(['workspace', 'client_portal', 'internal_only']).default('workspace'),
  licenseOrRights: z.string().max(200).optional(),
  sourceType: z.string().max(40).optional(),
});

const ragSearchSchema = z.object({
  workspaceId: z.string().min(1),
  query: z.string().trim().min(1).max(1000),
  topK: z.number().int().min(1).max(15).optional().default(4),
  requestedScope: z.enum(['workspace', 'client_portal', 'internal_only']).optional(),
});

const webhookCreateSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  url: z.string().trim().min(1).max(1000),
  eventType: z.string().trim().min(1).max(80),
  secret: z.string().max(200).optional(),
});

const supportRequestSchema = z.object({
  workspaceId: z.string().min(1),
  category: z.enum(['billing_upgrade', 'payment_gateway', 'technical_support', 'enterprise']),
  subject: z.string().trim().min(3).max(160),
  details: z.string().trim().min(5).max(3000),
});

function isHttpsRequest(req: Request): boolean {
  const forwardedProto = req.headers['x-forwarded-proto'];
  if (typeof forwardedProto === 'string' && forwardedProto.split(',')[0]?.trim() === 'https') {
    return true;
  }
  return Boolean(req.secure);
}

function setSessionCookie(req: Request, res: Response, token: string, expiresAt: string): void {
  const maxAgeSec = Math.max(60, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
  const secureAttr = isHttpsRequest(req) ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secureAttr}; Max-Age=${maxAgeSec}`
  );
}

function clearSessionCookie(req: Request, res: Response): void {
  const secureAttr = isHttpsRequest(req) ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax${secureAttr}; Max-Age=0`
  );
}

function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return `{${entries
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalizeJson(v)}`)
    .join(',')}}`;
}

function nextMonotonicTimestamp(db: DatabaseSync, workspaceId: string): string {
  const nowMs = Date.now();
  const cp = db
    .prepare('SELECT last_cursor AS lastCursor FROM sync_checkpoints WHERE workspace_id = ?')
    .get(workspaceId) as { lastCursor?: string } | undefined;
  const prevMs = cp?.lastCursor ? Date.parse(cp.lastCursor) : NaN;
  const effectiveMs = Number.isFinite(prevMs) && prevMs >= nowMs ? prevMs + 1 : nowMs;
  return new Date(effectiveMs).toISOString();
}

const portalAuditRateState = new Map<string, { count: number; resetAt: number }>();

function checkPortalAuditRateLimit(ipKey: string): boolean {
  const now = Date.now();
  const existing = portalAuditRateState.get(ipKey);
  if (!existing || now > existing.resetAt) {
    portalAuditRateState.set(ipKey, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (existing.count >= 25) {
    return false;
  }
  existing.count += 1;
  return true;
}

export function createApiV1Router(db: DatabaseSync): express.Router {
  const router = express.Router();
  const requireAuth = createRequireAuthMiddleware(db);

  const ALL_MEMBER_ROLES: WorkspaceMemberRole[] = [
    'owner',
    'admin',
    'manager',
    'collaborator',
    'client_viewer',
  ];
  const WRITE_ROLES: WorkspaceMemberRole[] = ['owner', 'admin', 'manager', 'collaborator'];
  const ADMIN_ROLES: WorkspaceMemberRole[] = ['owner', 'admin'];
  const FINANCE_ROLES: WorkspaceMemberRole[] = ['owner', 'admin', 'manager'];

  // --- Health, Readiness & OpenAPI Docs ---

  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: 'solodesk-ai-backend',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/ready', (_req: Request, res: Response) => {
    try {
      const ping = db.prepare('SELECT 1 AS ok').get() as { ok: number };
      const migrations = getAppliedMigrations(db);
      res.json({
        ok: ping.ok === 1,
        database: 'sqlite_node_builtin',
        migrationsApplied: migrations.length,
        metrics: serverMetrics,
        geminiServerKeyConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      });
    } catch (err) {
      sendApiError(
        res,
        503,
        'DB_UNAVAILABLE',
        err instanceof Error ? err.message : 'Database readiness failed.'
      );
    }
  });

  router.get('/docs', (_req: Request, res: Response) => {
    res.json({
      openapi: '3.1.0',
      info: {
        title: 'SOLODESK AI SaaS Backend API',
        version: '1.0.0',
        description:
          'Multi-tenant workspace API supporting optional authentication, incremental sync, object storage, server Gemini gateway, Hybrid RAG v3, webhooks, background jobs, and commercial catalog.',
      },
      paths: {
        '/api/v1/health': { get: { summary: 'Liveness probe' } },
        '/api/v1/ready': { get: { summary: 'Database and telemetry readiness probe' } },
        '/api/v1/auth/register': { post: { summary: 'Register user and initialize owner workspace' } },
        '/api/v1/auth/login': { post: { summary: 'Authenticate and issue HttpOnly/Bearer session' } },
        '/api/v1/auth/me': { get: { summary: 'Current user & workspace memberships' } },
        '/api/v1/sync/push': { post: { summary: 'Push incremental sync queue changes with revision conflict detection' } },
        '/api/v1/sync/pull': { get: { summary: 'Pull workspace revisions & tombstones since timestamp' } },
        '/api/v1/storage/objects': { get: { summary: 'List vault objects' }, post: { summary: 'Upload vault object' } },
        '/api/v1/ai/generate': { post: { summary: 'Server Gemini 4 Hydrogen gateway' } },
        '/api/v1/rag/documents': { post: { summary: 'Index document chunks into workspace RAG store' } },
        '/api/v1/rag/search': { post: { summary: 'Search Hybrid RAG v3 with RBAC accessScope filter' } },
        '/api/v1/webhooks': { get: { summary: 'List webhooks' }, post: { summary: 'Register SSRF-checked webhook' } },
        '/api/v1/jobs/run-due': { post: { summary: 'Execute due background jobs idempotently' } },
        '/api/v1/billing/catalog': { get: { summary: 'Plan catalog & Pakistan/global payment provider status' } },
      },
    });
  });

  // --- Auth & Account Lifecycle ---

  router.post('/auth/register', (req: Request, res: Response) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      sendApiError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid registration payload', req);
      return;
    }
    try {
      const result = registerUser(db, {
        ...parsed.data,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      setSessionCookie(req, res, result.sessionToken, result.expiresAt);
      res.status(201).json({
        ok: true,
        user: result.user,
        sessionToken: result.sessionToken,
        sessionId: result.sessionId,
        expiresAt: result.expiresAt,
        defaultWorkspaceId: result.defaultWorkspaceId,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'ACCOUNT_EXISTS') {
        sendApiError(res, 409, 'ACCOUNT_EXISTS', 'An account with this email already exists.', req);
        return;
      }
      sendApiError(res, 500, 'AUTH_ERROR', 'Unable to register account.', req);
    }
  });

  router.post('/auth/login', (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      sendApiError(res, 400, 'VALIDATION_ERROR', 'Valid email and password are required.', req);
      return;
    }
    try {
      const result = loginUser(db, {
        ...parsed.data,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      setSessionCookie(req, res, result.sessionToken, result.expiresAt);
      res.json({
        ok: true,
        user: result.user,
        sessionToken: result.sessionToken,
        sessionId: result.sessionId,
        expiresAt: result.expiresAt,
        defaultWorkspaceId: result.defaultWorkspaceId,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'RATE_LIMITED') {
        sendApiError(res, 429, 'RATE_LIMITED', 'Too many failed login attempts. Wait before retrying.', req);
        return;
      }
      sendApiError(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.', req);
    }
  });

  router.post('/auth/logout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    if (req.authSessionId && req.authUser) {
      revokeSession(db, req.authSessionId, req.authUser.id);
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  router.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const workspaces = db
      .prepare(
        `SELECT w.id, w.slug, w.name, w.plan_tier AS planTier, m.role
         FROM workspace_members m
         JOIN workspaces w ON w.id = m.workspace_id
         WHERE m.user_id = ? AND m.status = 'active'`
      )
      .all(req.authUser!.id);

    res.json({
      ok: true,
      user: req.authUser,
      sessionId: req.authSessionId,
      workspaces,
    });
  });

  router.get('/auth/sessions', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const sessions = db
      .prepare(
        `SELECT id, ip_address AS ipAddress, user_agent AS userAgent, expires_at AS expiresAt, revoked_at AS revokedAt, created_at AS createdAt
         FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`
      )
      .all(req.authUser!.id);
    res.json({ ok: true, sessions });
  });

  router.delete('/auth/sessions/:sessionId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const ok = revokeSession(db, String(req.params.sessionId), req.authUser!.id);
    if (!ok) {
      sendApiError(res, 404, 'NOT_FOUND', 'Session not found or already revoked.', req);
      return;
    }
    res.json({ ok: true });
  });

  router.get('/auth/export', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const memberships = db
      .prepare('SELECT workspace_id, role, created_at FROM workspace_members WHERE user_id = ?')
      .all(req.authUser!.id);
    const loginHistory = db
      .prepare('SELECT id, success, ip_address, reason, created_at FROM login_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
      .all(req.authUser!.id);
    res.json({
      ok: true,
      exportedAt: new Date().toISOString(),
      user: req.authUser,
      memberships,
      loginHistory,
    });
  });

  router.delete('/auth/account', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    deleteUserAccount(db, req.authUser!.id);
    clearSessionCookie(req, res);
    res.json({ ok: true, deleted: true });
  });

  router.post('/auth/password-reset/request', (req: Request, res: Response) => {
    const schema = z.object({ email: z.string().email().max(160) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      sendApiError(res, 400, 'VALIDATION_ERROR', 'Valid email is required.', req);
      return;
    }
    const result = requestPasswordReset(db, parsed.data.email);
    res.json({
      ok: true,
      emailDeliveryStatus: 'NOT_CONFIGURED_LOCAL_ONLY',
      ...(result.issued && process.env.NODE_ENV === 'test'
        ? { testResetToken: result.resetToken, expiresAt: result.expiresAt }
        : {}),
    });
  });

  router.post('/auth/password-reset/confirm', (req: Request, res: Response) => {
    const schema = z.object({
      token: z.string().min(8).max(200),
      newPassword: z.string().min(8).max(128),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      sendApiError(res, 400, 'VALIDATION_ERROR', 'Valid token and password (min 8 chars) required.', req);
      return;
    }
    const ok = confirmPasswordReset(db, parsed.data.token, parsed.data.newPassword);
    if (!ok) {
      sendApiError(res, 400, 'INVALID_OR_EXPIRED_TOKEN', 'Reset token is invalid or expired.', req);
      return;
    }
    clearSessionCookie(req, res);
    res.json({ ok: true, sessionsRevoked: true });
  });

  // --- Workspaces & RBAC Members ---

  router.get('/workspaces', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const rows = db
      .prepare(
        `SELECT w.id, w.slug, w.name, w.plan_tier AS planTier, m.role, w.created_at AS createdAt
         FROM workspace_members m
         JOIN workspaces w ON w.id = m.workspace_id
         WHERE m.user_id = ? AND m.status = 'active'`
      )
      .all(req.authUser!.id);
    res.json({ ok: true, workspaces: rows });
  });

  router.post('/workspaces', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const parsed = createWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) {
      sendApiError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid workspace', req);
      return;
    }
    const existing = db.prepare('SELECT id FROM workspaces WHERE slug = ?').get(parsed.data.slug);
    if (existing) {
      sendApiError(res, 409, 'SLUG_TAKEN', 'Workspace slug already exists.', req);
      return;
    }
    const id = `ws_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    db.exec('BEGIN;');
    try {
      db.prepare(
        'INSERT INTO workspaces (id, slug, name, owner_user_id, plan_tier, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(id, parsed.data.slug, parsed.data.name, req.authUser!.id, 'free', now, now);
      db.prepare(
        'INSERT INTO workspace_members (id, workspace_id, user_id, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(`wm_${crypto.randomUUID()}`, id, req.authUser!.id, 'owner', 'active', now);
      db.prepare(
        'INSERT INTO subscriptions (workspace_id, plan_tier, billing_provider, billing_status, seat_count, ai_tokens_used_month, sync_ops_month, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(id, 'free', 'none_configured', 'free_active', 1, 0, 0, now);
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
    res.status(201).json({ ok: true, workspace: { id, slug: parsed.data.slug, name: parsed.data.name, role: 'owner' } });
  });

  router.get(
    '/workspaces/:workspaceId/members',
    requireAuth,
    requireWorkspaceRole(db, ALL_MEMBER_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const workspaceId = req.authorizedWorkspaceId!;
      const members = db
        .prepare(
          `SELECT m.id, m.user_id AS userId, u.email, u.display_name AS displayName, m.role, m.status, m.created_at AS createdAt
           FROM workspace_members m
           JOIN users u ON u.id = m.user_id
           WHERE m.workspace_id = ?`
        )
        .all(workspaceId);
      res.json({ ok: true, callerRole: req.workspaceRole, members });
    }
  );

  router.post(
    '/workspaces/:workspaceId/members',
    requireAuth,
    requireWorkspaceRole(db, ADMIN_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const parsed = addMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid member payload', req);
        return;
      }
      const targetUser = db
        .prepare('SELECT id, email, display_name FROM users WHERE email = ? AND deleted_at IS NULL')
        .get(parsed.data.userEmail.toLowerCase()) as
        | { id: string; email: string; display_name: string }
        | undefined;
      if (!targetUser) {
        sendApiError(res, 404, 'USER_NOT_FOUND', 'No registered user found with that email.', req);
        return;
      }
      const workspaceId = req.authorizedWorkspaceId!;
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO workspace_members (id, workspace_id, user_id, role, status, created_at)
         VALUES (?, ?, ?, ?, 'active', ?)
         ON CONFLICT(workspace_id, user_id) DO UPDATE SET role = excluded.role, status = 'active'`
      ).run(`wm_${crypto.randomUUID()}`, workspaceId, targetUser.id, parsed.data.role, now);

      db.prepare(
        `INSERT INTO audit_logs (id, workspace_id, actor_user_id, event_type, severity, detail, created_at)
         VALUES (?, ?, ?, 'member_role_assigned', 'info', ?, ?)`
      ).run(
        `aud_${crypto.randomUUID()}`,
        workspaceId,
        req.authUser!.id,
        `Assigned role ${parsed.data.role} to ${targetUser.email}`,
        now
      );

      res.status(201).json({
        ok: true,
        member: {
          userId: targetUser.id,
          email: targetUser.email,
          displayName: targetUser.display_name,
          role: parsed.data.role,
        },
      });
    }
  );

  router.post(
    '/workspaces/:workspaceId/invitations',
    requireAuth,
    requireWorkspaceRole(db, ADMIN_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const schema = z.object({
        email: z.string().email().max(160),
        role: z.enum(['admin', 'manager', 'collaborator', 'client_viewer']),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid invitation', req);
        return;
      }
      const invite = createWorkspaceInvitation(db, {
        workspaceId: req.authorizedWorkspaceId!,
        invitedByUserId: req.authUser!.id,
        email: parsed.data.email,
        role: parsed.data.role,
      });
      res.status(201).json({
        ok: true,
        invitation: {
          id: invite.id,
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt,
          ...(process.env.NODE_ENV === 'test' ? { testInviteToken: invite.inviteToken } : {}),
        },
      });
    }
  );

  router.post(
    '/workspaces/invitations/accept',
    requireAuth,
    (req: AuthenticatedRequest, res: Response) => {
      const schema = z.object({ inviteToken: z.string().min(8).max(200) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(res, 400, 'VALIDATION_ERROR', 'Valid inviteToken is required.', req);
        return;
      }
      const outcome = acceptWorkspaceInvitation(db, {
        inviteToken: parsed.data.inviteToken,
        userId: req.authUser!.id,
        userEmail: req.authUser!.email,
      });
      if (!outcome.ok) {
        sendApiError(res, 400, 'INVITE_INVALID_OR_EXPIRED', 'Invitation is invalid, expired, or email does not match.', req);
        return;
      }
      res.json({ ok: true, workspaceId: outcome.workspaceId, role: outcome.role });
    }
  );

  // --- Cloud Sync Endpoints (Tenant-Isolated & Revision-Checked) ---

  router.post(
    '/sync/push',
    requireAuth,
    requireWorkspaceRole(db, WRITE_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const parsed = syncPushSchema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid sync batch', req);
        return;
      }

      const workspaceId = req.authorizedWorkspaceId!;
      if (parsed.data.workspaceId !== workspaceId) {
        sendApiError(res, 400, 'TENANT_PARAM_MISMATCH', 'Mismatched workspaceId in sync batch.', req);
        return;
      }
      const { changes } = parsed.data;
      const rawIdemKey = req.header('idempotency-key');
      const idempotencyKey =
        typeof rawIdemKey === 'string' && rawIdemKey.trim().length > 0
          ? rawIdemKey.trim().slice(0, 128)
          : '';
      const requestHash = crypto
        .createHash('sha256')
        .update(canonicalizeJson({ workspaceId, changes }))
        .digest('hex');

      const ackedIds: string[] = [];
      const conflicts: Array<{
        id: string;
        reason: string;
        serverRevision: number;
        serverUpdatedAt: string;
      }> = [];

      db.exec('BEGIN IMMEDIATE;');
      try {
        if (idempotencyKey) {
          const prior = db
            .prepare(
              'SELECT request_hash AS requestHash, response_json AS responseJson FROM sync_idempotency_keys WHERE workspace_id = ? AND idempotency_key = ?'
            )
            .get(workspaceId, idempotencyKey) as
            | { requestHash: string; responseJson: string }
            | undefined;

          if (prior) {
            db.exec('ROLLBACK;');
            if (prior.requestHash !== requestHash) {
              sendApiError(
                res,
                409,
                'IDEMPOTENCY_KEY_CONFLICT',
                'Idempotency-Key was reused with a different sync payload.',
                req
              );
              return;
            }
            const replay = JSON.parse(prior.responseJson) as Record<string, unknown>;
            res.json({ ...replay, idempotentReplay: true });
            return;
          }
        }

        const now = nextMonotonicTimestamp(db, workspaceId);

        for (const item of changes) {
          const existing = db
            .prepare(
              'SELECT revision, updated_at AS updatedAt FROM sync_records WHERE workspace_id = ? AND entity_type = ? AND entity_id = ?'
            )
            .get(workspaceId, item.entityType, item.entityId) as
            | { revision: number; updatedAt: string }
            | undefined;

          const tombstone = db
            .prepare(
              'SELECT revision, deleted_at AS deletedAt FROM sync_tombstones WHERE workspace_id = ? AND entity_type = ? AND entity_id = ?'
            )
            .get(workspaceId, item.entityType, item.entityId) as
            | { revision: number; deletedAt: string }
            | undefined;

          if (existing && item.revision <= existing.revision) {
            conflicts.push({
              id: item.id,
              reason: `Concurrent or stale client revision ${item.revision} (server is already at revision ${existing.revision})`,
              serverRevision: existing.revision,
              serverUpdatedAt: existing.updatedAt,
            });
            continue;
          }

          if (tombstone && item.revision <= tombstone.revision) {
            conflicts.push({
              id: item.id,
              reason: `Entity was deleted at revision ${tombstone.revision}; client revision ${item.revision} cannot overwrite tombstone.`,
              serverRevision: tombstone.revision,
              serverUpdatedAt: tombstone.deletedAt,
            });
            continue;
          }

          const nextRevision = item.revision;
          if (item.operation === 'delete') {
            db.prepare(
              'DELETE FROM sync_records WHERE workspace_id = ? AND entity_type = ? AND entity_id = ?'
            ).run(workspaceId, item.entityType, item.entityId);
            db.prepare(
              `INSERT INTO sync_tombstones (workspace_id, entity_type, entity_id, revision, deleted_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(workspace_id, entity_type, entity_id) DO UPDATE SET revision = excluded.revision, deleted_at = excluded.deleted_at`
            ).run(workspaceId, item.entityType, item.entityId, nextRevision, now);
          } else {
            db.prepare(
              'DELETE FROM sync_tombstones WHERE workspace_id = ? AND entity_type = ? AND entity_id = ?'
            ).run(workspaceId, item.entityType, item.entityId);
            db.prepare(
              `INSERT INTO sync_records (workspace_id, entity_type, entity_id, revision, operation, payload_json, updated_at, updated_by_user_id)
               VALUES (?, ?, ?, ?, 'upsert', ?, ?, ?)
               ON CONFLICT(workspace_id, entity_type, entity_id) DO UPDATE SET
                 revision = excluded.revision,
                 payload_json = excluded.payload_json,
                 updated_at = excluded.updated_at,
                 updated_by_user_id = excluded.updated_by_user_id`
            ).run(workspaceId, item.entityType, item.entityId, nextRevision, item.payloadJson, now, req.authUser!.id);
          }
          ackedIds.push(item.id);
        }

        db.prepare(
          'UPDATE subscriptions SET sync_ops_month = sync_ops_month + ?, updated_at = ? WHERE workspace_id = ?'
        ).run(ackedIds.length, now, workspaceId);

        db.prepare(
          `INSERT INTO sync_checkpoints (workspace_id, last_cursor, last_synced_at, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(workspace_id) DO UPDATE SET last_cursor = excluded.last_cursor, last_synced_at = excluded.last_synced_at, updated_at = excluded.updated_at`
        ).run(workspaceId, now, now, now);

        const responsePayload = {
          ok: true,
          ackedIds,
          conflicts,
          serverTimestamp: now,
        };

        if (idempotencyKey) {
          db.prepare(
            `INSERT INTO sync_idempotency_keys (workspace_id, idempotency_key, request_hash, response_json, created_at)
             VALUES (?, ?, ?, ?, ?)`
          ).run(workspaceId, idempotencyKey, requestHash, JSON.stringify(responsePayload), now);
        }

        db.exec('COMMIT;');
        serverMetrics.syncPushCount += 1;
        res.json(responsePayload);
      } catch (err) {
        try {
          db.exec('ROLLBACK;');
        } catch {
          // Transaction may already be rolled back
        }
        throw err;
      }
    }
  );

  router.get(
    '/sync/pull',
    requireAuth,
    requireWorkspaceRole(db, ALL_MEMBER_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const pullQuerySchema = z.object({
        since: z.string().max(64).optional().default(''),
        cursor: z.string().max(512).optional().default(''),
        limit: z.coerce.number().int().min(1).max(500).optional().default(500),
      });
      const parsedQuery = pullQuerySchema.safeParse({
        since: req.query.since,
        cursor: req.query.cursor,
        limit: req.query.limit,
      });
      if (!parsedQuery.success) {
        sendApiError(res, 400, 'VALIDATION_ERROR', 'Invalid sync pull query parameters.', req);
        return;
      }

      const workspaceId = req.authorizedWorkspaceId!;
      const { since, cursor, limit } = parsedQuery.data;

      type KeysetTuple = [string, string, string];
      let recordCursor: KeysetTuple | null = null;
      let tombstoneCursor: KeysetTuple | null = null;

      if (cursor) {
        try {
          const decoded = JSON.parse(
            Buffer.from(cursor, 'base64url').toString('utf8')
          ) as { r?: KeysetTuple; t?: KeysetTuple };
          if (
            Array.isArray(decoded.r) &&
            decoded.r.length === 3 &&
            decoded.r.every((v) => typeof v === 'string')
          ) {
            recordCursor = decoded.r;
          }
          if (
            Array.isArray(decoded.t) &&
            decoded.t.length === 3 &&
            decoded.t.every((v) => typeof v === 'string')
          ) {
            tombstoneCursor = decoded.t;
          }
        } catch {
          sendApiError(res, 400, 'VALIDATION_ERROR', 'Malformed sync cursor token.', req);
          return;
        }
      }

      const recordsPlusOne = recordCursor
        ? (db
            .prepare(
              `SELECT entity_type AS entityType, entity_id AS entityId, revision, payload_json AS payloadJson, updated_at AS updatedAt
               FROM sync_records
               WHERE workspace_id = ?
                 AND (
                   updated_at > ?
                   OR (updated_at = ? AND (entity_type > ? OR (entity_type = ? AND entity_id > ?)))
                 )
               ORDER BY updated_at ASC, entity_type ASC, entity_id ASC LIMIT ?`
            )
            .all(
              workspaceId,
              recordCursor[0],
              recordCursor[0],
              recordCursor[1],
              recordCursor[1],
              recordCursor[2],
              limit + 1
            ) as Array<{
            entityType: string;
            entityId: string;
            revision: number;
            payloadJson: string;
            updatedAt: string;
          }>)
        : (db
            .prepare(
              `SELECT entity_type AS entityType, entity_id AS entityId, revision, payload_json AS payloadJson, updated_at AS updatedAt
               FROM sync_records
               WHERE workspace_id = ? AND updated_at > ?
               ORDER BY updated_at ASC, entity_type ASC, entity_id ASC LIMIT ?`
            )
            .all(workspaceId, since, limit + 1) as Array<{
            entityType: string;
            entityId: string;
            revision: number;
            payloadJson: string;
            updatedAt: string;
          }>);

      const tombstonesPlusOne = tombstoneCursor
        ? (db
            .prepare(
              `SELECT entity_type AS entityType, entity_id AS entityId, revision, deleted_at AS deletedAt
               FROM sync_tombstones
               WHERE workspace_id = ?
                 AND (
                   deleted_at > ?
                   OR (deleted_at = ? AND (entity_type > ? OR (entity_type = ? AND entity_id > ?)))
                 )
               ORDER BY deleted_at ASC, entity_type ASC, entity_id ASC LIMIT ?`
            )
            .all(
              workspaceId,
              tombstoneCursor[0],
              tombstoneCursor[0],
              tombstoneCursor[1],
              tombstoneCursor[1],
              tombstoneCursor[2],
              limit + 1
            ) as Array<{
            entityType: string;
            entityId: string;
            revision: number;
            deletedAt: string;
          }>)
        : (db
            .prepare(
              `SELECT entity_type AS entityType, entity_id AS entityId, revision, deleted_at AS deletedAt
               FROM sync_tombstones
               WHERE workspace_id = ? AND deleted_at > ?
               ORDER BY deleted_at ASC, entity_type ASC, entity_id ASC LIMIT ?`
            )
            .all(workspaceId, since, limit + 1) as Array<{
            entityType: string;
            entityId: string;
            revision: number;
            deletedAt: string;
          }>);

      const hasMore = recordsPlusOne.length > limit || tombstonesPlusOne.length > limit;
      const records = recordsPlusOne.slice(0, limit);
      const tombstones = tombstonesPlusOne.slice(0, limit);
      const lastRec = records.at(-1);
      const lastTomb = tombstones.at(-1);
      const nextRecordTuple: KeysetTuple | undefined = lastRec
        ? [lastRec.updatedAt, lastRec.entityType, lastRec.entityId]
        : recordCursor ?? undefined;
      const nextTombTuple: KeysetTuple | undefined = lastTomb
        ? [lastTomb.deletedAt, lastTomb.entityType, lastTomb.entityId]
        : tombstoneCursor ?? undefined;

      const nextPageCursor =
        nextRecordTuple || nextTombTuple
          ? Buffer.from(
              JSON.stringify({
                ...(nextRecordTuple ? { r: nextRecordTuple } : {}),
                ...(nextTombTuple ? { t: nextTombTuple } : {}),
              }),
              'utf8'
            ).toString('base64url')
          : '';

      const maxRecordTs = lastRec?.updatedAt ?? '';
      const maxTombstoneTs = lastTomb?.deletedAt ?? '';
      const nextCursor = [since, maxRecordTs, maxTombstoneTs].sort().at(-1) || '';

      res.json({
        ok: true,
        serverTimestamp: new Date().toISOString(),
        records,
        tombstones,
        hasMore,
        nextCursor,
        nextPageCursor,
      });
    }
  );

  router.get(
    '/sync/checkpoint',
    requireAuth,
    requireWorkspaceRole(db, ALL_MEMBER_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const workspaceId = req.authorizedWorkspaceId!;
      const cp = db
        .prepare(
          'SELECT workspace_id AS workspaceId, last_cursor AS lastCursor, last_synced_at AS lastSyncedAt, updated_at AS updatedAt FROM sync_checkpoints WHERE workspace_id = ?'
        )
        .get(workspaceId);
      res.json({ ok: true, checkpoint: cp ?? null });
    }
  );

  // --- Object Storage ---

  router.get(
    '/storage/objects',
    requireAuth,
    requireWorkspaceRole(db, ALL_MEMBER_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const workspaceId = req.authorizedWorkspaceId!;
      const rows = db
        .prepare(
          `SELECT id, name, mime_type AS mimeType, size_bytes AS sizeBytes, sha256, classification, created_at AS createdAt
           FROM vault_objects
           WHERE workspace_id = ?
           ORDER BY created_at DESC`
        )
        .all(workspaceId) as Array<{
        id: string;
        name: string;
        mimeType: string;
        sizeBytes: number;
        sha256: string;
        classification: string;
        createdAt: string;
      }>;

      const filtered =
        req.workspaceRole === 'client_viewer'
          ? rows.filter((r) => r.classification === 'public' || r.classification === 'client_shared')
          : rows;

      res.json({ ok: true, objects: filtered });
    }
  );

  router.post(
    '/storage/objects',
    requireAuth,
    requireWorkspaceRole(db, WRITE_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const parsed = storageUploadSchema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid storage object', req);
        return;
      }

      const workspaceId = req.authorizedWorkspaceId!;
      const safeName = parsed.data.name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120);
      const buffer = Buffer.from(parsed.data.contentBase64, 'base64');
      if (buffer.byteLength > 5_000_000) {
        sendApiError(res, 413, 'FILE_TOO_LARGE', 'File exceeds 5MB storage limit.', req);
        return;
      }

      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      const id = `obj_${crypto.randomUUID()}`;
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO vault_objects (id, workspace_id, name, mime_type, size_bytes, sha256, classification, content_base64, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        workspaceId,
        safeName,
        parsed.data.mimeType,
        buffer.byteLength,
        sha256,
        parsed.data.classification,
        parsed.data.contentBase64,
        req.authUser!.id,
        now
      );

      res.status(201).json({
        ok: true,
        object: {
          id,
          name: safeName,
          mimeType: parsed.data.mimeType,
          sizeBytes: buffer.byteLength,
          sha256,
          classification: parsed.data.classification,
          createdAt: now,
        },
      });
    }
  );

  // --- Server-Side AI Gateway (with optional BYOK header or server GEMINI_API_KEY) ---

  router.post('/ai/generate', async (req: AuthenticatedRequest, res: Response) => {
    const parsed = aiGenerateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendApiError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid AI prompt', req);
      return;
    }

    const token = extractSessionToken(req);
    const resolvedSession = token ? resolveSessionUser(db, token) : null;
    const requestedWorkspaceId = parsed.data.workspaceId?.trim() || '';

    if (requestedWorkspaceId) {
      if (!resolvedSession) {
        sendApiError(res, 401, 'UNAUTHORIZED', 'Authentication required to charge or scope AI generation to a workspace.', req);
        return;
      }
      const role = getMemberRole(db, requestedWorkspaceId, resolvedSession.user.id);
      if (!role) {
        sendApiError(res, 403, 'TENANT_ACCESS_DENIED', 'You do not have active membership in the requested workspace.', req);
        return;
      }
      if (!WRITE_ROLES.includes(role)) {
        sendApiError(res, 403, 'INSUFFICIENT_ROLE', `Role "${role}" is not authorized for workspace AI generation.`, req);
        return;
      }
    }

    const headerKey =
      typeof req.headers['x-gemini-key'] === 'string' ? req.headers['x-gemini-key'] : undefined;

    try {
      const output = await generateWithServerGemini(db, {
        ...parsed.data,
        workspaceId: requestedWorkspaceId || undefined,
        sessionGeminiKey: headerKey,
        userId: resolvedSession?.user.id ?? req.authUser?.id,
      });
      res.json({ ok: true, ...output });
    } catch (err) {
      if (err instanceof GatewayError) {
        sendApiError(res, err.status, err.code, err.message, req);
        return;
      }
      sendApiError(res, 500, 'AI_GATEWAY_ERROR', 'Unexpected AI gateway failure.', req);
    }
  });

  router.get(
    '/ai/usage',
    requireAuth,
    requireWorkspaceRole(db, ALL_MEMBER_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const workspaceId = req.authorizedWorkspaceId!;
      const records = db
        .prepare(
          `SELECT id, agent_id AS agentId, model, prompt_chars AS promptChars, completion_chars AS completionChars, estimated_cost_usd AS estimatedCostUsd, latency_ms AS latencyMs, status, created_at AS createdAt
           FROM ai_usage_records WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100`
        )
        .all(workspaceId);
      res.json({ ok: true, records });
    }
  );

  // --- Server Hybrid RAG v3 ---

  router.post(
    '/rag/documents',
    requireAuth,
    requireWorkspaceRole(db, WRITE_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const parsed = ragDocSchema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid document', req);
        return;
      }
      const result = indexKnowledgeDocumentOnServer(db, {
        ...parsed.data,
        workspaceId: req.authorizedWorkspaceId!,
      });
      res.status(201).json({ ok: true, ...result });
    }
  );

  router.post(
    '/rag/search',
    requireAuth,
    requireWorkspaceRole(db, ALL_MEMBER_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const parsed = ragSearchSchema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid RAG query', req);
        return;
      }
      const result = searchServerRag(db, {
        workspaceId: req.authorizedWorkspaceId!,
        query: parsed.data.query,
        topK: parsed.data.topK,
        requestedScope: parsed.data.requestedScope,
        callerRole: req.workspaceRole!,
      });
      res.json({ ok: true, ...result });
    }
  );

  // --- Background Jobs & SSRF-Safe Webhooks ---

  router.get(
    '/jobs',
    requireAuth,
    requireWorkspaceRole(db, ALL_MEMBER_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const workspaceId = req.authorizedWorkspaceId!;
      const jobs = db
        .prepare(
          'SELECT id, job_type AS jobType, status, attempts, run_at AS runAt, executed_at AS executedAt, created_at AS createdAt FROM jobs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 50'
        )
        .all(workspaceId);
      res.json({ ok: true, jobs });
    }
  );

  router.post(
    '/jobs/enqueue',
    requireAuth,
    requireWorkspaceRole(db, WRITE_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const schema = z.object({
        workspaceId: z.string().min(1),
        jobType: z.string().trim().min(1).max(80),
        payload: z.record(z.string(), z.unknown()).default({}),
        idempotencyKey: z.string().max(120).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(res, 400, 'VALIDATION_ERROR', 'Invalid job enqueue payload.', req);
        return;
      }
      const job = enqueueServerJob(db, {
        ...parsed.data,
        workspaceId: req.authorizedWorkspaceId!,
      });
      res.status(201).json({ ok: true, job });
    }
  );

  router.post(
    '/jobs/run-due',
    requireAuth,
    requireWorkspaceRole(db, ADMIN_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const workspaceId = req.authorizedWorkspaceId!;
      const outcome = runDueServerJobs(db, workspaceId);
      res.json({ ok: true, ...outcome });
    }
  );

  router.get(
    '/webhooks',
    requireAuth,
    requireWorkspaceRole(db, ADMIN_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const workspaceId = req.authorizedWorkspaceId!;
      const hooks = db
        .prepare(
          'SELECT id, name, url, event_type AS eventType, enabled, last_status AS lastStatus, last_attempt_at AS lastAttemptAt, created_at AS createdAt FROM webhooks WHERE workspace_id = ?'
        )
        .all(workspaceId);
      res.json({ ok: true, webhooks: hooks });
    }
  );

  router.post(
    '/webhooks',
    requireAuth,
    requireWorkspaceRole(db, ADMIN_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const parsed = webhookCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid webhook', req);
        return;
      }
      try {
        const hook = registerServerWebhook(db, {
          ...parsed.data,
          workspaceId: req.authorizedWorkspaceId!,
          actorUserId: req.authUser!.id,
        });
        res.status(201).json({ ok: true, webhook: hook });
      } catch (err) {
        sendApiError(
          res,
          400,
          'WEBHOOK_POLICY_BLOCKED',
          err instanceof Error ? err.message : 'Webhook destination blocked.',
          req
        );
      }
    }
  );

  router.post(
    '/webhooks/:webhookId/test',
    requireAuth,
    requireWorkspaceRole(db, ADMIN_ROLES),
    async (req: AuthenticatedRequest, res: Response) => {
      const workspaceId = req.authorizedWorkspaceId!;
      const signingSecret = typeof req.body?.secret === 'string' ? req.body.secret : undefined;
      try {
        const delivery = await dispatchServerWebhookTest(db, {
          workspaceId,
          webhookId: String(req.params.webhookId),
          signingSecret,
        });
        res.json({ ok: true, delivery });
      } catch (err) {
        sendApiError(
          res,
          err instanceof Error && err.message === 'WEBHOOK_NOT_FOUND' ? 404 : 400,
          'WEBHOOK_DISPATCH_ERROR',
          err instanceof Error ? err.message : 'Webhook test failed.',
          req
        );
      }
    }
  );

  router.post(
    '/webhooks/:webhookId/rotate-secret',
    requireAuth,
    requireWorkspaceRole(db, ADMIN_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const workspaceId = req.authorizedWorkspaceId!;
      const newSecret = typeof req.body?.secret === 'string' ? req.body.secret : undefined;
      const result = rotateWebhookSecret(db, {
        workspaceId,
        webhookId: String(req.params.webhookId),
        actorUserId: req.authUser!.id,
        newSecret,
      });
      if (!result.rotated) {
        sendApiError(res, 404, 'WEBHOOK_NOT_FOUND', 'Webhook not found.', req);
        return;
      }
      res.json({ ok: true, rotated: true, nextSecretPreview: result.nextSecretPreview });
    }
  );

  // --- Commercial Billing Catalog, Pakistan Payment Readiness & Support Requests ---

  router.get('/billing/catalog', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      checkoutStatus: 'BLOCKED_EXTERNAL_PROVIDER_REQUIRED',
      pakistanPaymentGuidance: {
        stripeDirectInPakistan: 'UNSUPPORTED_WITHOUT_FOREIGN_ENTITY',
        supportedLocalOrExporterPaths: [
          'PayFast Pakistan (PKR merchant onboarding)',
          'JazzCash / Easypaisa Merchant API',
          'Safepay Pakistan (PKR & international cards)',
          'Wise Business / Payoneer Receiving Account (manual USD/GBP/EUR wire)',
        ],
        disclosure:
          'Automated card checkout is intentionally disabled because no verified merchant processor API keys are provisioned in this runtime.',
      },
      plans: [
        { id: 'free', name: 'Free Offline Solo', priceMonthlyUsd: 0, seats: 1, features: ['100% local IndexedDB PWA', 'Hybrid RAG v3', 'PDF Export'] },
        { id: 'pro', name: 'Pro Solo', priceMonthlyUsd: 15, seats: 1, features: ['Cloud Sync Outbox', 'Managed Gemini Quota', 'Recurring Automation'] },
        { id: 'ultimate', name: 'Ultimate Studio', priceMonthlyUsd: 39, seats: 3, features: ['15-Agent AI Workforce', 'Scoped Client Portal', 'BI Forecasts'] },
        { id: 'business', name: 'Business Team', priceMonthlyUsd: 29, priceUnit: 'per_seat_month', seats: 25, features: ['Multi-Tenant RBAC', 'PostgreSQL RLS', 'Audit Exports'] },
        { id: 'enterprise', name: 'Enterprise Custom', priceMonthlyUsd: null, seats: 'unlimited', features: ['Dedicated VPC / On-Premise', 'Custom SSO', 'SLA'] },
      ],
    });
  });

  router.get(
    '/billing/subscription/:workspaceId',
    requireAuth,
    requireWorkspaceRole(db, FINANCE_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const sub = db
        .prepare('SELECT * FROM subscriptions WHERE workspace_id = ?')
        .get(req.authorizedWorkspaceId!);
      res.json({ ok: true, subscription: sub ?? null });
    }
  );

  router.post(
    '/billing/support-request',
    requireAuth,
    requireWorkspaceRole(db, ALL_MEMBER_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const parsed = supportRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid request', req);
        return;
      }
      const id = `sup_${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO support_requests (id, workspace_id, user_id, category, subject, details, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`
      ).run(id, req.authorizedWorkspaceId!, req.authUser!.id, parsed.data.category, parsed.data.subject, parsed.data.details, now);
      res.status(201).json({ ok: true, supportRequest: { id, status: 'open', createdAt: now } });
    }
  );

  // --- Analytics & Security Audit Logs ---

  router.get(
    '/analytics/overview/:workspaceId',
    requireAuth,
    requireWorkspaceRole(db, FINANCE_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const workspaceId = req.authorizedWorkspaceId!;
      const syncCount = (
        db.prepare('SELECT COUNT(*) AS c FROM sync_records WHERE workspace_id = ?').get(workspaceId) as { c: number }
      ).c;
      const ragChunks = (
        db.prepare('SELECT COUNT(*) AS c FROM knowledge_chunks WHERE workspace_id = ?').get(workspaceId) as { c: number }
      ).c;
      const aiStats = db
        .prepare(
          'SELECT COUNT(*) AS calls, COALESCE(SUM(estimated_cost_usd), 0) AS totalCostUsd FROM ai_usage_records WHERE workspace_id = ?'
        )
        .get(workspaceId) as { calls: number; totalCostUsd: number };

      res.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        dataSource: 'SQLite SaaS Backend (Live Aggregate)',
        metrics: {
          syncedRecordCount: syncCount,
          serverRagChunkCount: ragChunks,
          aiGatewayCalls: aiStats.calls,
          estimatedAiCostUsd: Number((aiStats.totalCostUsd ?? 0).toFixed(6)),
        },
      });
    }
  );

  router.get(
    '/security/audit/:workspaceId',
    requireAuth,
    requireWorkspaceRole(db, ADMIN_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const workspaceId = req.authorizedWorkspaceId!;
      const logs = db
        .prepare(
          'SELECT id, actor_user_id AS actorUserId, event_type AS eventType, severity, detail, created_at AS createdAt FROM audit_logs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100'
        )
        .all(workspaceId);
      res.json({ ok: true, logs });
    }
  );

  router.post('/portal/audit', (req: Request, res: Response) => {
    if (!checkPortalAuditRateLimit(req.ip || 'unknown')) {
      sendApiError(res, 429, 'RATE_LIMITED', 'Too many portal audit events from this IP.', req);
      return;
    }
    const schema = z.object({
      workspaceId: z.string().min(1).max(80).default('local-workspace'),
      tokenPrefix: z.string().min(4).max(32),
      valid: z.boolean(),
      reason: z.string().max(200).optional().default(''),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      sendApiError(res, 400, 'VALIDATION_ERROR', 'Invalid portal audit payload', req);
      return;
    }
    const id = `pal_${crypto.randomUUID()}`;
    db.prepare(
      `INSERT INTO portal_access_logs (id, workspace_id, token_prefix, valid, reason, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      parsed.data.workspaceId,
      parsed.data.tokenPrefix,
      parsed.data.valid ? 1 : 0,
      parsed.data.reason,
      req.ip ?? '',
      new Date().toISOString()
    );
    res.status(201).json({ ok: true, id });
  });

  router.use((_req: Request, res: Response) => {
    sendApiError(res, 404, 'ROUTE_NOT_FOUND', 'API v1 endpoint not found.');
  });

  return router;
}
