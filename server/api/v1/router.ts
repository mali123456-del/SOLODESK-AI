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
import {
  checkWorkspaceEntitlement,
  getWorkspaceEntitlementSnapshot,
  type ServerPlanTier,
} from '../../billing/entitlements';
import {
  getExternalProviderReadiness,
  initiateExternalCheckoutSession,
  verifyRawBodyHmacSignature,
} from '../../billing/paymentProviders';
import { getAppliedMigrations, verifySqliteIntegrity } from '../../database/sqliteDb';
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
import {
  formatAuditLogsCsv,
  purgeExpiredAuditLogs,
  queryAuditLogs,
  writeAuditEvent,
} from '../../monitoring/auditService';
import { indexKnowledgeDocumentOnServer, searchServerRag } from '../../rag/ragService';
import {
  calculateDocumentTotals,
  getCurrencyDecimals,
} from '../../../src/domain/calculations/money';
import {
  VOICE_NOTE_ALLOWED_MIME_TYPES,
  VOICE_NOTE_MAX_BYTES,
} from '../../../src/domain/schemas/entities';
import { validatePublicHttpUrl } from '../../../src/security/urlPolicy';
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
  if (portalAuditRateState.size > 2000) {
    for (const [k, v] of portalAuditRateState.entries()) {
      if (now > v.resetAt) portalAuditRateState.delete(k);
    }
    if (portalAuditRateState.size > 5000) {
      portalAuditRateState.clear();
    }
  }
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
      const integrity = verifySqliteIntegrity(db);
      const migrations = getAppliedMigrations(db);
      const readiness = getExternalProviderReadiness();
      res.status(integrity.ok ? 200 : 503).json({
        ok: ping.ok === 1 && integrity.ok,
        database: 'sqlite_node_builtin',
        integrity: integrity.result,
        migrationsApplied: migrations.length,
        metrics: serverMetrics,
        geminiServerKeyConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
        externalProvidersConfigured: readiness.filter((p) => p.configured).map((p) => p.provider),
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
          'Multi-tenant workspace API supporting optional authentication, incremental sync, object storage, server Gemini gateway, Hybrid RAG v3, webhooks, background jobs, entitlements, privacy consents, and commercial catalog.',
      },
      paths: {
        '/api/v1/health': { get: { summary: 'Liveness probe' } },
        '/api/v1/ready': { get: { summary: 'Database integrity and telemetry readiness probe' } },
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
        '/api/v1/billing/entitlements/:workspaceId': { get: { summary: 'Authoritative workspace plan limits & live usage' } },
        '/api/v1/billing/checkout-session': { post: { summary: 'Check payment checkout readiness or initiate session' } },
        '/api/v1/billing/webhook/:provider': { post: { summary: 'Verify raw-body HMAC billing webhook and update subscription state idempotently' } },
        '/api/v1/voice-notes/:workspaceId': { get: { summary: 'List workspace voice notes' } },
        '/api/v1/voice-notes': { post: { summary: 'Store workspace voice note with MIME and 5MB cap' } },
        '/api/v1/invoices/calculate': { post: { summary: 'Authoritative big.js invoice calculation verification' } },
        '/api/v1/audit-logs/:workspaceId': { get: { summary: 'Query immutable workspace audit logs' } },
        '/api/v1/audit-logs/:workspaceId/export': { get: { summary: 'Export audit logs as CSV or JSON' } },
        '/api/v1/privacy/consents/:workspaceId': { get: { summary: 'Read workspace privacy consent records' }, put: { summary: 'Update workspace privacy consent' } },
        '/api/v1/integrations/:workspaceId': { get: { summary: 'List workspace integration adapters' }, post: { summary: 'Save integration adapter metadata' } },
        '/api/v1/integrations/provider-status': { get: { summary: 'Sanitized external staging provider readiness matrix' } },
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
      const existingMember = getMemberRole(db, workspaceId, targetUser.id);
      if (!existingMember) {
        const seatCheck = checkWorkspaceEntitlement(db, workspaceId, { kind: 'seat_assign' });
        if (!seatCheck.allowed) {
          sendApiError(res, 403, seatCheck.code, seatCheck.message, req);
          return;
        }
      }

      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO workspace_members (id, workspace_id, user_id, role, status, created_at)
         VALUES (?, ?, ?, ?, 'active', ?)
         ON CONFLICT(workspace_id, user_id) DO UPDATE SET role = excluded.role, status = 'active'`
      ).run(`wm_${crypto.randomUUID()}`, workspaceId, targetUser.id, parsed.data.role, now);

      const memberCount = (
        db
          .prepare("SELECT COUNT(*) AS c FROM workspace_members WHERE workspace_id = ? AND status = 'active'")
          .get(workspaceId) as { c: number }
      ).c;
      db.prepare('UPDATE subscriptions SET seat_count = ?, updated_at = ? WHERE workspace_id = ?').run(
        memberCount,
        now,
        workspaceId
      );

      writeAuditEvent(db, {
        workspaceId,
        actorUserId: req.authUser!.id,
        eventType: 'MEMBER_ROLE_UPDATED',
        severity: 'info',
        outcome: 'success',
        resourceType: 'workspace_member',
        resourceId: targetUser.id,
        detail: `Assigned role ${parsed.data.role} to ${targetUser.email}`,
        metadata: { email: targetUser.email, role: parsed.data.role },
      });

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
      const seatCheck = checkWorkspaceEntitlement(db, req.authorizedWorkspaceId!, {
        kind: 'seat_assign',
      });
      if (!seatCheck.allowed) {
        sendApiError(res, 403, seatCheck.code, seatCheck.message, req);
        return;
      }
      const invite = createWorkspaceInvitation(db, {
        workspaceId: req.authorizedWorkspaceId!,
        invitedByUserId: req.authUser!.id,
        email: parsed.data.email,
        role: parsed.data.role,
      });
      writeAuditEvent(db, {
        workspaceId: req.authorizedWorkspaceId!,
        actorUserId: req.authUser!.id,
        eventType: 'MEMBER_INVITED',
        severity: 'info',
        outcome: 'success',
        resourceType: 'invitation',
        resourceId: invite.id,
        detail: `Invited ${invite.email} as ${invite.role}`,
        metadata: { role: invite.role },
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
      const syncQuota = checkWorkspaceEntitlement(db, workspaceId, {
        kind: 'sync_push',
        opsCount: changes.length,
      });
      if (!syncQuota.allowed) {
        sendApiError(res, 403, syncQuota.code, syncQuota.message, req);
        return;
      }
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
      const vaultQuota = checkWorkspaceEntitlement(db, workspaceId, { kind: 'vault_upload' });
      if (!vaultQuota.allowed) {
        sendApiError(res, 403, vaultQuota.code, vaultQuota.message, req);
        return;
      }
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
    const headerKey =
      typeof req.headers['x-gemini-key'] === 'string' ? req.headers['x-gemini-key'].trim() : undefined;

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
      const aiQuota = checkWorkspaceEntitlement(db, requestedWorkspaceId, {
        kind: 'ai_generate',
        estimatedChars: parsed.data.prompt.length + (parsed.data.context?.length ?? 0),
      });
      if (!aiQuota.allowed) {
        sendApiError(res, 403, aiQuota.code, aiQuota.message, req);
        return;
      }
    } else if (!resolvedSession && !headerKey && process.env.GEMINI_API_KEY?.trim()) {
      sendApiError(
        res,
        401,
        'UNAUTHORIZED',
        'Authentication or x-gemini-key header required to use server-managed AI generation.',
        req
      );
      return;
    }

    try {
      const output = await generateWithServerGemini(db, {
        ...parsed.data,
        workspaceId: requestedWorkspaceId || undefined,
        sessionGeminiKey: headerKey,
        userId: resolvedSession?.user.id ?? req.authUser?.id,
      });
      if (requestedWorkspaceId && resolvedSession) {
        writeAuditEvent(db, {
          workspaceId: requestedWorkspaceId,
          actorUserId: resolvedSession.user.id,
          eventType: 'AI_GENERATED',
          severity: 'info',
          outcome: 'success',
          resourceType: 'ai_gateway',
          resourceId: parsed.data.agentId ?? 'copilot',
          detail: `Generated AI completion (${output.model})`,
          metadata: {
            provider: parsed.data.provider,
            model: output.model,
            latencyMs: output.latencyMs,
          },
        });
      }
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
      const webhookQuota = checkWorkspaceEntitlement(db, req.authorizedWorkspaceId!, {
        kind: 'webhook_create',
      });
      if (!webhookQuota.allowed) {
        sendApiError(res, 403, webhookQuota.code, webhookQuota.message, req);
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

  router.get(
    '/billing/entitlements/:workspaceId',
    requireAuth,
    requireWorkspaceRole(db, ALL_MEMBER_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const snapshot = getWorkspaceEntitlementSnapshot(db, req.authorizedWorkspaceId!);
      if (!snapshot) {
        sendApiError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.', req);
        return;
      }
      res.json({ ok: true, entitlements: snapshot });
    }
  );

  router.get(
    '/billing/support-requests/:workspaceId',
    requireAuth,
    requireWorkspaceRole(db, ALL_MEMBER_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const rows = db
        .prepare(
          `SELECT id, workspace_id AS workspaceId, user_id AS userId, category, subject, details, status, created_at AS createdAt
           FROM support_requests WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100`
        )
        .all(req.authorizedWorkspaceId!);
      res.json({ ok: true, supportRequests: rows });
    }
  );

  router.patch(
    '/billing/support-requests/:workspaceId/:requestId',
    requireAuth,
    requireWorkspaceRole(db, ADMIN_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const schema = z.object({ status: z.enum(['open', 'in_progress', 'resolved']) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(res, 400, 'VALIDATION_ERROR', 'Valid status required.', req);
        return;
      }
      const result = db
        .prepare('UPDATE support_requests SET status = ? WHERE id = ? AND workspace_id = ?')
        .run(parsed.data.status, String(req.params.requestId), req.authorizedWorkspaceId!);
      if (Number(result.changes ?? 0) === 0) {
        sendApiError(res, 404, 'NOT_FOUND', 'Support request not found.', req);
        return;
      }
      res.json({ ok: true, status: parsed.data.status });
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
    if (parsed.data.workspaceId !== 'local-workspace') {
      const wsExists = db
        .prepare('SELECT id FROM workspaces WHERE id = ?')
        .get(parsed.data.workspaceId) as { id: string } | undefined;
      if (!wsExists) {
        sendApiError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found for portal audit log.', req);
        return;
      }
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

  // --- Voice Notes ---

  router.get(
    '/voice-notes/:workspaceId',
    requireAuth,
    requireWorkspaceRole(db, ALL_MEMBER_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const workspaceId = req.authorizedWorkspaceId!;
      const parentType = typeof req.query.parentType === 'string' ? req.query.parentType : '';
      const parentId = typeof req.query.parentId === 'string' ? req.query.parentId : '';

      const where: string[] = ['workspace_id = ?'];
      const params: Array<string | number> = [workspaceId];
      if (parentType === 'project' || parentType === 'task') {
        where.push('parent_type = ?');
        params.push(parentType);
      }
      if (parentId) {
        where.push('parent_id = ?');
        params.push(parentId);
      }

      const notes = db
        .prepare(
          `SELECT id, workspace_id AS workspaceId, parent_type AS parentType, parent_id AS parentId,
                  title, mime_type AS mimeType, duration_seconds AS durationSeconds,
                  size_bytes AS sizeBytes, content_base64 AS contentBase64,
                  created_by AS createdBy, created_at AS createdAt
           FROM voice_notes
           WHERE ${where.join(' AND ')}
           ORDER BY created_at DESC`
        )
        .all(...params);
      res.json({ ok: true, voiceNotes: notes });
    }
  );

  router.post(
    '/voice-notes',
    requireAuth,
    requireWorkspaceRole(db, WRITE_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const schema = z.object({
        workspaceId: z.string().min(1),
        parentType: z.enum(['project', 'task']),
        parentId: z.string().trim().min(1).max(120),
        title: z.string().trim().min(1).max(160).default('Voice Note'),
        mimeType: z.string().trim().min(1).max(120),
        durationSeconds: z.number().min(0).max(3600).default(0),
        contentBase64: z.string().min(1).max(7_000_000),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid voice note payload.', req);
        return;
      }

      const baseMime = parsed.data.mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
      if (!VOICE_NOTE_ALLOWED_MIME_TYPES.includes(baseMime as (typeof VOICE_NOTE_ALLOWED_MIME_TYPES)[number])) {
        sendApiError(res, 400, 'UNSUPPORTED_MEDIA_TYPE', `Unsupported audio MIME type: ${parsed.data.mimeType}`, req);
        return;
      }

      const buf = Buffer.from(parsed.data.contentBase64, 'base64');
      if (buf.byteLength === 0 || buf.byteLength > VOICE_NOTE_MAX_BYTES) {
        sendApiError(res, 413, 'FILE_TOO_LARGE', `Voice note must be between 1 byte and ${VOICE_NOTE_MAX_BYTES} bytes.`, req);
        return;
      }

      const workspaceId = req.authorizedWorkspaceId!;
      const id = `vnt_${crypto.randomUUID()}`;
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO voice_notes (
           id, workspace_id, parent_type, parent_id, title, mime_type,
           duration_seconds, size_bytes, content_base64, created_by, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        workspaceId,
        parsed.data.parentType,
        parsed.data.parentId,
        parsed.data.title,
        parsed.data.mimeType,
        parsed.data.durationSeconds,
        buf.byteLength,
        parsed.data.contentBase64,
        req.authUser!.id,
        now
      );

      writeAuditEvent(db, {
        workspaceId,
        actorUserId: req.authUser!.id,
        eventType: 'VOICE_NOTE_CREATED',
        severity: 'info',
        outcome: 'success',
        resourceType: parsed.data.parentType,
        resourceId: parsed.data.parentId,
        detail: `Attached voice note "${parsed.data.title}" (${buf.byteLength} bytes).`,
        metadata: { voiceNoteId: id, mimeType: parsed.data.mimeType, sizeBytes: buf.byteLength },
      });

      res.status(201).json({
        ok: true,
        voiceNote: {
          id,
          workspaceId,
          parentType: parsed.data.parentType,
          parentId: parsed.data.parentId,
          title: parsed.data.title,
          mimeType: parsed.data.mimeType,
          durationSeconds: parsed.data.durationSeconds,
          sizeBytes: buf.byteLength,
          createdBy: req.authUser!.id,
          createdAt: now,
        },
      });
    }
  );

  router.delete(
    '/voice-notes/:workspaceId/:voiceNoteId',
    requireAuth,
    requireWorkspaceRole(db, WRITE_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const workspaceId = req.authorizedWorkspaceId!;
      const voiceNoteId = String(req.params.voiceNoteId);
      const result = db
        .prepare('DELETE FROM voice_notes WHERE id = ? AND workspace_id = ?')
        .run(voiceNoteId, workspaceId);
      if (Number(result.changes ?? 0) === 0) {
        sendApiError(res, 404, 'NOT_FOUND', 'Voice note not found in this workspace.', req);
        return;
      }

      writeAuditEvent(db, {
        workspaceId,
        actorUserId: req.authUser!.id,
        eventType: 'VOICE_NOTE_DELETED',
        severity: 'info',
        outcome: 'success',
        resourceType: 'voice_note',
        resourceId: voiceNoteId,
        detail: `Deleted voice note ${voiceNoteId}.`,
      });

      res.json({ ok: true, deleted: true });
    }
  );

  // --- Authoritative Invoice Calculation Verification ---

  router.post('/invoices/calculate', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      currency: z.string().trim().min(3).max(6).default('USD'),
      lineItems: z
        .array(
          z.object({
            id: z.string().default('item'),
            description: z.string().default(''),
            quantity: z.number().min(0).max(1_000_000),
            unitPrice: z.number().min(0).max(1_000_000_000),
          })
        )
        .max(200),
      discountType: z.enum(['none', 'percentage', 'fixed']).default('none'),
      discountValue: z.number().min(0).max(1_000_000_000).default(0),
      taxRate: z.number().min(0).max(100).default(0),
      taxInclusive: z.boolean().default(false),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      sendApiError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid invoice calculation payload.', req);
      return;
    }

    const decimals = getCurrencyDecimals(parsed.data.currency.toUpperCase());
    const totals = calculateDocumentTotals(
      {
        lineItems: parsed.data.lineItems,
        discountType: parsed.data.discountType,
        discountValue: parsed.data.discountValue,
        taxRate: parsed.data.taxRate,
        taxInclusive: parsed.data.taxInclusive,
      },
      decimals
    );
    res.json({
      ok: true,
      currency: parsed.data.currency.toUpperCase(),
      decimals,
      ...totals,
    });
  });

  // --- Centralized Audit Logs (Append-Only Read & Export) ---

  router.get(
    '/audit-logs/:workspaceId',
    requireAuth,
    requireWorkspaceRole(db, ADMIN_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const workspaceId = req.authorizedWorkspaceId!;
      const querySchema = z.object({
        eventType: z.string().max(80).optional(),
        outcome: z.string().max(40).optional(),
        severity: z.string().max(40).optional(),
        resourceType: z.string().max(80).optional(),
        actorUserId: z.string().max(120).optional(),
        from: z.string().max(64).optional(),
        to: z.string().max(64).optional(),
        search: z.string().max(160).optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
        offset: z.coerce.number().int().min(0).max(100_000).optional(),
      });
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) {
        sendApiError(res, 400, 'VALIDATION_ERROR', 'Invalid audit log filter parameters.', req);
        return;
      }

      const result = queryAuditLogs(db, {
        workspaceId,
        ...parsed.data,
      });
      res.json({ ok: true, total: result.total, logs: result.rows });
    }
  );

  router.get(
    '/audit-logs/:workspaceId/export',
    requireAuth,
    requireWorkspaceRole(db, ADMIN_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const workspaceId = req.authorizedWorkspaceId!;
      const format = req.query.format === 'json' ? 'json' : 'csv';
      const result = queryAuditLogs(db, {
        workspaceId,
        eventType: typeof req.query.eventType === 'string' ? req.query.eventType : undefined,
        outcome: typeof req.query.outcome === 'string' ? req.query.outcome : undefined,
        severity: typeof req.query.severity === 'string' ? req.query.severity : undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        limit: 200,
        offset: 0,
      });

      writeAuditEvent(db, {
        workspaceId,
        actorUserId: req.authUser!.id,
        eventType: 'DATA_EXPORTED',
        severity: 'info',
        outcome: 'success',
        resourceType: 'audit_logs',
        resourceId: workspaceId,
        detail: `Exported ${result.rows.length} workspace audit log record(s) as ${format.toUpperCase()}.`,
        metadata: { format, exportedCount: result.rows.length },
      });

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="solodesk-audit-${workspaceId}.json"`
        );
        res.send(JSON.stringify({ exportedAt: new Date().toISOString(), workspaceId, logs: result.rows }, null, 2));
        return;
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="solodesk-audit-${workspaceId}.csv"`
      );
      res.send(formatAuditLogsCsv(result.rows));
    }
  );

  router.post(
    '/audit-logs/:workspaceId/purge',
    requireAuth,
    requireWorkspaceRole(db, ADMIN_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const schema = z.object({ retentionDays: z.number().int().min(30).max(3650) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(res, 400, 'VALIDATION_ERROR', 'retentionDays must be between 30 and 3650.', req);
        return;
      }
      const workspaceId = req.authorizedWorkspaceId!;
      const outcome = purgeExpiredAuditLogs(db, workspaceId, parsed.data.retentionDays);
      writeAuditEvent(db, {
        workspaceId,
        actorUserId: req.authUser!.id,
        eventType: 'SECURITY_SETTING_CHANGED',
        severity: 'info',
        outcome: 'success',
        resourceType: 'audit_logs',
        resourceId: workspaceId,
        detail: `Purged ${outcome.deletedCount} audit log(s) older than ${parsed.data.retentionDays} days.`,
        metadata: { retentionDays: parsed.data.retentionDays, deletedCount: outcome.deletedCount },
      });
      res.json({ ok: true, ...outcome });
    }
  );

  // --- Privacy Consents Server Parity ---

  router.get(
    '/privacy/consents/:workspaceId',
    requireAuth,
    requireWorkspaceRole(db, ALL_MEMBER_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const rows = db
        .prepare(
          `SELECT id, workspace_id AS workspaceId, consent_type AS consentType,
                  granted, version, updated_by_user_id AS updatedByUserId, updated_at AS updatedAt
           FROM privacy_consents WHERE workspace_id = ? ORDER BY consent_type ASC`
        )
        .all(req.authorizedWorkspaceId!) as Array<{
        id: string;
        workspaceId: string;
        consentType: string;
        granted: number;
        version: string;
        updatedByUserId: string;
        updatedAt: string;
      }>;
      res.json({
        ok: true,
        consents: rows.map((r) => ({ ...r, granted: Boolean(r.granted) })),
      });
    }
  );

  router.put(
    '/privacy/consents/:workspaceId',
    requireAuth,
    requireWorkspaceRole(db, ADMIN_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const schema = z.object({
        consentType: z.enum(['local_storage', 'ai_processing', 'cloud_sync', 'crash_telemetry']),
        granted: z.boolean(),
        version: z.string().trim().min(1).max(32).default('1.0'),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid consent payload.', req);
        return;
      }
      const workspaceId = req.authorizedWorkspaceId!;
      const now = new Date().toISOString();
      const id = `con_${crypto.randomUUID()}`;
      db.prepare(
        `INSERT INTO privacy_consents (id, workspace_id, consent_type, granted, version, updated_by_user_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, consent_type) DO UPDATE SET
           granted = excluded.granted,
           version = excluded.version,
           updated_by_user_id = excluded.updated_by_user_id,
           updated_at = excluded.updated_at`
      ).run(
        id,
        workspaceId,
        parsed.data.consentType,
        parsed.data.granted ? 1 : 0,
        parsed.data.version,
        req.authUser!.id,
        now
      );

      writeAuditEvent(db, {
        workspaceId,
        actorUserId: req.authUser!.id,
        eventType: 'PRIVACY_CONSENT_UPDATED',
        severity: 'info',
        outcome: 'success',
        resourceType: 'privacy_consent',
        resourceId: parsed.data.consentType,
        detail: `Consent ${parsed.data.consentType} set to ${parsed.data.granted ? 'granted' : 'revoked'} (v${parsed.data.version}).`,
        metadata: { consentType: parsed.data.consentType, granted: parsed.data.granted, version: parsed.data.version },
      });

      const saved = db
        .prepare(
          `SELECT id, workspace_id AS workspaceId, consent_type AS consentType,
                  granted, version, updated_by_user_id AS updatedByUserId, updated_at AS updatedAt
           FROM privacy_consents WHERE workspace_id = ? AND consent_type = ?`
        )
        .get(workspaceId, parsed.data.consentType) as { granted: number };

      res.json({ ok: true, consent: { ...saved, granted: Boolean(saved.granted) } });
    }
  );

  // --- Integration Connections ---

  router.get('/integrations/provider-status', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
    res.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      providers: getExternalProviderReadiness(),
    });
  });

  router.get(
    '/integrations/:workspaceId',
    requireAuth,
    requireWorkspaceRole(db, ALL_MEMBER_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const workspaceId = req.authorizedWorkspaceId!;
      const rows = db
        .prepare(
          `SELECT id, workspace_id AS workspaceId, provider, category, display_name AS displayName,
                  status, account_label AS accountLabel, endpoint_url AS endpointUrl,
                  scopes_json AS scopesJson, config_json AS configJson,
                  last_checked_at AS lastCheckedAt, last_error AS lastError,
                  created_at AS createdAt, updated_at AS updatedAt
           FROM integration_connections
           WHERE workspace_id = ?
           ORDER BY updated_at DESC`
        )
        .all(workspaceId);
      res.json({ ok: true, integrations: rows });
    }
  );

  router.post(
    '/integrations/:workspaceId',
    requireAuth,
    requireWorkspaceRole(db, ADMIN_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const workspaceId = req.authorizedWorkspaceId!;
      const schema = z.object({
        provider: z.string().trim().min(2).max(60),
        category: z.enum(['calendar', 'email', 'webhook', 'ai', 'payment', 'automation']).default('automation'),
        displayName: z.string().trim().min(1).max(120),
        status: z.enum(['connected', 'disconnected', 'blocked_credentials', 'error']).default('disconnected'),
        accountLabel: z.string().max(160).default(''),
        endpointUrl: z.string().max(1000).default(''),
        scopesJson: z.string().max(4000).default('[]'),
        configJson: z.string().max(8000).default('{}'),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid integration payload.', req);
        return;
      }

      let normalizedEndpoint = '';
      if (parsed.data.endpointUrl.trim()) {
        const urlCheck = validatePublicHttpUrl(parsed.data.endpointUrl);
        if (!urlCheck.valid || !urlCheck.normalizedUrl) {
          sendApiError(res, 400, 'SSRF_POLICY_BLOCKED', urlCheck.reason ?? 'Blocked unsafe integration URL.', req);
          return;
        }
        normalizedEndpoint = urlCheck.normalizedUrl;
      }

      const now = new Date().toISOString();
      const id = `int_${crypto.randomUUID()}`;
      db.prepare(
        `INSERT INTO integration_connections (
           id, workspace_id, provider, category, display_name, status,
           account_label, endpoint_url, scopes_json, config_json,
           last_checked_at, last_error, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)
         ON CONFLICT(workspace_id, provider) DO UPDATE SET
           category = excluded.category,
           display_name = excluded.display_name,
           status = excluded.status,
           account_label = excluded.account_label,
           endpoint_url = excluded.endpoint_url,
           scopes_json = excluded.scopes_json,
           config_json = excluded.config_json,
           last_checked_at = excluded.last_checked_at,
           last_error = '',
           updated_at = excluded.updated_at`
      ).run(
        id,
        workspaceId,
        parsed.data.provider,
        parsed.data.category,
        parsed.data.displayName,
        parsed.data.status,
        parsed.data.accountLabel,
        normalizedEndpoint,
        parsed.data.scopesJson,
        parsed.data.configJson,
        now,
        now,
        now
      );

      const saved = db
        .prepare(
          `SELECT id, workspace_id AS workspaceId, provider, category, display_name AS displayName,
                  status, account_label AS accountLabel, endpoint_url AS endpointUrl,
                  last_checked_at AS lastCheckedAt, updated_at AS updatedAt
           FROM integration_connections WHERE workspace_id = ? AND provider = ?`
        )
        .get(workspaceId, parsed.data.provider);

      writeAuditEvent(db, {
        workspaceId,
        actorUserId: req.authUser!.id,
        eventType: 'INTEGRATION_UPDATED',
        severity: 'info',
        outcome: 'success',
        resourceType: 'integration',
        resourceId: parsed.data.provider,
        detail: `Updated integration ${parsed.data.displayName} (${parsed.data.status}).`,
      });

      res.status(201).json({ ok: true, integration: saved });
    }
  );

  router.post(
    '/integrations/:workspaceId/:integrationId/retry',
    requireAuth,
    requireWorkspaceRole(db, ADMIN_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const workspaceId = req.authorizedWorkspaceId!;
      const integrationId = String(req.params.integrationId);
      const existing = db
        .prepare('SELECT id, provider, endpoint_url AS endpointUrl FROM integration_connections WHERE id = ? AND workspace_id = ?')
        .get(integrationId, workspaceId) as { id: string; provider: string; endpointUrl: string } | undefined;
      if (!existing) {
        sendApiError(res, 404, 'NOT_FOUND', 'Integration not found in this workspace.', req);
        return;
      }
      const nextStatus = existing.endpointUrl ? 'connected' : 'blocked_credentials';
      const now = new Date().toISOString();
      db.prepare(
        'UPDATE integration_connections SET status = ?, last_checked_at = ?, last_error = ?, updated_at = ? WHERE id = ? AND workspace_id = ?'
      ).run(nextStatus, now, '', now, integrationId, workspaceId);

      res.json({ ok: true, status: nextStatus, checkedAt: now });
    }
  );

  router.post(
    '/integrations/:workspaceId/:integrationId/disconnect',
    requireAuth,
    requireWorkspaceRole(db, ADMIN_ROLES),
    (req: AuthenticatedRequest, res: Response) => {
      const workspaceId = req.authorizedWorkspaceId!;
      const integrationId = String(req.params.integrationId);
      const now = new Date().toISOString();
      const result = db
        .prepare(
          `UPDATE integration_connections
           SET status = 'disconnected', endpoint_url = '', account_label = '', updated_at = ?
           WHERE id = ? AND workspace_id = ?`
        )
        .run(now, integrationId, workspaceId);
      if (Number(result.changes ?? 0) === 0) {
        sendApiError(res, 404, 'NOT_FOUND', 'Integration not found in this workspace.', req);
        return;
      }
      res.json({ ok: true, status: 'disconnected' });
    }
  );

  // --- Billing Checkout Readiness & Signed Payment Webhooks ---

  router.post(
    '/billing/checkout-session',
    requireAuth,
    requireWorkspaceRole(db, FINANCE_ROLES),
    async (req: AuthenticatedRequest, res: Response) => {
      const schema = z.object({
        workspaceId: z.string().min(1),
        targetTier: z.enum(['free', 'pro', 'ultimate', 'business', 'enterprise']),
        preferredProvider: z.enum(['stripe', 'safepay', 'payfast']).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(res, 400, 'VALIDATION_ERROR', 'Valid targetTier is required.', req);
        return;
      }

      const outcome = await initiateExternalCheckoutSession({
        workspaceId: req.authorizedWorkspaceId!,
        targetTier: parsed.data.targetTier,
        preferredProvider: parsed.data.preferredProvider,
      });

      if (!outcome.ok) {
        sendApiError(res, outcome.status, outcome.code, outcome.message, req);
        return;
      }

      res.json({
        ok: true,
        checkoutStatus: outcome.checkoutStatus,
        provider: outcome.provider,
        sessionId: outcome.sessionId,
        checkoutUrl: outcome.checkoutUrl,
        targetTier: parsed.data.targetTier,
        message: outcome.message,
      });
    }
  );

  router.post('/billing/webhook/:provider', (req: Request, res: Response) => {
    const webhookSecret = process.env.BILLING_WEBHOOK_SECRET?.trim();
    if (!webhookSecret) {
      sendApiError(
        res,
        501,
        'BILLING_WEBHOOK_NOT_CONFIGURED',
        'BILLING_WEBHOOK_SECRET is not configured on this server.',
        req
      );
      return;
    }

    const signatureHeader = String(
      req.headers['x-billing-signature'] ?? req.headers['stripe-signature'] ?? ''
    ).trim();
    const rawBuf = (req as Request & { rawBody?: Buffer }).rawBody;
    const rawBodyStr = rawBuf ? rawBuf.toString('utf8') : JSON.stringify(req.body ?? {});
    const validSignature = verifyRawBodyHmacSignature({
      rawPayload: rawBuf ?? rawBodyStr,
      signatureHeader,
      secret: webhookSecret,
    });

    if (!validSignature) {
      sendApiError(res, 401, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid billing webhook signature.', req);
      return;
    }

    const schema = z.object({
      eventId: z.string().min(1).max(160),
      workspaceId: z.string().min(1).max(120),
      planTier: z.enum(['free', 'pro', 'ultimate', 'business', 'enterprise']).default('pro'),
      billingStatus: z.string().min(1).max(60).default('active'),
      amountCents: z.number().int().min(0).default(0),
      currency: z.string().min(3).max(8).default('USD'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      sendApiError(res, 400, 'VALIDATION_ERROR', 'Malformed billing webhook payload.', req);
      return;
    }

    const wsRow = db
      .prepare('SELECT id FROM workspaces WHERE id = ?')
      .get(parsed.data.workspaceId) as { id: string } | undefined;
    if (!wsRow) {
      sendApiError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found for billing webhook.', req);
      return;
    }

    const provider = String(req.params.provider).slice(0, 60);
    const existing = db
      .prepare('SELECT id FROM payment_webhook_events WHERE provider = ? AND provider_event_id = ?')
      .get(provider, parsed.data.eventId);
    if (existing) {
      res.json({ ok: true, idempotentReplay: true, eventId: parsed.data.eventId });
      return;
    }

    const normalizedStatus = parsed.data.billingStatus.toLowerCase();
    const effectiveTier: ServerPlanTier =
      normalizedStatus === 'cancelled' ||
      normalizedStatus === 'canceled' ||
      normalizedStatus === 'refunded' ||
      normalizedStatus === 'expired'
        ? 'free'
        : parsed.data.planTier;

    const now = new Date().toISOString();
    const eventRowId = `pwe_${crypto.randomUUID()}`;
    db.exec('BEGIN IMMEDIATE;');
    try {
      db.prepare(
        `INSERT INTO payment_webhook_events (
           id, workspace_id, provider, provider_event_id, amount_cents, currency, verified, payload_json, received_at
         ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
      ).run(
        eventRowId,
        parsed.data.workspaceId,
        provider,
        parsed.data.eventId,
        parsed.data.amountCents,
        parsed.data.currency,
        rawBodyStr,
        now
      );

      db.prepare('UPDATE workspaces SET plan_tier = ?, updated_at = ? WHERE id = ?').run(
        effectiveTier,
        now,
        parsed.data.workspaceId
      );

      db.prepare(
        `UPDATE subscriptions
         SET plan_tier = ?, billing_provider = ?, billing_status = ?, updated_at = ?
         WHERE workspace_id = ?`
      ).run(
        effectiveTier,
        provider,
        parsed.data.billingStatus,
        now,
        parsed.data.workspaceId
      );

      writeAuditEvent(db, {
        workspaceId: parsed.data.workspaceId,
        actorUserId: 'billing-webhook',
        eventType: 'BILLING_EVENT_PROCESSED',
        severity: effectiveTier === 'free' && parsed.data.planTier !== 'free' ? 'warning' : 'info',
        outcome: 'success',
        resourceType: 'subscription',
        resourceId: parsed.data.workspaceId,
        detail: `Processed ${provider} billing event ${parsed.data.eventId} -> ${effectiveTier} (${parsed.data.billingStatus}).`,
        metadata: {
          provider,
          eventId: parsed.data.eventId,
          requestedPlanTier: parsed.data.planTier,
          effectivePlanTier: effectiveTier,
          billingStatus: parsed.data.billingStatus,
        },
      });

      db.exec('COMMIT;');
    } catch (err) {
      try {
        db.exec('ROLLBACK;');
      } catch {
        // Ignore rollback failure if already aborted
      }
      throw err;
    }

    res.json({
      ok: true,
      processed: true,
      eventId: parsed.data.eventId,
      planTier: effectiveTier,
      billingStatus: parsed.data.billingStatus,
    });
  });

  router.use((_req: Request, res: Response) => {
    sendApiError(res, 404, 'ROUTE_NOT_FOUND', 'API v1 endpoint not found.');
  });

  return router;
}
