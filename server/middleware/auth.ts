import type { NextFunction, Request, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { WorkspaceMemberRole } from '../../src/services/cloudSyncService';
import { getMemberRole, resolveSessionUser, type AuthUser } from '../auth/authService';

export const SESSION_COOKIE_NAME = 'solodesk_session';

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
  authSessionId?: string;
  workspaceRole?: WorkspaceMemberRole;
  authorizedWorkspaceId?: string;
  requestId?: string;
}

export function extractSessionToken(req: Request): string {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }

  const cookieHeader = req.headers.cookie;
  if (typeof cookieHeader === 'string') {
    const parts = cookieHeader.split(';');
    for (const part of parts) {
      const [name, ...rest] = part.trim().split('=');
      if (name === SESSION_COOKIE_NAME) {
        return decodeURIComponent(rest.join('='));
      }
    }
  }
  return '';
}

export function sendApiError(
  res: Response,
  status: number,
  code: string,
  message: string,
  req?: Request
): void {
  res.status(status).json({
    ok: false,
    error: {
      code,
      message,
      requestId: (req as AuthenticatedRequest | undefined)?.requestId,
    },
  });
}

export function createRequireAuthMiddleware(db: DatabaseSync) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const token = extractSessionToken(req);
    const resolved = resolveSessionUser(db, token);
    if (!resolved) {
      sendApiError(res, 401, 'UNAUTHORIZED', 'Valid authenticated session required.', req);
      return;
    }
    req.authUser = resolved.user;
    req.authSessionId = resolved.sessionId;
    next();
  };
}

function resolveCanonicalWorkspaceId(
  req: Request
): { ok: true; workspaceId: string } | { ok: false; code: string; message: string } {
  const rawBodyWs = (req.body as Record<string, unknown> | undefined)?.workspaceId;
  const rawQueryWs = req.query?.workspaceId;

  if (rawBodyWs !== undefined && typeof rawBodyWs !== 'string') {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'workspaceId in body must be a string.' };
  }
  if (rawQueryWs !== undefined && typeof rawQueryWs !== 'string') {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'workspaceId query parameter must be a single string.' };
  }

  const paramWs = typeof req.params.workspaceId === 'string' ? req.params.workspaceId.trim() : '';
  const bodyWs = typeof rawBodyWs === 'string' ? rawBodyWs.trim() : '';
  const queryWs = typeof rawQueryWs === 'string' ? rawQueryWs.trim() : '';

  const provided = Array.from(new Set([paramWs, bodyWs, queryWs].filter(Boolean)));
  if (provided.length > 1) {
    return {
      ok: false,
      code: 'TENANT_PARAM_MISMATCH',
      message: 'Conflicting workspaceId values supplied across request parameters.',
    };
  }

  return { ok: true, workspaceId: provided[0] ?? '' };
}

export function requireWorkspaceRole(
  db: DatabaseSync,
  allowedRoles: WorkspaceMemberRole[],
  resolveWorkspaceId?: (req: Request) => string
) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      sendApiError(res, 401, 'UNAUTHORIZED', 'Authentication required.', req);
      return;
    }

    let workspaceId = '';
    if (resolveWorkspaceId) {
      workspaceId = resolveWorkspaceId(req).trim();
    } else {
      const resolved = resolveCanonicalWorkspaceId(req);
      if (!resolved.ok) {
        sendApiError(res, 400, resolved.code, resolved.message, req);
        return;
      }
      workspaceId = resolved.workspaceId;
    }

    if (!workspaceId) {
      sendApiError(res, 400, 'VALIDATION_ERROR', 'workspaceId is required.', req);
      return;
    }

    const role = getMemberRole(db, workspaceId, req.authUser.id);
    if (!role) {
      sendApiError(
        res,
        403,
        'TENANT_ACCESS_DENIED',
        'You do not have active membership in the requested workspace.',
        req
      );
      return;
    }

    if (!allowedRoles.includes(role)) {
      sendApiError(
        res,
        403,
        'INSUFFICIENT_ROLE',
        `Role "${role}" is not authorized for this operation.`,
        req
      );
      return;
    }

    req.workspaceRole = role;
    req.authorizedWorkspaceId = workspaceId;
    next();
  };
}
