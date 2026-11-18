import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { WorkspaceMemberRole } from '../../src/services/cloudSyncService';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 8;

interface RateAttemptState {
  count: number;
  resetAt: number;
}

const failedLoginAttempts = new Map<string, RateAttemptState>();

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function isRateLimited(rateKey: string): boolean {
  const now = Date.now();
  const state = failedLoginAttempts.get(rateKey);
  if (!state) return false;
  if (now > state.resetAt) {
    failedLoginAttempts.delete(rateKey);
    return false;
  }
  return state.count >= MAX_FAILED_ATTEMPTS;
}

function recordFailedAttempt(rateKey: string): void {
  const now = Date.now();
  const state = failedLoginAttempts.get(rateKey);
  if (!state || now > state.resetAt) {
    failedLoginAttempts.set(rateKey, { count: 1, resetAt: now + RATE_WINDOW_MS });
  } else {
    state.count += 1;
  }
}

export function clearRateLimitForTest(): void {
  failedLoginAttempts.clear();
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface AuthSessionResult {
  user: AuthUser;
  sessionToken: string;
  sessionId: string;
  expiresAt: string;
  defaultWorkspaceId: string;
}

export function registerUser(
  db: DatabaseSync,
  input: {
    email: string;
    password: string;
    displayName: string;
    ipAddress?: string;
    userAgent?: string;
  }
): AuthSessionResult {
  const email = input.email.trim().toLowerCase();
  const existing = db
    .prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL')
    .get(email) as { id: string } | undefined;
  if (existing) {
    throw new Error('ACCOUNT_EXISTS');
  }

  const now = new Date().toISOString();
  const userId = `usr_${crypto.randomUUID()}`;
  const workspaceId = `ws_${crypto.randomUUID()}`;
  const slug = `studio-${userId.slice(-8)}`;
  const passwordHash = hashPassword(input.password);

  db.exec('BEGIN;');
  try {
    db.prepare(
      'INSERT INTO users (id, email, display_name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, email, input.displayName.trim(), passwordHash, now, now);

    db.prepare(
      'INSERT INTO workspaces (id, slug, name, owner_user_id, plan_tier, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(workspaceId, slug, `${input.displayName.trim()} Workspace`, userId, 'free', now, now);

    db.prepare(
      'INSERT INTO workspace_members (id, workspace_id, user_id, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(`wm_${crypto.randomUUID()}`, workspaceId, userId, 'owner', 'active', now);

    db.prepare(
      'INSERT INTO subscriptions (workspace_id, plan_tier, billing_provider, billing_status, seat_count, ai_tokens_used_month, sync_ops_month, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(workspaceId, 'free', 'none_configured', 'free_active', 1, 0, 0, now);

    db.prepare(
      'INSERT INTO audit_logs (id, workspace_id, actor_user_id, event_type, severity, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      `aud_${crypto.randomUUID()}`,
      workspaceId,
      userId,
      'user_registered',
      'info',
      `Registered workspace owner account ${email}`,
      now
    );

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  const session = createSession(db, userId, input.ipAddress ?? '', input.userAgent ?? '');
  return {
    user: {
      id: userId,
      email,
      displayName: input.displayName.trim(),
      createdAt: now,
    },
    ...session,
    defaultWorkspaceId: workspaceId,
  };
}

export function loginUser(
  db: DatabaseSync,
  input: {
    email: string;
    password: string;
    ipAddress?: string;
    userAgent?: string;
  }
): AuthSessionResult {
  const email = input.email.trim().toLowerCase();
  const rateKey = `${input.ipAddress ?? 'unknown'}:${email}`;
  if (isRateLimited(rateKey)) {
    throw new Error('RATE_LIMITED');
  }

  const row = db
    .prepare(
      'SELECT id, email, display_name, password_hash, created_at FROM users WHERE email = ? AND deleted_at IS NULL'
    )
    .get(email) as
    | { id: string; email: string; display_name: string; password_hash: string; created_at: string }
    | undefined;

  const now = new Date().toISOString();
  if (!row || !verifyPassword(input.password, row.password_hash)) {
    recordFailedAttempt(rateKey);
    db.prepare(
      'INSERT INTO login_history (id, email, user_id, success, ip_address, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(`lh_${crypto.randomUUID()}`, email, row?.id ?? '', 0, input.ipAddress ?? '', 'invalid_credentials', now);
    throw new Error('INVALID_CREDENTIALS');
  }

  failedLoginAttempts.delete(rateKey);
  db.prepare(
    'INSERT INTO login_history (id, email, user_id, success, ip_address, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(`lh_${crypto.randomUUID()}`, email, row.id, 1, input.ipAddress ?? '', 'authenticated', now);

  const ws = db
    .prepare(
      'SELECT workspace_id FROM workspace_members WHERE user_id = ? AND status = ? ORDER BY created_at ASC LIMIT 1'
    )
    .get(row.id, 'active') as { workspace_id: string } | undefined;

  const session = createSession(db, row.id, input.ipAddress ?? '', input.userAgent ?? '');
  return {
    user: {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      createdAt: row.created_at,
    },
    ...session,
    defaultWorkspaceId: ws?.workspace_id ?? '',
  };
}

function createSession(
  db: DatabaseSync,
  userId: string,
  ipAddress: string,
  userAgent: string
): { sessionToken: string; sessionId: string; expiresAt: string } {
  const rawToken = `sd_${crypto.randomBytes(32).toString('hex')}`;
  const tokenHash = hashSessionToken(rawToken);
  const sessionId = `ses_${crypto.randomUUID()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

  db.prepare(
    'INSERT INTO sessions (id, user_id, token_hash, ip_address, user_agent, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(sessionId, userId, tokenHash, ipAddress, userAgent.slice(0, 200), expiresAt, now.toISOString());

  return { sessionToken: rawToken, sessionId, expiresAt };
}

export function resolveSessionUser(
  db: DatabaseSync,
  rawToken: string
): { user: AuthUser; sessionId: string } | null {
  if (!rawToken || !rawToken.startsWith('sd_')) return null;
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date().toISOString();
  const row = db
    .prepare(
      `SELECT s.id AS session_id, s.expires_at, s.revoked_at, u.id AS user_id, u.email, u.display_name, u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND u.deleted_at IS NULL`
    )
    .get(tokenHash) as
    | {
        session_id: string;
        expires_at: string;
        revoked_at: string | null;
        user_id: string;
        email: string;
        display_name: string;
        created_at: string;
      }
    | undefined;

  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.expires_at <= now) return null;

  return {
    sessionId: row.session_id,
    user: {
      id: row.user_id,
      email: row.email,
      displayName: row.display_name,
      createdAt: row.created_at,
    },
  };
}

export function revokeSession(db: DatabaseSync, sessionId: string, userId: string): boolean {
  const result = db
    .prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL')
    .run(new Date().toISOString(), sessionId, userId);
  return Number(result.changes) > 0;
}

export function getMemberRole(
  db: DatabaseSync,
  workspaceId: string,
  userId: string
): WorkspaceMemberRole | null {
  const row = db
    .prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ? AND status = ?')
    .get(workspaceId, userId, 'active') as { role: WorkspaceMemberRole } | undefined;
  return row?.role ?? null;
}

export function deleteUserAccount(db: DatabaseSync, userId: string): void {
  const now = new Date().toISOString();
  db.exec('BEGIN;');
  try {
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ?').run(now, userId);
    db.prepare(
      'UPDATE users SET deleted_at = ?, email = ?, display_name = ?, password_hash = ?, updated_at = ? WHERE id = ?'
    ).run(now, `deleted_${userId}@redacted.invalid`, 'Deleted User', 'redacted', now, userId);
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

export function requestPasswordReset(
  db: DatabaseSync,
  emailInput: string
): { issued: boolean; resetToken?: string; expiresAt?: string } {
  const email = emailInput.trim().toLowerCase();
  const user = db
    .prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL')
    .get(email) as { id: string } | undefined;

  if (!user) {
    return { issued: false };
  }

  const rawToken = `sdr_${crypto.randomBytes(24).toString('hex')}`;
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(`prt_${crypto.randomUUID()}`, user.id, tokenHash, expiresAt, now.toISOString());

  return { issued: true, resetToken: rawToken, expiresAt };
}

export function confirmPasswordReset(
  db: DatabaseSync,
  rawToken: string,
  newPassword: string
): boolean {
  if (!rawToken.startsWith('sdr_') || newPassword.length < 8) return false;
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date().toISOString();

  const row = db
    .prepare(
      `SELECT id, user_id, expires_at, used_at
       FROM password_reset_tokens
       WHERE token_hash = ?`
    )
    .get(tokenHash) as
    | { id: string; user_id: string; expires_at: string; used_at: string | null }
    | undefined;

  if (!row || row.used_at || row.expires_at <= now) return false;

  const nextHash = hashPassword(newPassword);
  db.exec('BEGIN;');
  try {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      nextHash,
      now,
      row.user_id
    );
    db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').run(now, row.id);
    // Revoke all active sessions on password reset
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(
      now,
      row.user_id
    );
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
  return true;
}

export function createWorkspaceInvitation(
  db: DatabaseSync,
  input: {
    workspaceId: string;
    invitedByUserId: string;
    email: string;
    role: Exclude<WorkspaceMemberRole, 'owner'>;
  }
): { id: string; inviteToken: string; expiresAt: string; email: string; role: string } {
  const email = input.email.trim().toLowerCase();
  const id = `inv_${crypto.randomUUID()}`;
  const rawToken = `sdi_${crypto.randomBytes(24).toString('hex')}`;
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO workspace_invitations (id, workspace_id, email, role, token_hash, invited_by_user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.workspaceId,
    email,
    input.role,
    tokenHash,
    input.invitedByUserId,
    expiresAt,
    now.toISOString()
  );

  return { id, inviteToken: rawToken, expiresAt, email, role: input.role };
}

export function acceptWorkspaceInvitation(
  db: DatabaseSync,
  input: { inviteToken: string; userId: string; userEmail: string }
): { ok: boolean; workspaceId?: string; role?: string } {
  if (!input.inviteToken.startsWith('sdi_')) return { ok: false };
  const tokenHash = hashSessionToken(input.inviteToken);
  const now = new Date().toISOString();

  const row = db
    .prepare(
      `SELECT id, workspace_id, email, role, expires_at, accepted_at
       FROM workspace_invitations
       WHERE token_hash = ?`
    )
    .get(tokenHash) as
    | {
        id: string;
        workspace_id: string;
        email: string;
        role: string;
        expires_at: string;
        accepted_at: string | null;
      }
    | undefined;

  if (!row || row.accepted_at || row.expires_at <= now) return { ok: false };
  if (row.email.toLowerCase() !== input.userEmail.trim().toLowerCase()) return { ok: false };

  db.exec('BEGIN;');
  try {
    db.prepare(
      `INSERT INTO workspace_members (id, workspace_id, user_id, role, status, created_at)
       VALUES (?, ?, ?, ?, 'active', ?)
       ON CONFLICT(workspace_id, user_id) DO UPDATE SET role = excluded.role, status = 'active'`
    ).run(`wm_${crypto.randomUUID()}`, row.workspace_id, input.userId, row.role, now);

    db.prepare('UPDATE workspace_invitations SET accepted_at = ? WHERE id = ?').run(now, row.id);
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  return { ok: true, workspaceId: row.workspace_id, role: row.role };
}
