import type { NextFunction, Request, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { WorkspaceMemberRole } from '../../src/services/cloudSyncService';
import { getMemberRole, resolveSessionUser, type AuthUser } from '../auth/authService';

export const SESSION_COOKIE_NAME = 'solodesk_session';

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
  authSessionId?: string;
  workspaceRole?: WorkspaceMemberRole;
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

export function requireWorkspaceRole(
  db: DatabaseSync,
  allowedRoles: WorkspaceMemberRole[],
  resolveWorkspaceId: (req: Request) => string = (req) =>
    String(req.params.workspaceId || req.body?.workspaceId || req.query?.workspaceId || '')
) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      sendApiError(res, 401, 'UNAUTHORIZED', 'Authentication required.', req);
      return;
    }
    const workspaceId = resolveWorkspaceId(req).trim();
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
    next();
  };
}
